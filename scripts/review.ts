// scripts/review.ts
// Second-Claude content review pass. Runs after the deterministic validator.
// Reads the proposed iteration alongside rules.md, morality.md, and manifesto.md
// and returns a strict-but-fair verdict.
//
// Designed to catch real violations, not aesthetic disagreement.

import { callLLM } from './llm'

const REVIEW_START = '<<<REVIEW_START>>>'
const REVIEW_END = '<<<REVIEW_END>>>'

export interface ReviewResult {
  verdict: 'pass' | 'fail'
  issues: string[]
  notes: string
}

interface ReviewInputs {
  rules: string
  morality: string
  manifesto: string
  version: number
  brief: string
  evaluationMetric: string
  files: { path: string; content: string }[]
  marketing: {
    headline: string
    postShort: string
    postMedium: string
    postLong: string
    imageAlt: string
    hashtags: string[]
  }
}

export async function contentReview(inputs: ReviewInputs): Promise<ReviewResult> {
  const model = process.env.REVIEW_MODEL ?? 'claude-haiku-4-5-20251001'

  const system = `You are a strict-but-fair compliance reviewer for an evolving website project. You read a proposed iteration alongside the project's rules and morality posture, and you return one verdict: pass or fail.

You return fail only when there is a clear violation of rules.md or morality.md. Aesthetic disagreement is not a violation. Weirdness, mystery, melancholy, absurdity, or beauty are explicitly permitted. The manifesto encourages range. Do not flag iterations for being strange.

You return JSON wrapped between ${REVIEW_START} and ${REVIEW_END}.`

  const filesText = inputs.files
    .map(f => `\n--- BEGIN ${f.path} ---\n${f.content}\n--- END ${f.path} ---`)
    .join('\n')

  const marketingBlock = [
    `Headline: ${inputs.marketing.headline}`,
    `Post (short): ${inputs.marketing.postShort}`,
    `Post (medium): ${inputs.marketing.postMedium}`,
    `Post (long): ${inputs.marketing.postLong}`,
    `Image alt: ${inputs.marketing.imageAlt}`,
    `Hashtags: ${inputs.marketing.hashtags.join(', ')}`,
  ].join('\n')

  const user = [
    '## rules.md (absolute — flag any violation)',
    inputs.rules,
    '',
    '## morality.md (current posture — flag clear violations)',
    inputs.morality,
    '',
    '## manifesto.md (current direction — for context, do not flag aesthetic choices)',
    inputs.manifesto,
    '',
    `## Proposed iteration v${inputs.version}`,
    `Brief: ${inputs.brief}`,
    `Metric: ${inputs.evaluationMetric}`,
    '',
    '### Marketing copy',
    marketingBlock,
    '',
    `### Files (${inputs.files.length})`,
    filesText,
    '',
    '## Review',
    '',
    'Flag only clear violations:',
    '- Crosses a "Never" in rules.md (sexual, gambling, exploitative, hateful, dangerous instructions, defamation, deepfakes, illegal content, unverified claims about real people)',
    '- Crosses a soft limit in morality.md that is currently "off"',
    '- Misrepresents Jordan personally',
    '- Marketing copy that misrepresents the iteration, makes unverified claims, or oversells',
    '',
    'Do NOT flag:',
    '- Aesthetic choices — weird, melancholy, strange, sparse, dense, ugly-on-purpose are all permitted',
    '- Topic, mood, structure, or form within the posture',
    '- Range across iterations (range is intentional per manifesto)',
    '',
    `Return your verdict between ${REVIEW_START} and ${REVIEW_END}:`,
    '',
    '{',
    '  "verdict": "pass" | "fail",',
    '  "issues": [string array — one per violation, empty if pass],',
    '  "notes": "one-line reasoning, especially useful on edge cases"',
    '}',
  ].join('\n')

  const text = await callLLM({
    model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 4000,
  })

  return parseReview(text)
}

function parseReview(text: string): ReviewResult {
  const start = text.indexOf(REVIEW_START)
  const end = text.lastIndexOf(REVIEW_END)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Content review missing sentinels in response')
  }
  const inner = text.slice(start + REVIEW_START.length, end).trim()
  let parsed: any
  try {
    parsed = JSON.parse(inner)
  } catch (err) {
    throw new Error(`Content review JSON is malformed: ${(err as Error).message}`)
  }
  if (!parsed.verdict || !['pass', 'fail'].includes(parsed.verdict)) {
    throw new Error(`Content review verdict is missing or invalid: ${parsed.verdict}`)
  }
  return {
    verdict: parsed.verdict,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  }
}
