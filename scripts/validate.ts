// scripts/validate.ts
// Deterministic validation of a generated iteration.
//
// This is the only barrier between a model's output and the live domain, so it is
// kept pure (no fs, no network, no clock) and tested directly in
// scripts/__tests__/validate.test.ts. Anything that needs the disk is passed in.
//
// Every check here corresponds to a line in rules.md. If you add a rule there,
// add the check here and a test for it, or the rule is decoration.

import {
  assertWritablePath,
  resolveReference,
  isInfrastructureReference,
} from './paths'

export const MAX_TOTAL_BYTES = 1024 * 1024 // rules.md: total page weight under 1MB
/**
 * 180, not 280. The poster appends "\n\n" plus a UTM-tagged URL (~95 chars), so a
 * 280-char postShort produced a ~377-char post against X's 280 limit and
 * Bluesky's 300-grapheme limit. Nobody had budgeted for the link.
 */
export const MAX_POST_SHORT = 180
export const MAX_POST_MEDIUM = 500
export const SITE_ORIGIN = 'https://jordanpitts.com'

/** Domains permitted in <script src>. rules.md: no third-party scripts beyond these. */
export const ALLOWED_SCRIPT_DOMAINS = ['plausible.io', 'jordanpitts.com'] as const

export interface GeneratedFile { path: string; content: string }

export interface GeneratedMarketing {
  headline: string
  postShort: string
  postMedium: string
  postLong: string
  imageAlt: string
  hashtags: string[]
}

export interface GeneratedVisitorQuestion {
  prompt: string
  kind: 'open' | 'choice'
  options?: string[]
  placeholder?: string
  rationale: string
}

export interface GeneratedIteration {
  version: number
  brief: string
  evaluationMetric: string
  files: GeneratedFile[]
  memoryEntry: string
  evaluationEntry: string
  notes?: string
  marketing: GeneratedMarketing
  visitorQuestion?: GeneratedVisitorQuestion
}

export interface ValidationContext {
  /** Paths present in assets/, relative to assets/ (e.g. "img/moon.png"). */
  assetPaths: Set<string>
  /** The version this run is expected to produce. */
  expectedVersion: number
  /** The date this iteration ships, YYYY-MM-DD. Must appear on the page. */
  expectedDate: string
  /** Whether the previous iteration carried a visitor question (rate limit). */
  previousHadQuestion: boolean
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function fail(message: string): never {
  throw new ValidationError(message)
}

/**
 * Read the content= of a <meta> tag by property= or name=, tolerating either
 * attribute order. Returns null when absent. Deliberately stricter than the
 * original `content.includes('og:title')`, which passed if the string appeared
 * anywhere at all — including inside prose or a comment.
 */
export function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const contentFirst = new RegExp(
    `<meta[^>]*\\scontent=["']([^"']*)["'][^>]*\\s(?:property|name)=["']${escaped}["']`,
    'i',
  )
  const keyFirst = new RegExp(
    `<meta[^>]*\\s(?:property|name)=["']${escaped}["'][^>]*\\scontent=["']([^"']*)["']`,
    'i',
  )
  const m = html.match(keyFirst) ?? html.match(contentFirst)
  return m ? m[1] : null
}

/** Strip tags, scripts and styles so we can check what a visitor can actually read. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Structural checks on the parsed JSON, before any content inspection.
 * Throws ValidationError with a message the generator can act on.
 */
export function assertShape(o: any, ctx: Pick<ValidationContext, 'expectedVersion'>): asserts o is GeneratedIteration {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) {
    fail('Generator output is not a JSON object')
  }

  const required = ['version', 'brief', 'evaluationMetric', 'files', 'memoryEntry', 'evaluationEntry', 'marketing']
  for (const k of required) {
    if (!(k in o)) fail(`Generator output missing required field: ${k}`)
  }

  // version: was unchecked, so "one" or 47 passed and flowed into the commit
  // message, the directive filename (--vNaN.md), the email and the UTM campaign.
  if (typeof o.version !== 'number' || !Number.isInteger(o.version)) {
    fail(`Generator output version must be an integer, got ${JSON.stringify(o.version)}`)
  }
  if (o.version !== ctx.expectedVersion) {
    fail(`Generator output version is ${o.version} but this run must produce v${ctx.expectedVersion}`)
  }

  for (const k of ['brief', 'evaluationMetric', 'memoryEntry', 'evaluationEntry'] as const) {
    if (typeof o[k] !== 'string' || !o[k].trim()) {
      fail(`Generator output ${k} is missing or empty`)
    }
  }
  if ('notes' in o && o.notes !== undefined && typeof o.notes !== 'string') {
    fail('Generator output notes must be a string when present')
  }

  if (!Array.isArray(o.files) || o.files.length === 0) {
    fail('Generator output has no files')
  }

  const m = o.marketing
  if (typeof m !== 'object' || m === null || Array.isArray(m)) {
    fail('Generator output marketing block is not an object')
  }
  for (const k of ['headline', 'postShort', 'postMedium', 'postLong', 'imageAlt'] as const) {
    if (typeof m[k] !== 'string' || !m[k].trim()) {
      fail(`Generator output marketing.${k} is missing or empty`)
    }
  }
  if (!Array.isArray(m.hashtags) || m.hashtags.some((t: unknown) => typeof t !== 'string')) {
    fail('Generator output marketing.hashtags must be an array of strings')
  }
  if (m.postShort.length > MAX_POST_SHORT) {
    fail(`Generator output marketing.postShort exceeds ${MAX_POST_SHORT} chars (${m.postShort.length})`)
  }
  if (m.postMedium.length > MAX_POST_MEDIUM) {
    fail(`Generator output marketing.postMedium exceeds ${MAX_POST_MEDIUM} chars (${m.postMedium.length})`)
  }

  if (o.visitorQuestion !== undefined) {
    const q = o.visitorQuestion
    if (typeof q !== 'object' || q === null) fail('visitorQuestion must be an object when present')
    if (typeof q.prompt !== 'string' || !q.prompt.trim()) fail('visitorQuestion.prompt is missing or empty')
    if (q.kind !== 'open' && q.kind !== 'choice') fail(`visitorQuestion.kind must be "open" or "choice", got ${JSON.stringify(q.kind)}`)
    if (q.kind === 'choice' && (!Array.isArray(q.options) || q.options.length === 0)) {
      fail('visitorQuestion.options is required when kind is "choice"')
    }
  }

  // Paths: normalise-then-check, and reject duplicates. Duplicates previously
  // last-write-wins silently.
  const seen = new Set<string>()
  for (const f of o.files) {
    if (typeof f?.path !== 'string' || typeof f?.content !== 'string') {
      fail('Generator output has a malformed file entry (path and content must both be strings)')
    }
    const normalised = assertWritablePath(f.path) // throws IllegalPathError
    if (seen.has(normalised)) {
      fail(`Generator output contains duplicate file path: ${normalised}`)
    }
    seen.add(normalised)
  }

  if (!seen.has('index.html')) {
    fail('Generator output is missing index.html')
  }
}

/**
 * Content validation. Assumes assertShape has already run.
 */
export function validateIteration(g: GeneratedIteration, ctx: ValidationContext): void {
  // Visitor question rate limit — at most one per two iterations.
  if (ctx.previousHadQuestion && g.visitorQuestion) {
    fail('Visitor question rate limit violated: the previous iteration already included one. Omit visitorQuestion this iteration.')
  }

  const files = g.files.map(f => ({ path: assertWritablePath(f.path), content: f.content }))
  const htmls = files.filter(f => f.path.endsWith('.html'))
  const filePaths = new Set(files.map(f => f.path))

  // Total weight (rules.md: under 1MB).
  const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf-8'), 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    fail(`Total page weight is ${(totalBytes / 1024).toFixed(0)}KB, over the ${MAX_TOTAL_BYTES / 1024}KB limit in rules.md`)
  }

  for (const f of htmls) {
    // Structure.
    if (!/<html[\s>]/i.test(f.content) || !/<\/html>/i.test(f.content)) {
      fail(`HTML structure check failed for ${f.path}: missing <html> or </html>`)
    }
    if (!/<head[\s>]/i.test(f.content) || !/<\/head>/i.test(f.content)) {
      fail(`Missing <head> in ${f.path}`)
    }

    // Open Graph and Twitter cards. og:image and twitter:image must be ABSOLUTE
    // and must not be SVG: OG consumers require absolute URLs, and no major
    // platform renders an SVG preview. A relative SVG unfurls blank everywhere.
    for (const key of ['og:title', 'og:description', 'twitter:card'] as const) {
      const value = metaContent(f.content, key)
      if (value === null || !value.trim()) fail(`Missing or empty meta ${key} in ${f.path}`)
    }
    for (const key of ['og:image', 'twitter:image'] as const) {
      const value = metaContent(f.content, key)
      if (value === null || !value.trim()) fail(`Missing or empty meta ${key} in ${f.path}`)
      if (!/^https:\/\//i.test(value)) {
        fail(`${key} in ${f.path} must be an absolute https:// URL (got ${JSON.stringify(value)}) — social platforms will not resolve a relative URL`)
      }
      if (/\.svg(\?|#|$)/i.test(value)) {
        fail(`${key} in ${f.path} is an SVG — no major social platform renders SVG previews. Use PNG or JPG.`)
      }
    }

    // Analytics script on every page.
    if (!/<script[^>]+src=["']\/_\/analytics\.js["']/i.test(f.content)) {
      fail(`${f.path} does not reference /_/analytics.js via <script src="/_/analytics.js" defer></script>`)
    }

    // No third-party scripts.
    const scriptSrcs = [...f.content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
    for (const src of scriptSrcs) {
      if (!/^https?:\/\//i.test(src)) continue
      let host: string
      try {
        host = new URL(src).hostname
      } catch {
        fail(`Malformed script src in ${f.path}: ${src}`)
      }
      if (!ALLOWED_SCRIPT_DOMAINS.some(d => host === d || host.endsWith('.' + d))) {
        fail(`Disallowed external script in ${f.path}: ${src}`)
      }
    }

    // References resolve. Relative refs resolve against the REFERRING file's
    // directory — the original matched them against a flat list, producing false
    // passes and false failures in the same check.
    const refs = [...f.content.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1])
    for (const ref of refs) {
      const resolved = resolveReference(f.path, ref)
      if (resolved === null) continue
      if (isInfrastructureReference(resolved)) {
        // Assets are the one infrastructure class we can verify now.
        if (resolved.startsWith('/assets/')) {
          const assetRel = resolved.slice('/assets/'.length)
          if (!ctx.assetPaths.has(assetRel)) {
            fail(`Reference to missing asset in ${f.path}: ${ref}`)
          }
        }
        continue
      }
      const target = resolved.endsWith('/') ? resolved + 'index.html' : resolved
      const siteRelative = target.replace(/^\//, '')
      if (siteRelative && !filePaths.has(siteRelative)) {
        fail(`Reference to non-existent file in ${f.path}: ${ref} (resolves to /${siteRelative})`)
      }
    }
  }

  // rules.md: a visible link to the archive, and a visible date and version.
  const index = htmls.find(f => f.path === 'index.html')!
  const indexRefs = [...index.content.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1])
  if (!indexRefs.some(r => r.replace(/\?.*$/, '').startsWith('/archive'))) {
    fail('index.html has no visible link to /archive/ — required by rules.md')
  }
  const text = visibleText(index.content)
  if (!text.includes(ctx.expectedDate)) {
    fail(`index.html does not display the iteration date ${ctx.expectedDate} — required by rules.md`)
  }
  if (!new RegExp(`\\bv${ctx.expectedVersion}\\b`).test(text)) {
    fail(`index.html does not display the version number v${ctx.expectedVersion} — required by rules.md`)
  }
}
