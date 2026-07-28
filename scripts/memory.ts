// scripts/memory.ts
// Parsing and construction of memory.md iteration entries.
//
// memory.md is load-bearing far beyond a changelog: the version number, the
// previous iteration's date, the visitor-question rate limit, and every entry in
// the timeline, the RSS feed and the sitemap are all derived from these headings.
//
// The original design let the MODEL write the heading as free text. A hyphen or an
// en dash instead of U+2014 and the run still shipped, but the iteration vanished
// from the timeline, the version number repeated the following week, and the
// previous iteration was never archived — silently, compounding week over week.
//
// So: the script builds the heading now. Anything the model supplies is discarded.

/** The canonical iteration heading: `## YYYY-MM-DD — vN`. Em dash, U+2014. */
export const ITERATION_HEADING_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+v(\d+)\s*$/

/** Tolerant form used only to detect and strip a model-supplied heading. */
const ANY_HEADING_RE = /^##\s+.*$/

export interface IterationHeading {
  date: string
  version: number
  raw: string
}

export function parseIterationHeadings(memory: string): IterationHeading[] {
  const out: IterationHeading[] = []
  for (const line of memory.split('\n')) {
    const m = line.match(ITERATION_HEADING_RE)
    if (m) out.push({ date: m[1], version: parseInt(m[2], 10), raw: line })
  }
  return out
}

/** Split memory.md into iteration sections (heading + body), in document order. */
export function iterationSections(memory: string): string[] {
  return memory
    .split(/^## /gm)
    .slice(1)
    .map(s => '## ' + s.trimEnd())
    .filter(s => ITERATION_HEADING_RE.test(s.split('\n')[0]))
}

export function lastIterationDateOrNull(memory: string): string | null {
  const entries = parseIterationHeadings(memory)
  return entries.length ? entries[entries.length - 1].date : null
}

export function lastIterationVersionOrMinusOne(memory: string): number {
  const entries = parseIterationHeadings(memory)
  return entries.length ? entries[entries.length - 1].version : -1
}

export function takeLastIterationEntries(memory: string, n: number): string {
  return iterationSections(memory).slice(-n).join('\n\n')
}

export function lastIterationHadQuestion(memory: string): boolean {
  const sections = iterationSections(memory)
  if (!sections.length) return false
  return /^Visitor question:\s*yes\b/im.test(sections[sections.length - 1])
}

/**
 * Build the canonical memory entry for an iteration.
 *
 * `body` is whatever the model wrote. Any heading line it put at the top is
 * stripped and replaced with the deterministic one, and the visitor-question flag
 * is appended if the model omitted it.
 */
export function buildMemoryEntry(opts: {
  date: string
  version: number
  body: string
  hadQuestion: boolean
}): string {
  const { date, version, body, hadQuestion } = opts

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`buildMemoryEntry: invalid date ${JSON.stringify(date)}`)
  }
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`buildMemoryEntry: invalid version ${JSON.stringify(version)}`)
  }

  const lines = body.trim().split('\n')
  // Drop a model-supplied heading, however it was punctuated.
  if (lines.length && ANY_HEADING_RE.test(lines[0])) lines.shift()

  const cleanedBody = lines.join('\n').trim()
  const heading = `## ${date} — v${version}`
  const withFlag = /^Visitor question:\s*(yes|no)\b/im.test(cleanedBody)
    ? cleanedBody
    : `${cleanedBody}\nVisitor question: ${hadQuestion ? 'yes' : 'no'}`

  const entry = `${heading}\n${withFlag}`

  // Belt and braces: what we just built must parse back, or the whole chain breaks.
  if (!ITERATION_HEADING_RE.test(entry.split('\n')[0])) {
    throw new Error(`buildMemoryEntry produced an unparseable heading: ${entry.split('\n')[0]}`)
  }
  return entry
}
