// scripts/tuesday.ts
// The weekly job. Reads the harness, calls the model, validates, deploys, notifies.
//
// Ordering rule that must never be broken: every destructive step happens after
// every gate, and the push happens last. A failure anywhere before
// pullRebaseAndPush leaves the live site completely untouched.

import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { spawnSync } from 'child_process'
import { generateTimelineAndFeed } from './timeline'
import { contentReview, ReviewResult } from './review'
import { runMarketing, MarketingPayload, MarketingResult } from './marketing'
import { callLLM } from './llm'
import { assertWritablePath } from './paths'
import {
  assertShape,
  validateIteration,
  GeneratedIteration,
  ValidationError,
} from './validate'
import {
  buildMemoryEntry,
  lastIterationDateOrNull,
  lastIterationHadQuestion,
  lastIterationVersionOrMinusOne,
  takeLastIterationEntries,
} from './memory'

const ROOT = process.cwd()
const TODAY = new Date().toISOString().slice(0, 10)
const DEFAULT_MODEL = process.env.MODEL ?? 'claude-opus-5'
const DRY_RUN = process.env.DRY_RUN === 'true'
const FORCE = process.env.FORCE === 'true'

const OUTPUT_START = '<<<OUTPUT_START>>>'
const OUTPUT_END = '<<<OUTPUT_END>>>'

/** Names in site/ that the orchestrator owns and an iteration never provides. */
const ORCHESTRATOR_OWNED = ['archive', '_', 'assets', 'timeline', 'feed.xml', 'sitemap.xml', 'robots.txt']

/** Excluded from an iteration's archive snapshot — shared infrastructure, not iteration content. */
const SNAPSHOT_EXCLUDE = ORCHESTRATOR_OWNED

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

/** Names the stage that failed, so the failure email says something useful. */
let currentStage = 'startup'
function stage(name: string) {
  currentStage = name
  log(`— ${name}`)
}

async function main() {
  log(`Tuesday job starting for ${TODAY} (dry=${DRY_RUN})`)

  stage('read context')
  const context = await readContext()
  log(`v${context.nextVersion} — previous iteration: ${context.previousIterationDate ?? 'none'} — model: ${context.model}`)

  // Re-run guard. Without this, a second run on the same day merges over the
  // existing archive snapshot and writes a duplicate memory entry, producing two
  // timeline items pointing at one URL. process.md promises the archive is never
  // overwritten; this is what makes that true.
  if (context.previousIterationDate === TODAY && !DRY_RUN && !FORCE) {
    throw new Error(
      `An iteration is already logged for ${TODAY}. Re-running would overwrite its archive snapshot ` +
      `and double-log memory.md. Set FORCE=true only if you have first removed the existing entry ` +
      `from memory.md and the site/archive/${TODAY}/ directory.`,
    )
  }

  if (context.previousIterationDate && context.previousIterationDate !== TODAY) {
    // Belt-and-braces: re-snapshot the previous iteration in case the end-of-run snapshot ever failed.
    stage('snapshot previous iteration')
    await snapshotIteration(context.previousIterationDate)
  }

  stage('generate')
  let generated = await generate(context)

  stage('validate and review')
  try {
    await validateAndReview(generated, context)
  } catch (firstErr) {
    // Only a genuine problem with the OUTPUT earns a regeneration. An unavailable
    // reviewer, a network error or a bug in our own code must abort instead —
    // regenerating an entire site because the gate itself broke is expensive and
    // tells the generator something untrue about its work.
    if (!(firstErr instanceof ValidationError)) throw firstErr
    log(`Validation or content review failed once: ${firstErr.message}. Asking generator to fix.`)
    stage('regenerate after validation failure')
    generated = await regenerateWithFix(context, generated, firstErr.message)
    await validateAndReview(generated, context)
  }

  if (DRY_RUN) {
    await writeArtefact('dry-run-output.json', JSON.stringify(generated, null, 2))
    log('Dry run — would write, commit, deploy, notify here.')
    return
  }

  stage('write site')
  await writeSite(generated.files)
  await syncAssets()

  stage('append logs')
  // The script owns the heading. See scripts/memory.ts for why.
  const memoryEntry = buildMemoryEntry({
    date: TODAY,
    version: generated.version,
    body: generated.memoryEntry,
    hadQuestion: !!generated.visitorQuestion,
  })
  await appendFileSafe('memory.md', '\n\n' + memoryEntry + '\n')
  await appendFileSafe('evaluation.md', '\n\n' + generated.evaluationEntry.trim() + '\n')

  if (context.pendingDirective) {
    stage('apply directive')
    await applyDirective(context.pendingDirective.path, generated.version)
  }

  // Snapshot the just-shipped iteration so /archive/{TODAY}/ exists immediately
  // and the timeline's links work from the moment it is live.
  stage('snapshot this iteration')
  await snapshotIteration(TODAY)

  stage('generate timeline and feed')
  const memoryAfter = await read('memory.md')
  await generateTimelineAndFeed(ROOT, memoryAfter)

  // Push BEFORE marketing. Marketing announces a URL; announcing it before the
  // deploy means a failed push leaves a live post pointing at a 404.
  stage('commit and push')
  pullRebaseAndPush(generated.version, generated.brief)

  stage('marketing')
  const marketingResult = await runMarketingSafely(generated, context)

  stage('notify')
  await notify({ ok: true, generated, marketing: marketingResult })
  log(`v${generated.version} shipped.`)
}

async function runMarketingSafely(
  generated: GeneratedIteration,
  context: Context,
): Promise<MarketingResult | null> {
  try {
    if (context.pendingDirective?.marketingSkip) {
      log('Marketing skipped by directive.')
      return null
    }
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
    const result = await runMarketing(ROOT, payload)
    log(`Marketing: ${result.channels.map(c => `${c.channel}=${c.status}`).join(', ')}`)
    return result
  } catch (err) {
    // Marketing is a side effect; it must never abort a shipped iteration.
    log(`Marketing module failed (continuing): ${(err as Error).message ?? err}`)
    return null
  }
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
  const nextVersion = lastIterationVersionOrMinusOne(memory) + 1
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
  if (dated.length > 1) {
    // Loud, because the older ones are otherwise ignored forever while being
    // re-read every week.
    log(`WARNING: ${dated.length} pending directives. Applying ${dated[0].name}; ignoring ${dated.slice(1).map(d => d.name).join(', ')}. Move or delete the stale ones.`)
  }
  const path = join(dir, dated[0].name)
  const content = await fs.readFile(path, 'utf-8')
  // A directive may set the model: `model: claude-fable-5`
  const modelMatch = content.match(/^model:\s*([a-z0-9.\-]+)/im)
  // A directive may skip marketing for one iteration: `marketing: skip`
  const skipMatch = content.match(/^marketing:\s*skip\b/im)
  return { path, content, model: modelMatch?.[1], marketingSkip: !!skipMatch }
}

async function fetchAnalyticsSummary(): Promise<string> {
  // TODO(phase-5): query Plausible for the previous iteration's chosen metric.
  // Until then the evaluation loop is open, and evaluation.md says so.
  return 'No prior iteration analytics yet.'
}

// ---------- Snapshot ----------

async function snapshotIteration(archiveDate: string) {
  const src = join(ROOT, 'site')
  const dst = join(ROOT, 'site', 'archive', archiveDate)
  if (!existsSync(src)) return
  // Replace, never merge. Merging left orphaned files from a previous snapshot
  // behind, silently polluting an archive that is supposed to be immutable.
  await fs.rm(dst, { recursive: true, force: true })
  await fs.mkdir(dst, { recursive: true })
  await copyDirExcluding(src, dst, SNAPSHOT_EXCLUDE)
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

  return parseGeneratorOutput(text, context)
}

function buildUserPrompt(c: Context): string {
  const questionRule = c.previousHadQuestion
    ? 'Previous iteration already included a visitorQuestion. **You MUST OMIT visitorQuestion this iteration** — the script will reject it if you include one.'
    : 'Previous iteration did not include a visitorQuestion. You may include one this iteration if the iteration genuinely calls for it, or omit it (default).'

  return [
    `Today is ${TODAY}. Generating v${c.nextVersion}. Model in use: ${c.model}.`,
    `The page must visibly show the date ${TODAY} and the version v${c.nextVersion}.`,
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

export function parseGeneratorOutput(text: string, ctx: { nextVersion: number }): GeneratedIteration {
  const startIdx = text.indexOf(OUTPUT_START)
  const endIdx = text.lastIndexOf(OUTPUT_END)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new ValidationError(`Generator output missing sentinels (${OUTPUT_START} ... ${OUTPUT_END})`)
  }
  const inner = text.slice(startIdx + OUTPUT_START.length, endIdx).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(inner)
  } catch (err) {
    throw new ValidationError(`Generator output is not valid JSON: ${(err as Error).message}`)
  }
  assertShape(parsed, { expectedVersion: ctx.nextVersion })
  return parsed
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

  return parseGeneratorOutput(text, context)
}

// ---------- Validation ----------

async function validateAndReview(g: GeneratedIteration, ctx: Context): Promise<ReviewResult> {
  validateIteration(g, {
    assetPaths: ctx.assetPaths,
    expectedVersion: ctx.nextVersion,
    expectedDate: TODAY,
    previousHadQuestion: ctx.previousHadQuestion,
  })
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
    throw new ValidationError(`Content review FAIL: ${detail}${notes}`)
  }
  log(`Content review passed: ${review.notes || 'no notes'}`)
  return review
}

// ---------- Writing ----------

async function writeSite(files: { path: string; content: string }[]) {
  const siteDir = join(ROOT, 'site')
  const entries = existsSync(siteDir)
    ? await fs.readdir(siteDir, { withFileTypes: true })
    : []
  for (const e of entries) {
    if (ORCHESTRATOR_OWNED.includes(e.name)) continue
    await fs.rm(join(siteDir, e.name), { recursive: true, force: true })
  }
  await fs.mkdir(siteDir, { recursive: true })
  for (const f of files) {
    // Write the NORMALISED path, never the raw one, or normalisation was pointless.
    const safe = assertWritablePath(f.path)
    const p = join(siteDir, safe)
    await fs.mkdir(dirname(p), { recursive: true })
    await fs.writeFile(p, f.content)
  }
  log(`Wrote ${files.length} files into site/`)
}

/**
 * Copy assets/ into site/assets/ so that /assets/... references actually resolve.
 * Vercel serves site/ only; assets/ is a sibling at the repo root, so every
 * /assets/ reference used to 404 in production while passing validation.
 */
async function syncAssets() {
  const src = join(ROOT, 'assets')
  if (!existsSync(src)) return
  const dst = join(ROOT, 'site', 'assets')
  await fs.rm(dst, { recursive: true, force: true })
  await fs.mkdir(dst, { recursive: true })
  await copyDirExcluding(src, dst, ['README.md'])
  log('Synced assets/ into site/assets/')
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
  run('git', ['config', 'user.email', 'claude@jordanpitts.com'])
  run('git', ['config', 'user.name', 'Claude'])
  run('git', ['add', '-A'])
  const shortBrief = brief.replace(/\s+/g, ' ').slice(0, 80)
  run('git', ['commit', '-m', `v${version}: ${shortBrief}`])
  run('git', ['pull', '--rebase', '--autostash', 'origin', 'main'])
  run('git', ['push', 'origin', 'HEAD:main'])
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.error) {
    throw new Error(`Command could not be run: ${cmd} ${args.join(' ')} — ${r.error.message}`)
  }
  if (r.signal) {
    throw new Error(`Command killed by signal ${r.signal}: ${cmd} ${args.join(' ')}`)
  }
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${r.status})`)
  }
}

// ---------- Notify ----------

async function notify(payload: {
  ok: boolean
  generated?: GeneratedIteration
  error?: string
  stage?: string
  marketing?: MarketingResult | null
}) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.NOTIFY_EMAIL
  const fromAddress = process.env.NOTIFY_FROM ?? 'Claude <onboarding@resend.dev>'
  if (!apiKey || !to) {
    log('No RESEND_API_KEY or NOTIFY_EMAIL set — skipping notify.')
    return
  }
  const subject = payload.ok
    ? `jordanpitts.com v${payload.generated!.version} shipped`
    : `jordanpitts.com Tuesday job FAILED at: ${payload.stage ?? 'unknown stage'}`

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
    : [
        `Stage: ${payload.stage ?? 'unknown'}`,
        `Date: ${TODAY}`,
        '',
        `Error: ${payload.error}`,
        '',
        'The live site was not modified unless the failure occurred after the push step.',
      ].join('\n')

  // The response was never checked, so a bad key meant failures were announced
  // to nobody — the worst possible silent failure in a notification path.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress, to, subject, text: body }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '(no body)')
    console.error(`[tuesday] NOTIFY FAILED: Resend returned ${res.status} ${res.statusText} — ${detail}`)
    return
  }
  log(`Notification sent to ${to}`)
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

function log(msg: string) {
  console.log(`[tuesday] ${msg}`)
}

// ---------- Entry ----------

// Only run when executed directly, so tests can import from this module.
if (process.argv[1] && /tuesday\.[tj]s$/.test(process.argv[1])) {
  main().catch(async (err) => {
    console.error(err)
    try {
      await notify({ ok: false, error: String(err?.message ?? err), stage: currentStage })
    } catch (notifyErr) {
      console.error(`[tuesday] notify itself threw: ${notifyErr}`)
    }
    process.exit(1)
  })
}
