// scripts/__tests__/paths.test.ts
// The security boundary. If any of these fail, a generated iteration can
// overwrite shared infrastructure or a published archive entry.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalisePath,
  assertWritablePath,
  resolveReference,
  isInfrastructureReference,
  IllegalPathError,
} from '../paths'

describe('normalisePath', () => {
  const cases: [string, string][] = [
    ['index.html', 'index.html'],
    ['./index.html', 'index.html'],
    ['sub/page.html', 'sub/page.html'],
    ['sub//page.html', 'sub/page.html'],
    ['sub/./page.html', 'sub/page.html'],
    ['sub/../page.html', 'page.html'],
    ['sub\\page.html', 'sub/page.html'],
    ['dir/', 'dir'],
  ]
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(normalisePath(input), expected)
    })
  }
})

describe('assertWritablePath accepts legitimate iteration files', () => {
  for (const p of [
    'index.html',
    './index.html',
    'styles.css',
    'about/index.html',
    'chapters/one/index.html',
    'og.png',
    'assets-of-my-own.json',
  ]) {
    test(p, () => {
      assert.doesNotThrow(() => assertWritablePath(p))
    })
  }
})

describe('assertWritablePath rejects reserved paths — including obfuscated forms', () => {
  // The originals: plain reserved paths. These were already caught.
  const plain = [
    '_/consent.js',
    '_/analytics.js',
    'archive/2026-05-19/index.html',
    'timeline/index.html',
    'feed.xml',
    'sitemap.xml',
    'robots.txt',
  ]

  // The bypasses. Every one of these was ACCEPTED by the original validator and
  // written verbatim, which meant a generated iteration could replace the
  // analytics loader or rewrite a published archive entry with no error logged.
  const obfuscated = [
    './_/analytics.js',
    './archive/2026-05-19/index.html',
    './timeline/index.html',
    './feed.xml',
    './sitemap.xml',
    './robots.txt',
    'x/../_/analytics.js',
    'a/b/../../archive/2026-05-19/index.html',
    '_//analytics.js',
    './/_/analytics.js',
    '_/./analytics.js',
    'archive/',
    '_/',
  ]

  for (const p of [...plain, ...obfuscated]) {
    test(`rejects ${JSON.stringify(p)}`, () => {
      assert.throws(() => assertWritablePath(p), IllegalPathError)
    })
  }
})

describe('assertWritablePath rejects escapes and nonsense', () => {
  for (const p of [
    '/etc/passwd',
    '/index.html',
    '../secrets.md',
    '../../etc/passwd',
    'a/../../outside.html',
    'C:/windows/system32',
    '',
    '   ',
    './',
    '.',
  ]) {
    test(`rejects ${JSON.stringify(p)}`, () => {
      assert.throws(() => assertWritablePath(p))
    })
  }

  test('rejects a null byte', () => {
    assert.throws(() => assertWritablePath('index.html\0.png'), IllegalPathError)
  })
})

describe('assertWritablePath returns the normalised path', () => {
  test('so callers write the safe form, not the raw input', () => {
    assert.equal(assertWritablePath('./sub/../index.html'), 'index.html')
  })
})

describe('resolveReference resolves against the referring file', () => {
  test('relative link from a subdirectory resolves to that subdirectory', () => {
    // The original matched relative refs against a flat list of paths, so this
    // resolved to /page2.html — a false failure, and a false pass in the mirror case.
    assert.equal(resolveReference('sub/page.html', 'page2.html'), '/sub/page2.html')
  })

  test('relative link from the root', () => {
    assert.equal(resolveReference('index.html', 'about.html'), '/about.html')
  })

  test('dot-dot climbs out of the subdirectory', () => {
    assert.equal(resolveReference('sub/page.html', '../index.html'), '/index.html')
  })

  test('root-absolute is unchanged', () => {
    assert.equal(resolveReference('sub/page.html', '/index.html'), '/index.html')
  })

  test('query and fragment are stripped', () => {
    assert.equal(resolveReference('index.html', '/a.html?x=1#top'), '/a.html')
  })

  for (const external of [
    'https://example.com/x',
    'http://example.com/x',
    '//example.com/x',
    'mailto:someone@example.com',
    'tel:+441234567890',
    'data:image/png;base64,AAAA',
    '#section',
  ]) {
    test(`treats ${JSON.stringify(external)} as external/non-resolving`, () => {
      assert.equal(resolveReference('index.html', external), null)
    })
  }
})

describe('isInfrastructureReference', () => {
  // These are the references that made the original validator reject the
  // project's own reference iteration: script-generated, so never in the
  // model's file list, but linked from every well-behaved page.
  for (const ref of [
    '/timeline/',
    '/feed.xml',
    '/sitemap.xml',
    '/robots.txt',
    '/archive/',
    '/archive/2026-05-19/',
    '/_/analytics.js',
    '/_/og-default.png',
    '/assets/img/moon.png',
  ]) {
    test(`recognises ${ref}`, () => {
      assert.equal(isInfrastructureReference(ref), true)
    })
  }

  for (const ref of ['/index.html', '/about/', '/styles.css']) {
    test(`does not treat ${ref} as infrastructure`, () => {
      assert.equal(isInfrastructureReference(ref), false)
    })
  }
})
