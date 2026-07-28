// scripts/__tests__/pipeline.test.ts
// The golden-file rehearsal: run the deterministic half of the Tuesday job in a
// temp directory, with no API call and no cost, and check what lands on disk.
//
// This is what lets us prove the pipeline before arming it. It also catches a
// class of bug the unit tests cannot: the orchestrator's OWN generated pages
// (timeline, archive index) have to satisfy the same rules an iteration does,
// and for months they did not — relative SVG OG images on every one.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateTimelineAndFeed } from '../timeline'
import { parseGeneratorOutput } from '../tuesday'
import { metaContent, ValidationError } from '../validate'
import { validIteration, TEST_VERSION } from './fixtures'

const MEMORY = `# Memory

## 2026-05-13 — harness setup
Built: the harness, which must not appear in the timeline.

## 2026-05-19 — v0
Brief: Eight true things hiding in plain sight.
Built: A self-contained interactive page.
Notes: Repeat the lean-in reveal.
Model: claude-opus-5
Visitor question: no

## 2026-08-04 — v1
Brief: Something with an ampersand & a <bracket>.
Built: Another page.
Model: claude-fable-5
Visitor question: yes
`

let root: string

describe('golden-file pipeline rehearsal', () => {
  before(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'jp-pipeline-'))
    await fs.mkdir(join(root, 'site'), { recursive: true })
    await generateTimelineAndFeed(root, MEMORY)
  })

  after(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const read = (rel: string) => fs.readFile(join(root, 'site', rel), 'utf-8')

  test('writes every file the deploy expects', async () => {
    for (const f of ['timeline/index.html', 'archive/index.html', 'feed.xml', 'sitemap.xml', 'robots.txt']) {
      await assert.doesNotReject(read(f), `${f} was not generated`)
    }
  })

  test('the archive index exists, so the site-wide /archive/ link does not 404', async () => {
    const html = await read('archive/index.html')
    assert.match(html, /2026-05-19/)
    assert.match(html, /href="\/archive\/2026-05-19\/"/)
  })

  test('the timeline lists iterations newest first and ignores unversioned entries', async () => {
    const html = await read('timeline/index.html')
    assert.match(html, /v1/)
    assert.match(html, /v0/)
    assert.ok(html.indexOf('2026-08-04') < html.indexOf('2026-05-19'), 'newest should come first')
    assert.doesNotMatch(html, /harness setup/)
  })

  test('generated pages obey the same OG rules an iteration must', async () => {
    // Both of these shipped a relative SVG for months, which unfurls blank on
    // every major platform — the launch-day embarrassment.
    for (const page of ['timeline/index.html', 'archive/index.html']) {
      const html = await read(page)
      for (const key of ['og:image', 'twitter:image']) {
        const value = metaContent(html, key)
        assert.ok(value, `${page} is missing ${key}`)
        assert.match(value!, /^https:\/\//, `${page} ${key} must be absolute`)
        assert.doesNotMatch(value!, /\.svg/, `${page} ${key} must not be SVG`)
      }
    }
  })

  test('generated pages load the analytics script, not the retired consent script', async () => {
    for (const page of ['timeline/index.html', 'archive/index.html']) {
      const html = await read(page)
      assert.match(html, /<script src="\/_\/analytics\.js" defer><\/script>/)
      assert.doesNotMatch(html, /consent\.js/)
    }
  })

  test('the feed and sitemap are well-formed and escaped', async () => {
    const feed = await read('feed.xml')
    // The brief contains & and <bracket>; unescaped, this is an invalid document.
    assert.match(feed, /&amp;/)
    assert.match(feed, /&lt;bracket&gt;/)
    assert.doesNotMatch(feed, /& /)
    assert.match(feed, /<link>https:\/\/jordanpitts\.com\/archive\/2026-08-04\/<\/link>/)

    const sitemap = await read('sitemap.xml')
    assert.match(sitemap, /<loc>https:\/\/jordanpitts\.com\/<\/loc>/)
    assert.match(sitemap, /<loc>https:\/\/jordanpitts\.com\/archive\/<\/loc>/)
    assert.match(sitemap, /<loc>https:\/\/jordanpitts\.com\/archive\/2026-05-19\/<\/loc>/)
    assert.match(sitemap, /<lastmod>2026-08-04<\/lastmod>/)
  })

  test('robots points at the sitemap', async () => {
    assert.match(await read('robots.txt'), /Sitemap: https:\/\/jordanpitts\.com\/sitemap\.xml/)
  })

  test('re-running is idempotent', async () => {
    const before = await read('timeline/index.html')
    await generateTimelineAndFeed(root, MEMORY)
    assert.equal(await read('timeline/index.html'), before)
  })

  test('an empty memory produces valid empty-state pages rather than crashing', async () => {
    const emptyRoot = await fs.mkdtemp(join(tmpdir(), 'jp-empty-'))
    await fs.mkdir(join(emptyRoot, 'site'), { recursive: true })
    await generateTimelineAndFeed(emptyRoot, '# Memory\n')
    const html = await fs.readFile(join(emptyRoot, 'site', 'timeline', 'index.html'), 'utf-8')
    assert.match(html, /no iterations published yet/)
    await fs.rm(emptyRoot, { recursive: true, force: true })
  })
})

describe('sentinel parsing', () => {
  const ctx = { nextVersion: TEST_VERSION }
  const wrap = (o: unknown) => `thinking out loud first...\n<<<OUTPUT_START>>>\n${JSON.stringify(o)}\n<<<OUTPUT_END>>>\ntrailing chatter`

  test('extracts the payload and ignores prose on both sides', () => {
    const parsed = parseGeneratorOutput(wrap(validIteration()), ctx)
    assert.equal(parsed.version, TEST_VERSION)
    assert.equal(parsed.files[0].path, 'index.html')
  })

  test('tolerates backticks and code fences inside file content', () => {
    // Why sentinels rather than fences: file content routinely contains both.
    const iteration = validIteration()
    iteration.files[0].content = iteration.files[0].content + '\n<pre>```\nconst x = `hi`\n```</pre>'
    const parsed = parseGeneratorOutput(wrap(iteration), ctx)
    assert.match(parsed.files[0].content, /const x = `hi`/)
  })

  test('rejects a response with no sentinels', () => {
    assert.throws(() => parseGeneratorOutput('I have thought about it and here is some JSON: {}', ctx), ValidationError)
  })

  test('rejects a truncated response — end sentinel missing', () => {
    const text = `<<<OUTPUT_START>>>\n${JSON.stringify(validIteration()).slice(0, 200)}`
    assert.throws(() => parseGeneratorOutput(text, ctx), /missing sentinels/)
  })

  test('rejects malformed JSON with a message naming the real cause', () => {
    assert.throws(
      () => parseGeneratorOutput('<<<OUTPUT_START>>>\n{ "version": 1, }\n<<<OUTPUT_END>>>', ctx),
      /not valid JSON/,
    )
  })

  test('rejects a payload that parses but fails the shape check', () => {
    assert.throws(() => parseGeneratorOutput(wrap({ version: 1 }), ctx), /missing required field/)
  })
})
