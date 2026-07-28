// scripts/__tests__/memory.test.ts
// The version chain. A mistyped dash here used to ship a working iteration that
// was invisible to the timeline, repeated its version number the following week,
// and left the previous iteration unarchived — silently, compounding.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMemoryEntry,
  parseIterationHeadings,
  lastIterationDateOrNull,
  lastIterationVersionOrMinusOne,
  lastIterationHadQuestion,
  takeLastIterationEntries,
  ITERATION_HEADING_RE,
} from '../memory'

const MEMORY = `# Memory

## 2026-05-13 — harness setup
Built: the harness. This entry has no version and must be ignored.

## 2026-05-19 — v0
Brief: Eight true things.
Built: A page.
Model: claude-opus-5
Visitor question: no

## 2026-08-04 — v1
Brief: Something else.
Built: Another page.
Model: claude-opus-5
Visitor question: yes
`

describe('parsing', () => {
  test('finds only versioned iteration headings', () => {
    const headings = parseIterationHeadings(MEMORY)
    assert.deepEqual(headings.map(h => [h.date, h.version]), [
      ['2026-05-19', 0],
      ['2026-08-04', 1],
    ])
  })

  test('reads the latest date and version', () => {
    assert.equal(lastIterationDateOrNull(MEMORY), '2026-08-04')
    assert.equal(lastIterationVersionOrMinusOne(MEMORY), 1)
  })

  test('reads the visitor-question flag from the latest entry only', () => {
    assert.equal(lastIterationHadQuestion(MEMORY), true)
  })

  test('an empty memory yields no date and version -1, so the first run is v0', () => {
    assert.equal(lastIterationDateOrNull('# Memory\n'), null)
    assert.equal(lastIterationVersionOrMinusOne('# Memory\n'), -1)
  })

  test('takeLastIterationEntries returns whole sections, newest last', () => {
    const recent = takeLastIterationEntries(MEMORY, 1)
    assert.match(recent, /## 2026-08-04 — v1/)
    assert.doesNotMatch(recent, /## 2026-05-19/)
  })
})

describe('the heading regex is strict about the em dash', () => {
  test('accepts the canonical form', () => {
    assert.ok(ITERATION_HEADING_RE.test('## 2026-08-04 — v1'))
  })

  // These are the near-misses. Under the old design the MODEL wrote this line,
  // so any of them shipped a live iteration that no longer existed as far as the
  // timeline, feed, sitemap and version counter were concerned.
  for (const bad of [
    '## 2026-08-04 - v1',   // hyphen-minus
    '## 2026-08-04 – v1',   // en dash
    '## 2026-08-04 — V1',   // capital V
    '## v1 — 2026-08-04',   // reversed
    '## 2026-8-4 — v1',     // unpadded date
    '# 2026-08-04 — v1',    // wrong heading level
  ]) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      assert.equal(ITERATION_HEADING_RE.test(bad), false)
    })
  }
})

describe('buildMemoryEntry writes the heading itself', () => {
  test('produces a heading that parses back', () => {
    const entry = buildMemoryEntry({
      date: '2026-08-04',
      version: 1,
      body: 'Brief: A thing.\nBuilt: A page.',
      hadQuestion: false,
    })
    assert.equal(entry.split('\n')[0], '## 2026-08-04 — v1')
    assert.deepEqual(parseIterationHeadings(entry).map(h => h.version), [1])
  })

  test('strips and replaces a model-supplied heading, however it was punctuated', () => {
    for (const heading of [
      '## 2026-08-04 - v1',
      '## 2026-08-04 – v1',
      '## 2020-01-01 — v99',
      '## whatever the model felt like',
    ]) {
      const entry = buildMemoryEntry({
        date: '2026-08-04',
        version: 1,
        body: `${heading}\nBrief: A thing.`,
        hadQuestion: false,
      })
      assert.equal(entry.split('\n')[0], '## 2026-08-04 — v1')
      assert.match(entry, /Brief: A thing\./)
      assert.equal(parseIterationHeadings(entry).length, 1)
    }
  })

  test('appends the visitor-question flag when the model omitted it', () => {
    const entry = buildMemoryEntry({ date: '2026-08-04', version: 1, body: 'Brief: x', hadQuestion: true })
    assert.match(entry, /^Visitor question: yes$/m)
  })

  test('does not duplicate the flag when the model supplied it', () => {
    const entry = buildMemoryEntry({
      date: '2026-08-04',
      version: 1,
      body: 'Brief: x\nVisitor question: no',
      hadQuestion: false,
    })
    assert.equal(entry.match(/Visitor question:/g)?.length, 1)
  })

  test('appending to memory keeps the chain readable', () => {
    // The round trip that actually matters: build an entry, append it, and
    // confirm next week's run reads the right version and date back out.
    const entry = buildMemoryEntry({ date: '2026-08-11', version: 2, body: 'Brief: next', hadQuestion: false })
    const updated = MEMORY + '\n\n' + entry + '\n'
    assert.equal(lastIterationVersionOrMinusOne(updated), 2)
    assert.equal(lastIterationDateOrNull(updated), '2026-08-11')
    assert.equal(lastIterationHadQuestion(updated), false)
  })

  test('refuses a malformed date or version rather than writing an unparseable heading', () => {
    assert.throws(() => buildMemoryEntry({ date: '4th August', version: 1, body: 'x', hadQuestion: false }))
    assert.throws(() => buildMemoryEntry({ date: '2026-08-04', version: 1.5, body: 'x', hadQuestion: false }))
  })
})
