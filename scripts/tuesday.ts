// scripts/tuesday.ts
// The weekly job. Runs every Tuesday via GitHub Actions.
// Reads the harness, calls Claude, validates, deploys, notifies.

import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join, dirname, normalize, resolve } from 'path'
import { spawnSync } from 'child_process'
import { generateTimelineAndFeed } from './timeline'
import { contentReview, ReviewResult } from './review'
import { runMarketing, MarketingPayload, MarketingResult } from './marketing'
import { callLLM } from './llm'

const ROOT = process.cwd()
const TODAY = new Date().toISOString().slice(0, 10)
const DEFAULT_MODEL = process.env.MODEL ?? 'claude-opus-4-7'
const DRY_RUN = process.env.DRY_RUN === 'true'

const OUTPUT_START = '<<<OUTPUT_START>>>'
const OUTPUT_END = '<<<OUTPUT_END>>>'

interface GeneratedFile { path: string; content: string }

interface GeneratedMarketing {
  headline: string
  postShort: string
  postMedium: string
  postLong: string
  imageAlt: string
  hashtags: string[]
}

interface GeneratedVisitorQuestion {
  prompt: string
  kind: 'open' | 'choice'
  options?: string[]
  placeholder?: string
  rationale: string
}

interface GeneratedIteration {
  version: number
  brief: string
  evaluationMetric: string
  files: GeneratedFile[]
  memoryEntry: string
  evaluationEntry: string
  notes: string
  marketing: GeneratedMarketing
  visitorQuestion?: GeneratedVisitorQuestion
  modelForNextWeek?: string
}

interface Directive {
  path: string
  content: string
  model?: string
  marketingSkip?: boolean
}

interface Context {
  rules: string
  manifesto: string
  morality: string
  evaluation: string
  memory: string
  marketing: string
  recentMemoryEntries: string
  pendingDirective: Directive | null
  assetsManifest: string
  assetPaths: Set<string>
  analyticsSummary: string
  previousIterationDate: string | null
  previousHadQuestion: boolean
  nextVersion: number
  model: string
}

async function main() {
  log(`Tuesday job starting for ${TODAY} (dry=${DRY_RUN})`)

  const context = await readContext()
  log(`v${context.nextVersion} — previous iteration: ${context.previousIterationDate ?? 'none'} — model: ${context.model}`)

  if (context.previousIterationDate) {
    // Belt-and-braces: re-snapshot the previous iteration in case the end-of-run snapshot ever failed.
    await snapshotIteration(context.previousIterationDate)
  }

  let generated = await generate(context)

  try {
    await validateAndReview(generated, context)
  } catch (firstErr) {
    log(`Validation or content review failed once: ${firstErr}. Asking generator to fix.`)
    generated = await regenerateWithFix(context, generated, String(firstErr))
    await validateAndReview(generated, context)
  }

  if (DRY_RUN) {
    await writeArtefact('dry-run-output.json', JSON.stringify(generated, null, 2))
    log('Dry run — would write, commit, deploy, notify here.')
    return
  }

  await writeSite(generated.files)
  // Belt-and-braces: ensure the memory entry records visitorQuestion state so the
  // next iteration's rate-limit check can read it.
  const memoryEntry = ensureVisitorQuestionFlag(generated.memoryEntry, !!generated.visitorQuestion)
  await appendFileSafe('memory.md', '\n\n' + memoryEntry)
  await appendFileSafe('evaluation.md', '\n\n' + generated.evaluationEntry)
  if (context.pendingDirective) {
    await applyDirective(context.pendingDirective.path, generated.version)
  }

  // Snapshot the just-shipped iteration so /archive/{TODAY}/ exists immediately
  // and the timeline's links work from the moment v0 is live.
  await snapshotIteration(TODAY)

  // Regenerate /timeline/, /feed.xml, /sitemap.xml, /robots.txt from the now-updated memory.
  const memoryAfter = await read('memory.md')
  await generateTimelineAndFeed(ROOT, memoryAfter)

  // Marketing: generate drafts, post to channels with autopost + creds, log results.
  // Wrapped so failures don't abort the run — marketing is a side-effect.
  let marketingResult: MarketingResult | null = null
  try {
    if (context.pendingDirective?.marketingSkip) {
      log('Marketing skipped by directive.')
    } else {
      const payload: MarketingPayload = {
        version: generated.version,
        date: TODAY,
        brief: generated.brief,
        headline: generated.marketing.headline,
        postShort: generated.marketing.postShort,
        postMedium: generated.marketing.postMedium,
        postLong: generated.marketing.postLong,
        imageAlt: generated.marketing.imageAlt,
        hashtags: generated.marketing.hashtags,
        url: 'https://jordanpitts.com/',
        archiveUrl: `https://jordanpitts.com/archive/${TODAY}/`,
      }
      marketingResult = await runMarketing(ROOT, payload)
      log(`Marketing: ${marketingResult.channels.map(c => `${c.channel}=${c.status}`).join(', ')}`)
    }
  } catch (err) {
    log(`Marketing module failed (continuing): ${(err as Error).message ?? err}`)
  }

  pullRebaseAndPush(generated.version, generated.brief)
  await notify({ ok: true, generated, marketing: marketingResult })
  log(`v${generated.version} shipped.`)
}

// ---------- Context ----------

async function readContext(): Promise<Context> {
  const rules = await read('rules.md')
  const manifesto = await read('manifesto.md')
  const morality = await read('morality.md')
  const evaluation = await read('evaluation.md')
  const memory = await read('memory.md')
  const marketing = await read('MARKETING.md').catch(() => '')
  const assetsManifest = await read('assets/README.md').catch(() => '')
  const assetPaths = await listAssetPaths()
  const pendingDirective = await findPendingDirective()
  const analyticsSummary = await fetchAnalyticsSummary().catch(() => 'No prior iteration analytics yet.')
  const recentMemoryEntries = takeLastIterationEntries(memory, 8)
  const previousIterationDate = lastIterationDateOrNull(memory)
  const previousHadQuestion = lastIterationHadQuestion(memory)
  const lastVersion = lastIterationVersionOrMinusOne(memory)
  const nextVersion = lastVersion + 1
  const model = pendingDirective?.model ?? DEFAULT_MODEL

  return {
    rules, manifesto, morality, evaluation, memory, marketing,
    recentMemoryEntries, pendingDirective, assetsManifest, assetPaths,
    analyticsSummary, previousIterationDate, previousHadQuestion, nextVersion, model,
  }
}

async function listAssetPaths(): Promise<Set<string>> {
  const out = new Set<string>()
  const root = join(ROOT, 'assets')
  if (!existsSync(root)) return out
  async function walk(dir: string, rel: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const fullPath = join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(fullPath, r)
      else out.add(r)
    }
  }
  await walk(root, '')
  return out
}

async function findPendingDirective(): Promise<Directive | null> {
  const dir = join(ROOT, 'directives')
  if (!existsSync(dir)) return null
  const entries = await fs.readdir(dir).catch(() => [])
  const dated = entries
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => ({ name: f, date: f.replace('.md', '') }))
    .filter(d => d.date <= TODAY)
    .sort((a, b) => b.date.localeCompare(a.date))
  if (!dated.length) return null
  const path = join(dir, dated[0].name)
  const content = await fs.readFile(path, 'utf-8')
  // Allow a directive to set the model via a frontmatter-style line: `model: claude-sonnet-4-6`
  const modelMatch = content.match(/^model:\s*([a-z0-9.\-]+)/im)
  // Allow a directive to skip marketing for one iteration: `marketing: skip`
  const skipMatch = content.match(/^marketing:\s*skip\b/im)
  return { path, content, model: modelMatch?.[1], marketingSkip: !!skipMatch }
}

async function fetchAnalyticsSummary(): Promise<string> {
  // TODO: Supabase query for previous iteration's metric result.
  // For v0 (first run) there is nothing to fetch.
  return 'No prior iteration analytics yet.'
}

// ---------- Snapshot ----------

async function snapshotIteration(archiveDate: string) {
  const src = join(ROOT, 'site')
  const dst = join(ROOT, 'site', 'archive', archiveDate)
  if (!existsSync(src)) return
  await fs.mkdir(dst, { recursive: true })
  // Exclude shared infrastructure and generated published-history files from the snapshot.
  // The archive of an iteration is just that iteration's own files.
  await copyDirExcluding(src, dst, ['archive', '_', 'timeline', 'feed.xml', 'sitemap.xml', 'robots.txt'])
  log(`Snapshotted iteration into site/archive/${archiveDate}/`)
}

async function copyDirExcluding(src: string, dst: string, excludeNames: string[]) {
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    if (excludeNames.includes(e.name)) continue
    const s = join(src, e.name)
    const d = join(dst, e.name)
    if (e.isDirectory()) {
      await fs.mkdir(d, { recursive: true })
      await copyDirExcluding(s, d, [])
    } else {
      await fs.copyFile(s, d)
    }
  }
}

// ---------- Generation ----------

async function generate(context: Context): Promise<GeneratedIteration> {
  const system = await read('prompts/system.md')
  const user = buildUserPrompt(context)

  const text = await callLLM({
    model: context.model,
    system,
    messages: [{ role: 'user', content: user }],
  })

  return parseGeneratorOutput(text)
}

function buildUserPrompt(c: Context): string {
  const questionRule = c.previousHadQuestion
    ? 'Previous iteration already included a visitorQuestion. **You MUST OMIT visitorQuestion this iteration** — the script will reject it if you include one.'
    : 'Previous iteration did not include a visitorQuestion. You may include one this iteration if the iteration genuinely calls for it, or omit it (default).'

  return [
    `Today is ${TODAY}. Generating v${c.nextVersion}. Model in use: ${c.model}.`,
    '',
    '## rules.md\n' + c.rules,
    '## manifesto.md\n' + c.manifesto,
    '## morality.md\n' + c.morality,
    '## evaluation.md\n' + c.evaluation,
    '## MARKETING.md\n' + c.marketing,
    '## memory.md (recent iteration entries)\n' + c.recentMemoryEntries,
    '## assets/README.md\n' + c.assetsManifest,
    `## Asset file index (${c.assetPaths.size} files)\n` +
      [...c.assetPaths].slice(0, 200).map(p => `- assets/${p}`).join('\n'),
    '## Previous iteration analytics\n' + c.analyticsSummary,
    '## Visitor question rate limit\n' + questionRule,
    c.pendingDirective
      ? '## Directive for this iteration\n' + c.pendingDirective.content
      : '## Directive for this iteration\n(none — autopilot)',
    '',
    `Produce v${c.nextVersion}. Wrap your output between ${OUTPUT_START} and ${OUTPUT_END} per the system prompt.`,
  ].join('\n\n')
}

function parseGeneratorOutput(text: string): GeneratedIteration {
  const startIdx = text.indexOf(OUTPUT_START)
  const endIdx = text.lastIndexOf(OUTPUT_END)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Generator output missing sentinels (${OUTPUT_START} ... ${OUTPUT_END})`)
  }
  const inner = text.slice(startIdx + OUTPUT_START.length, endIdx).trim()
  let parsed: any
  try {
    parsed = JSON.parse(inner)
  } catch (err) {
    throw new Error(`Generator output is not valid JSON: ${(err as Error).message}`)
  }
  assertShape(parsed)
  return parsed
}

function assertShape(o: any): asserts o is GeneratedIteration {
  const required = ['version', 'brief', 'evaluationMetric', 'files', 'memoryEntry', 'evaluationEntry', 'marketing']
  for (const k of required) {
    if (!(k in o)) throw new Error(`Generator output missing required field: ${k}`)
  }
  if (!Array.isArray(o.files) || o.files.length === 0) {
    throw new Error('Generator output has no files')
  }
  // Marketing block shape
  const m = o.marketing
  if (typeof m !== 'object' || m === null) throw new Error('Generator output marketing block is not an object')
  const marketingFields = ['headline', 'postShort', 'postMedium', 'postLong', 'imageAlt']
  for (const k of marketingFields) {
    if (typeof m[k] !== 'string' || !m[k].trim()) {
      throw new Error(`Generator output marketing.${k} is missing or empty`)
    }
  }
  if (!Array.isArray(m.hashtags)) {
    throw new Error('Generator output marketing.hashtags is not an array')
  }
  if (m.postShort.length > 280) {
    throw new Error(`Generator output marketing.postShort exceeds 280 chars (${m.postShort.length})`)
  }
  if (m.postMedium.length > 500) {
    throw new Error(`Generator output marketing.postMedium exceeds 500 chars (${m.postMedium.length})`)
  }
  for (const f of o.files) {
    if (typeof f.path !== 'string' || typeof f.content !== 'string') {
      throw new Error('Generator output has a malformed file entry')
    }
    if (
      f.path.startsWith('/') ||
      f.path.startsWith('..') ||
      f.path.startsWith('archive/') ||
      f.path.startsWith('_/') ||
      f.path.startsWith('timeline/') ||
      f.path === 'feed.xml' ||
      f.path === 'sitemap.xml' ||
      f.path === 'robots.txt'
    ) {
      throw new Error(`Generator output has an illegal path (reserved or escaping): ${f.path}`)
    }
    const normalised = normalize(f.path)
    if (normalised.startsWith('..') || resolve(ROOT, 'site', normalised).indexOf(resolve(ROOT, 'site') + '/') !== 0) {
      // Ensure resolved path lives strictly under site/
      // (we don't actually use normalised below; just guard against traversal)
      throw new Error(`Generator output path escapes site/: ${f.path}`)
    }
  }
  if (!o.files.some((f: GeneratedFile) => f.path === 'index.html')) {
    throw new Error('Generator output is missing index.html')
  }
}

async function regenerateWithFix(
  context: Context,
  previous: GeneratedIteration,
  error: string,
): Promise<GeneratedIteration> {
  const system = await read('prompts/system.md')
  const fixPrompt = [
    `Today is ${TODAY}. Regenerating v${context.nextVersion}.`,
    '',
    `Your previous output failed validation with: ${error}`,
    '',
    `Return a corrected output wrapped between ${OUTPUT_START} and ${OUTPUT_END}.`,
    'Address the validation error specifically. Keep the brief and metric the same unless they themselves caused the failure.',
  ].join('\n')

  const text = await callLLM({
    model: context.model,
    system,
    messages: [
      { role: 'user', content: buildUserPrompt(context) },
      { role: 'assistant', content: OUTPUT_START + '\n' + JSON.stringify(previous) + '\n' + OUTPUT_END },
      { role: 'user', content: fixPrompt },
    ],
  })

  return parseGeneratorOutput(text)
}

// ---------- Validation ----------

async function validateAndReview(g: GeneratedIteration, ctx: Context): Promise<ReviewResult> {
  // Visitor question rate limit: at most one in every two iterations.
  if (ctx.previousHadQuestion && g.visitorQuestion) {
    throw new Error('Visitor question rate limit violated: previous iteration already included a visitorQuestion. Omit it this iteration.')
  }
  await validate(g, ctx)
  log('Deterministic validation passed. Running content review.')
  const review = await contentReview({
    rules: ctx.rules,
    morality: ctx.morality,
    manifesto: ctx.manifesto,
    version: g.version,
    brief: g.brief,
    evaluationMetric: g.evaluationMetric,
    files: g.files,
    marketing: g.marketing,
  })
  if (review.verdict === 'fail') {
    const detail = review.issues.length ? review.issues.join('; ') : 'no specific issue listed'
    const notes = review.notes ? ` — ${review.notes}` : ''
    throw new Error(`Content review FAIL: ${detail}${notes}`)
  }
  log(`Content review passed: ${review.notes || 'no notes'}`)
  return review
}

async function validate(g: GeneratedIteration, ctx: Context) {
  // 1. index.html exists (already checked in assertShape but double-check)
  const htmls = g.files.filter(f => f.path.endsWith('.html'))
  if (!htmls.some(f => f.path === 'index.html')) {
    throw new Error('No index.html in generated files')
  }

  // 2. HTML well-formedness (light)
  for (const f of htmls) {
    if (!/<html[\s>]/i.test(f.content) || !/<\/html>/i.test(f.content)) {
      throw new Error(`HTML structure check failed for ${f.path}`)
    }
    if (!/<head[\s>]/i.test(f.content) || !/<\/head>/i.test(f.content)) {
      throw new Error(`Missing <head> in ${f.path}`)
    }
  }

  // 3. OG and Twitter meta on every HTML page
  const requiredMeta = ['og:title', 'og:description', 'og:image', 'twitter:card']
  for (const f of htmls) {
    for (const m of requiredMeta) {
      if (!f.content.includes(m)) {
        throw new Error(`Missing meta ${m} in ${f.path}`)
      }
    }
  }

  // 4. Consent script reference on every HTML page
  for (const f of htmls) {
    if (!f.content.includes('/_/consent.js')) {
      throw new Error(`${f.path} does not reference /_/consent.js — consent banner is required on every page`)
    }
  }

  // 5. No external script tags outside the approved analytics stack
  const allowedScriptDomains = [
    'googletagmanager.com',
    'plausible.io',
    'jordanpitts.com',
  ]
  for (const f of htmls) {
    const scriptSrcs = [...f.content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
    for (const src of scriptSrcs) {
      if (src.startsWith('http')) {
        const host = new URL(src).hostname
        if (!allowedScriptDomains.some(d => host.endsWith(d))) {
          throw new Error(`Disallowed external script in ${f.path}: ${src}`)
        }
      }
    }
  }

  // 6. Asset references in HTML must exist in assets/, or be generated files, or live under /_/
  for (const f of htmls) {
    const refs = [...f.content.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1])
    for (const ref of refs) {
      if (ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('mailto:') || ref.startsWith('#')) continue
      if (ref.startsWith('/assets/')) {
        const assetRel = ref.slice('/assets/'.length).split('?')[0].split('#')[0]
        if (!ctx.assetPaths.has(assetRel)) {
          throw new Error(`Reference to missing asset in ${f.path}: ${ref}`)
        }
      } else if (ref.startsWith('/_/')) {
        // Infrastructure — checked separately, assumed to exist
        continue
      } else if (ref.startsWith('/archive/')) {
        // OK — links into the archive
        continue
      } else if (ref.startsWith('/')) {
        // Site-internal absolute — must match one of the generated files
        const target = ref.slice(1).split('?')[0].split('#')[0]
        if (target && !g.files.some(file => file.path === target)) {
          throw new Error(`Reference to non-existent site path in ${f.path}: ${ref}`)
        }
      } else {
        // Relative — must match one of the generated files
        const target = ref.split('?')[0].split('#')[0]
        if (target && !g.files.some(file => file.path === target)) {
          throw new Error(`Reference to non-existent file in ${f.path}: ${ref}`)
        }
      }
    }
  }

  // 7. Headless render check is deferred (will add Puppeteer in a follow-up).
}

// ---------- Writing ----------

async function writeSite(files: GeneratedFile[]) {
  const siteDir = join(ROOT, 'site')
  const entries = existsSync(siteDir)
    ? await fs.readdir(siteDir, { withFileTypes: true })
    : []
  for (const e of entries) {
    if (e.name === 'archive') continue
    if (e.name === '_') continue
    const p = join(siteDir, e.name)
    await fs.rm(p, { recursive: true, force: true })
  }
  await fs.mkdir(siteDir, { recursive: true })
  for (const f of files) {
    const p = join(siteDir, f.path)
    await fs.mkdir(dirname(p), { recursive: true })
    await fs.writeFile(p, f.content)
  }
  log(`Wrote ${files.length} files into site/`)
}

async function applyDirective(directivePath: string, version: number) {
  const appliedDir = join(ROOT, 'directives', 'applied')
  await fs.mkdir(appliedDir, { recursive: true })
  const basename = directivePath.split('/').pop()!.replace(/\.md$/, '')
  const dst = join(appliedDir, `${basename}--v${version}.md`)
  await fs.rename(directivePath, dst)
  log(`Moved directive to ${dst}`)
}

// ---------- Commit & push ----------

function pullRebaseAndPush(version: number, brief: string) {
  // Rebase on top of any commits Jordan made while the job was generating.
  run('git', ['config', 'user.email', 'claude@jordanpitts.com'])
  run('git', ['config', 'user.name', 'Claude'])
  run('git', ['add', '-A'])
  const shortBrief = brief.replace(/\s+/g, ' ').slice(0, 80)
  run('git', ['commit', '-m', `v${version}: ${shortBrief}`])
  // Pull with rebase to fold in any remote changes; --autostash for any uncommitted residue (shouldn't be any).
  run('git', ['pull', '--rebase', '--autostash', 'origin', 'main'])
  run('git', ['push', 'origin', 'HEAD:main'])
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${r.status})`)
  }
}

// ---------- Notify ----------

async function notify(payload: { ok: boolean; generated?: GeneratedIteration; error?: string; marketing?: MarketingResult | null }) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.NOTIFY_EMAIL
  const fromAddress = process.env.NOTIFY_FROM ?? 'Claude <onboarding@resend.dev>'
  if (!apiKey || !to) {
    log('No RESEND_API_KEY or NOTIFY_EMAIL set — skipping notify.')
    return
  }
  const subject = payload.ok
    ? `jordanpitts.com v${payload.generated!.version} shipped`
    : `jordanpitts.com Tuesday job FAILED`
  const marketingLines: string[] = []
  if (payload.marketing) {
    marketingLines.push('', 'Marketing:')
    for (const c of payload.marketing.channels) {
      const detail = c.url ? ` — ${c.url}` : (c.error ? ` (${c.error})` : '')
      marketingLines.push(`  - ${c.channel}: ${c.status}${detail}`)
    }
  }
  const body = payload.ok
    ? [
        `Brief: ${payload.generated!.brief}`,
        `Metric: ${payload.generated!.evaluationMetric}`,
        `Live: https://jordanpitts.com/`,
        `Archive: https://jordanpitts.com/archive/${TODAY}/`,
        '',
        'Notes from the generator:',
        payload.generated!.notes ?? '(none)',
        ...marketingLines,
      ].join('\n')
    : `Error: ${payload.error}`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress, to, subject, text: body }),
  })
}

// ---------- Helpers ----------

async function read(rel: string): Promise<string> {
  return fs.readFile(join(ROOT, rel), 'utf-8')
}

async function appendFileSafe(rel: string, content: string): Promise<void> {
  await fs.appendFile(join(ROOT, rel), content)
}

async function writeArtefact(name: string, content: string) {
  await fs.writeFile(join(ROOT, name), content)
}

function parseIterationHeadings(memory: string): { date: string; version: number; raw: string }[] {
  const out: { date: string; version: number; raw: string }[] = []
  const lines = memory.split('\n')
  for (const line of lines) {
    const m = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+v(\d+)/)
    if (m) out.push({ date: m[1], version: parseInt(m[2], 10), raw: line })
  }
  return out
}

function lastIterationDateOrNull(memory: string): string | null {
  const entries = parseIterationHeadings(memory)
  if (!entries.length) return null
  return entries[entries.length - 1].date
}

function lastIterationVersionOrMinusOne(memory: string): number {
  const entries = parseIterationHeadings(memory)
  if (!entries.length) return -1
  return entries[entries.length - 1].version
}

function takeLastIterationEntries(memory: string, n: number): string {
  const sections = memory.split(/^## /gm).slice(1).map(s => '## ' + s)
  const iterations = sections.filter(s => /^## \d{4}-\d{2}-\d{2}\s+—\s+v\d+/.test(s))
  return iterations.slice(-n).join('\n\n')
}

function lastIterationHadQuestion(memory: string): boolean {
  const sections = memory.split(/^## /gm).slice(1).map(s => '## ' + s)
  const iterations = sections.filter(s => /^## \d{4}-\d{2}-\d{2}\s+—\s+v\d+/.test(s))
  if (!iterations.length) return false
  const last = iterations[iterations.length - 1]
  return /^Visitor question:\s*yes\b/im.test(last)
}

function ensureVisitorQuestionFlag(entry: string, hadQuestion: boolean): string {
  if (/^Visitor question:\s*(yes|no)\b/im.test(entry)) return entry
  return entry.trimEnd() + `\nVisitor question: ${hadQuestion ? 'yes' : 'no'}\n`
}

function log(msg: string) {
  console.log(`[tuesday] ${msg}`)
}

// ---------- Entry ----------

main().catch(async (err) => {
  console.error(err)
  try { await notify({ ok: false, error: String(err?.message ?? err) }) } catch {}
  process.exit(1)
})
