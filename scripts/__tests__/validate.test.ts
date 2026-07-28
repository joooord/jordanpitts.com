// scripts/__tests__/validate.test.ts
// Each rule in rules.md that the validator claims to enforce, tested twice:
// once that a good iteration passes it, once that a bad one is caught.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertShape,
  validateIteration,
  metaContent,
  visibleText,
  ValidationError,
  MAX_POST_SHORT,
  MAX_TOTAL_BYTES,
} from '../validate'
import { validIteration, validContext, validHtml, TEST_DATE, TEST_VERSION, OG } from './fixtures'

const shapeCtx = { expectedVersion: TEST_VERSION }

describe('the known-good iteration passes everything', () => {
  test('assertShape accepts it', () => {
    assert.doesNotThrow(() => assertShape(validIteration(), shapeCtx))
  })

  test('validateIteration accepts it', () => {
    assert.doesNotThrow(() => validateIteration(validIteration(), validContext()))
  })

  test('a multi-page iteration with subdirectory links passes', () => {
    const iteration = validIteration({
      files: [
        {
          path: 'index.html',
          content: validHtml({ body: `<h1>Home</h1><p>v${TEST_VERSION} — ${TEST_DATE}</p><a href="/archive/">archive</a><a href="chapters/one.html">one</a>` }),
        },
        {
          path: 'chapters/one.html',
          // relative sibling link, resolved against chapters/ — the case the
          // original validator got wrong in both directions
          content: validHtml({ body: '<a href="two.html">next</a><a href="/archive/">archive</a>' }),
        },
        { path: 'chapters/two.html', content: validHtml({ body: '<a href="../index.html">home</a>' }) },
      ],
    })
    assert.doesNotThrow(() => validateIteration(iteration, validContext()))
  })

  test('links to script-generated infrastructure pass', () => {
    // /timeline/ and /feed.xml are produced by timeline.ts, never by the model,
    // so they are not in files[]. The original rejected them, which would have
    // failed the very first real run.
    const iteration = validIteration({
      files: [{
        path: 'index.html',
        content: validHtml({
          body: `<p>v${TEST_VERSION} — ${TEST_DATE}</p>
            <a href="/archive/">archive</a>
            <a href="/timeline/">timeline</a>
            <a href="/feed.xml">rss</a>
            <a href="/sitemap.xml">sitemap</a>
            <a href="/archive/2026-05-19/">an old one</a>`,
        }),
      }],
    })
    assert.doesNotThrow(() => validateIteration(iteration, validContext()))
  })
})

describe('shape', () => {
  const bad: [string, any][] = [
    ['not an object', 'hello'],
    ['an array', []],
    ['missing brief', { ...validIteration(), brief: undefined }],
    ['empty brief', { ...validIteration(), brief: '   ' }],
    ['no files', { ...validIteration(), files: [] }],
    ['version as a string', { ...validIteration(), version: 'one' }],
    ['version as a float', { ...validIteration(), version: 1.5 }],
    ['marketing missing', { ...validIteration(), marketing: undefined }],
    ['hashtags not an array', { ...validIteration(), marketing: { ...validIteration().marketing, hashtags: 'nope' } }],
    ['hashtags containing an object', { ...validIteration(), marketing: { ...validIteration().marketing, hashtags: [{ a: 1 }] } }],
  ]
  for (const [name, value] of bad) {
    test(`rejects ${name}`, () => {
      assert.throws(() => assertShape(value, shapeCtx), ValidationError)
    })
  }

  test('rejects a version that is not the one this run must produce', () => {
    // Fed the commit message, the applied-directive filename and the UTM campaign.
    assert.throws(() => assertShape(validIteration({ version: 7 }), shapeCtx), /must produce v1/)
  })

  test('rejects duplicate file paths instead of silently last-write-wins', () => {
    const iteration = validIteration({
      files: [
        { path: 'index.html', content: validHtml() },
        { path: './index.html', content: '<html><head></head>different</html>' },
      ],
    })
    assert.throws(() => assertShape(iteration, shapeCtx), /duplicate file path/)
  })

  test('rejects a missing index.html', () => {
    assert.throws(
      () => assertShape(validIteration({ files: [{ path: 'about.html', content: validHtml() }] }), shapeCtx),
      /missing index\.html/,
    )
  })

  test('rejects a reserved path inside files', () => {
    assert.throws(() => assertShape(validIteration({
      files: [
        { path: 'index.html', content: validHtml() },
        { path: './_/analytics.js', content: 'evil()' },
      ],
    }), shapeCtx))
  })

  test(`rejects postShort over ${MAX_POST_SHORT} chars`, () => {
    const iteration = validIteration()
    iteration.marketing.postShort = 'x'.repeat(MAX_POST_SHORT + 1)
    assert.throws(() => assertShape(iteration, shapeCtx), /postShort exceeds/)
  })

  test('rejects a choice visitorQuestion with no options', () => {
    assert.throws(() => assertShape(validIteration({
      visitorQuestion: { prompt: 'Which?', kind: 'choice', rationale: 'because' },
    }), shapeCtx), /options is required/)
  })
})

describe('open graph', () => {
  test('rejects a relative og:image — social platforms will not resolve it', () => {
    const iteration = validIteration({
      files: [{ path: 'index.html', content: validHtml({ ogImage: '/_/og-default.png' }) }],
    })
    assert.throws(() => validateIteration(iteration, validContext()), /absolute https:\/\/ URL/)
  })

  test('rejects an SVG og:image — no major platform renders one', () => {
    const iteration = validIteration({
      files: [{ path: 'index.html', content: validHtml({ ogImage: 'https://jordanpitts.com/_/og-default.svg' }) }],
    })
    assert.throws(() => validateIteration(iteration, validContext()), /SVG/)
  })

  test('rejects a missing twitter:image', () => {
    const html = validHtml().replace(/<meta name="twitter:image"[^>]*>/, '')
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /twitter:image/,
    )
  })

  test('an og:title mentioned only in prose does not count', () => {
    // The original check was `content.includes('og:title')`, which passed if the
    // string appeared anywhere at all — including in a paragraph about itself.
    const html = validHtml().replace(/<meta property="og:title"[^>]*>/, '') +
      '<p>This page discusses og:title and og:image at length.</p>'
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /og:title/,
    )
  })
})

describe('analytics and third-party scripts', () => {
  test('rejects a page missing the analytics loader', () => {
    const iteration = validIteration({
      files: [{ path: 'index.html', content: validHtml({ analytics: false }) }],
    })
    assert.throws(() => validateIteration(iteration, validContext()), /analytics\.js/)
  })

  test('rejects a third-party script', () => {
    const iteration = validIteration({
      files: [{ path: 'index.html', content: validHtml({ extraHead: '<script src="https://evil.example.com/t.js"></script>' }) }],
    })
    assert.throws(() => validateIteration(iteration, validContext()), /Disallowed external script/)
  })

  test('allows the approved analytics domain', () => {
    const iteration = validIteration({
      files: [{ path: 'index.html', content: validHtml({ extraHead: '<script src="https://plausible.io/js/script.js"></script>' }) }],
    })
    assert.doesNotThrow(() => validateIteration(iteration, validContext()))
  })

  test('rejects a lookalike domain', () => {
    const iteration = validIteration({
      files: [{ path: 'index.html', content: validHtml({ extraHead: '<script src="https://notplausible.io/js/script.js"></script>' }) }],
    })
    assert.throws(() => validateIteration(iteration, validContext()), /Disallowed external script/)
  })
})

describe('rules.md requirements that used to go unchecked', () => {
  test('rejects an iteration with no link to the archive', () => {
    const html = validHtml({ body: `<h1>hi</h1><p>v${TEST_VERSION} — ${TEST_DATE}</p>` })
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /link to \/archive\//,
    )
  })

  test('rejects an iteration that does not display its date', () => {
    const html = validHtml({ body: `<h1>hi</h1><p>v${TEST_VERSION}</p><a href="/archive/">a</a>` })
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /iteration date/,
    )
  })

  test('rejects an iteration that does not display its version', () => {
    const html = validHtml({ body: `<h1>hi</h1><p>${TEST_DATE}</p><a href="/archive/">a</a>` })
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /version number/,
    )
  })

  test('a date hidden in a comment does not count as visible', () => {
    const html = validHtml({ body: `<!-- ${TEST_DATE} --><p>v${TEST_VERSION}</p><a href="/archive/">a</a>` })
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /iteration date/,
    )
  })

  test('rejects an iteration over the 1MB weight limit', () => {
    const iteration = validIteration({
      files: [
        { path: 'index.html', content: validHtml() },
        { path: 'big.css', content: 'a'.repeat(MAX_TOTAL_BYTES) },
      ],
    })
    assert.throws(() => validateIteration(iteration, validContext()), /page weight/)
  })
})

describe('references', () => {
  test('rejects a link to a file that does not exist', () => {
    const html = validHtml({ body: `<p>v${TEST_VERSION} — ${TEST_DATE}</p><a href="/archive/">a</a><a href="/ghost.html">ghost</a>` })
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /non-existent file/,
    )
  })

  test('rejects a reference to an asset that is not in the library', () => {
    const html = validHtml({ body: `<p>v${TEST_VERSION} — ${TEST_DATE}</p><a href="/archive/">a</a><img src="/assets/nope.png" alt="" />` })
    assert.throws(
      () => validateIteration(validIteration({ files: [{ path: 'index.html', content: html }] }), validContext()),
      /missing asset/,
    )
  })

  test('accepts a reference to an asset that is in the library', () => {
    const html = validHtml({ body: `<p>v${TEST_VERSION} — ${TEST_DATE}</p><a href="/archive/">a</a><img src="/assets/img/moon.png" alt="" />` })
    assert.doesNotThrow(() =>
      validateIteration(
        validIteration({ files: [{ path: 'index.html', content: html }] }),
        validContext({ assetPaths: new Set(['img/moon.png']) }),
      ),
    )
  })

  test('a directory link resolves to its index.html', () => {
    const html = validHtml({ body: `<p>v${TEST_VERSION} — ${TEST_DATE}</p><a href="/archive/">a</a><a href="/chapter/">ch</a>` })
    const iteration = validIteration({
      files: [
        { path: 'index.html', content: html },
        { path: 'chapter/index.html', content: validHtml() },
      ],
    })
    assert.doesNotThrow(() => validateIteration(iteration, validContext()))
  })
})

describe('visitor question rate limit', () => {
  test('rejects a question when the previous iteration had one', () => {
    const iteration = validIteration({
      visitorQuestion: { prompt: 'What did you notice?', kind: 'open', rationale: 'curiosity' },
    })
    assert.throws(
      () => validateIteration(iteration, validContext({ previousHadQuestion: true })),
      /rate limit/,
    )
  })

  test('allows a question when the previous iteration had none', () => {
    const iteration = validIteration({
      visitorQuestion: { prompt: 'What did you notice?', kind: 'open', rationale: 'curiosity' },
    })
    assert.doesNotThrow(() => validateIteration(iteration, validContext({ previousHadQuestion: false })))
  })
})

describe('helpers', () => {
  test('metaContent reads either attribute order', () => {
    assert.equal(metaContent('<meta property="og:title" content="A" />', 'og:title'), 'A')
    assert.equal(metaContent('<meta content="B" property="og:title" />', 'og:title'), 'B')
    assert.equal(metaContent('<meta name="twitter:image" content="C" />', 'twitter:image'), 'C')
    assert.equal(metaContent('<p>og:title</p>', 'og:title'), null)
  })

  test('visibleText strips scripts, styles and comments', () => {
    const html = '<style>body{}</style><script>var x=1</script><!-- hidden --><p>seen</p>'
    assert.equal(visibleText(html), 'seen')
  })
})
