// scripts/__tests__/fixtures.ts
// A known-good iteration, and helpers to break it in one specific way.
//
// Every test below starts from something that PASSES, then introduces exactly one
// defect. That is deliberate: a test suite built from broken inputs tells you
// nothing about whether the validator accepts good work, and the original
// validator's worst bug was that it rejected the project's own reference
// iteration.

import { GeneratedIteration, ValidationContext } from '../validate'

export const TEST_DATE = '2026-08-04'
export const TEST_VERSION = 1

export const OG = 'https://jordanpitts.com/_/og-default.png'

export function validHtml(opts: {
  title?: string
  body?: string
  ogImage?: string
  twitterImage?: string
  analytics?: boolean
  extraHead?: string
} = {}): string {
  const {
    title = 'A page',
    body = `<h1>Something true</h1>
      <p>Iteration v${TEST_VERSION} — ${TEST_DATE}</p>
      <p><a href="/archive/">The archive</a></p>
      <p><a href="/timeline/">Timeline</a> · <a href="/feed.xml">RSS</a></p>`,
    ogImage = OG,
    twitterImage = OG,
    analytics = true,
    extraHead = '',
  } = opts

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="An evolving website." />
  <meta property="og:image" content="${ogImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${twitterImage}" />
  ${analytics ? '<script src="/_/analytics.js" defer></script>' : ''}
  ${extraHead}
</head>
<body>
  ${body}
</body>
</html>`
}

export function validIteration(overrides: Partial<GeneratedIteration> = {}): GeneratedIteration {
  return {
    version: TEST_VERSION,
    brief: 'One true thing, told plainly.',
    evaluationMetric: 'Median time on site',
    files: [{ path: 'index.html', content: validHtml() }],
    memoryEntry: 'Brief: One true thing.\nBuilt: A page.\nNotes: none.\nModel: claude-opus-5',
    evaluationEntry: `## ${TEST_DATE} — v${TEST_VERSION}\nMetric chosen: Median time on site`,
    notes: 'nothing special',
    marketing: {
      headline: 'One true thing, told plainly',
      postShort: 'A new iteration is live. One true thing, told plainly.',
      postMedium: 'A new iteration of jordanpitts.com is live this week. '.repeat(6).slice(0, 320),
      postLong: 'A longer newsletter blurb goes here. '.repeat(20),
      imageAlt: 'The words jordanpitts.com on a dark field',
      hashtags: ['weeklysite', 'generative'],
    },
    ...overrides,
  }
}

export function validContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    assetPaths: new Set<string>(),
    expectedVersion: TEST_VERSION,
    expectedDate: TEST_DATE,
    previousHadQuestion: false,
    ...overrides,
  }
}
