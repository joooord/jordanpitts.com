// scripts/timeline.ts
// Generates the published timeline page and RSS feed from memory.md.
// Called by tuesday.ts after writeSite. Deterministic — no model involvement.

import { promises as fs } from 'fs'
import { join } from 'path'
import { ITERATION_HEADING_RE } from './memory'

/** Absolute, raster OG image. Social platforms resolve neither relative URLs nor SVG. */
const OG_IMAGE = 'https://jordanpitts.com/_/og-default.png'

interface IterationEntry {
  date: string
  version: number
  brief: string
  built: string
  notes: string
  model: string
}

export async function generateTimelineAndFeed(
  rootDir: string,
  memoryMarkdown: string,
): Promise<void> {
  const entries = parseEntries(memoryMarkdown)
  const siteDir = join(rootDir, 'site')

  const timelineHtml = renderTimelineHtml(entries)
  await fs.mkdir(join(siteDir, 'timeline'), { recursive: true })
  await fs.writeFile(join(siteDir, 'timeline', 'index.html'), timelineHtml)

  // Archive index, so the site-wide "/archive/" link resolves instead of 404ing.
  // The per-date snapshots live at /archive/<date>/; this page lists them.
  const archiveHtml = renderArchiveIndex(entries)
  await fs.mkdir(join(siteDir, 'archive'), { recursive: true })
  await fs.writeFile(join(siteDir, 'archive', 'index.html'), archiveHtml)

  const feedXml = renderRssFeed(entries)
  await fs.writeFile(join(siteDir, 'feed.xml'), feedXml)

  const sitemap = renderSitemap(entries)
  await fs.writeFile(join(siteDir, 'sitemap.xml'), sitemap)

  const robots = renderRobots()
  await fs.writeFile(join(siteDir, 'robots.txt'), robots)
}

function parseEntries(memory: string): IterationEntry[] {
  const lines = memory.split('\n')
  const entries: IterationEntry[] = []
  let current: IterationEntry | null = null
  for (const line of lines) {
    const m = line.match(ITERATION_HEADING_RE)
    if (m) {
      if (current) entries.push(current)
      current = { date: m[1], version: parseInt(m[2], 10), brief: '', built: '', notes: '', model: '' }
    } else if (line.startsWith('## ')) {
      if (current) entries.push(current)
      current = null
    } else if (current) {
      if (line.startsWith('Brief:')) current.brief = line.replace(/^Brief:\s*/, '').trim()
      else if (line.startsWith('Built:')) current.built = line.replace(/^Built:\s*/, '').trim()
      else if (line.startsWith('Notes:')) current.notes = line.replace(/^Notes:\s*/, '').trim()
      else if (line.startsWith('Model:')) current.model = line.replace(/^Model:\s*/, '').trim()
    }
  }
  if (current) entries.push(current)
  return entries.reverse() // newest first
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function renderTimelineHtml(entries: IterationEntry[]): string {
  const items = entries.map((e, i) => {
    const isCurrent = i === 0
    const linkHref = isCurrent ? '/' : `/archive/${e.date}/`
    const linkText = isCurrent ? 'Currently live →' : 'View this iteration →'
    const currentBadge = isCurrent ? '<span class="badge">current</span>' : ''
    return `
    <article class="entry${isCurrent ? ' current' : ''}">
      <header>
        <time datetime="${e.date}">${e.date}</time>
        <span class="version">v${e.version}</span>
        ${currentBadge}
      </header>
      <h2>${escapeHtml(e.brief || '(no brief recorded)')}</h2>
      ${e.built ? `<p class="built">${escapeHtml(e.built)}</p>` : ''}
      ${e.notes ? `<p class="notes">${escapeHtml(e.notes)}</p>` : ''}
      <footer>
        <a href="${linkHref}">${linkText}</a>
        ${e.model ? `<span class="model">${escapeHtml(e.model)}</span>` : ''}
      </footer>
    </article>`
  }).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Timeline — jordanpitts.com</title>
  <meta name="description" content="A chronological log of every iteration of jordanpitts.com." />
  <meta property="og:title" content="Timeline — jordanpitts.com" />
  <meta property="og:description" content="A chronological log of every iteration of jordanpitts.com." />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <link rel="alternate" type="application/rss+xml" title="jordanpitts.com — iterations" href="/feed.xml" />
  <script src="/_/analytics.js" defer></script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2rem 1rem 6rem; background: #0a0a0a; color: #fafafa; font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; }
    main { max-width: 720px; margin: 0 auto; }
    h1 { font-weight: 400; font-size: 2.5rem; margin: 0 0 0.5rem; }
    .lede { color: #9a9aa8; margin: 0 0 3rem; font-style: italic; }
    .entry { padding: 2rem 0; border-top: 1px solid #2a2a2a; }
    .entry header { display: flex; gap: 1rem; align-items: baseline; color: #6a6a78; font-family: system-ui, sans-serif; font-size: 0.875rem; }
    .entry time { letter-spacing: 0.02em; }
    .entry .version { font-variant: tabular-nums; }
    .entry h2 { font-weight: 400; font-size: 1.5rem; margin: 0.5rem 0 1rem; }
    .entry p { margin: 0.5rem 0; color: #c0c0c8; }
    .entry .built { font-style: italic; color: #9a9aa8; }
    .entry .notes { color: #8a8a98; font-size: 0.95rem; }
    .entry footer { margin-top: 1rem; display: flex; gap: 1.5rem; align-items: baseline; font-family: system-ui, sans-serif; font-size: 0.875rem; }
    .entry footer a { color: #9bd1ff; text-decoration: none; border-bottom: 1px dotted currentColor; }
    .entry footer a:hover { color: #ffffff; }
    .entry .model { color: #4a4a58; font-variant: tabular-nums; }
    .entry .badge { background: #1e3a5f; color: #9bd1ff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }
    .entry.current { border-top-color: #1e3a5f; }
    nav { margin-top: 4rem; font-family: system-ui, sans-serif; font-size: 0.875rem; }
    nav a { color: #9bd1ff; text-decoration: none; margin-right: 1.5rem; border-bottom: 1px dotted currentColor; }
    nav a:hover { color: #ffffff; }
  </style>
</head>
<body>
  <main>
    <h1>Timeline</h1>
    <p class="lede">Every iteration of jordanpitts.com, newest first.</p>
    ${items || '<p class="lede">(no iterations published yet)</p>'}
    <nav>
      <a href="/">Current iteration</a>
      <a href="/feed.xml">RSS feed</a>
    </nav>
  </main>
</body>
</html>`
}

function renderArchiveIndex(entries: IterationEntry[]): string {
  const items = entries.map((e, i) => {
    const isCurrent = i === 0
    const badge = isCurrent ? '<span class="badge">current</span>' : ''
    return `
    <article class="entry">
      <header>
        <time datetime="${e.date}">${e.date}</time>
        <span class="version">v${e.version}</span>
        ${badge}
      </header>
      <h2>${escapeHtml(e.brief || '(no brief recorded)')}</h2>
      ${e.built ? `<p class="built">${escapeHtml(e.built)}</p>` : ''}
      <footer>
        <a href="/archive/${e.date}/">Open this iteration &rarr;</a>
        ${e.model ? `<span class="model">${escapeHtml(e.model)}</span>` : ''}
      </footer>
    </article>`
  }).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Archive — jordanpitts.com</title>
  <meta name="description" content="Every past iteration of jordanpitts.com, kept forever at a stable URL." />
  <meta property="og:title" content="Archive — jordanpitts.com" />
  <meta property="og:description" content="Every past iteration of jordanpitts.com, kept forever at a stable URL." />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <link rel="alternate" type="application/rss+xml" title="jordanpitts.com — iterations" href="/feed.xml" />
  <script src="/_/analytics.js" defer></script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2rem 1rem 6rem; background: #0a0a0a; color: #fafafa; font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; }
    main { max-width: 720px; margin: 0 auto; }
    h1 { font-weight: 400; font-size: 2.5rem; margin: 0 0 0.5rem; }
    .lede { color: #9a9aa8; margin: 0 0 3rem; font-style: italic; }
    .entry { padding: 2rem 0; border-top: 1px solid #2a2a2a; }
    .entry header { display: flex; gap: 1rem; align-items: baseline; color: #6a6a78; font-family: system-ui, sans-serif; font-size: 0.875rem; }
    .entry .version { font-variant: tabular-nums; }
    .entry h2 { font-weight: 400; font-size: 1.5rem; margin: 0.5rem 0 1rem; }
    .entry p { margin: 0.5rem 0; color: #c0c0c8; }
    .entry .built { font-style: italic; color: #9a9aa8; }
    .entry footer { margin-top: 1rem; display: flex; gap: 1.5rem; align-items: baseline; font-family: system-ui, sans-serif; font-size: 0.875rem; }
    .entry footer a { color: #9bd1ff; text-decoration: none; border-bottom: 1px dotted currentColor; }
    .entry footer a:hover { color: #ffffff; }
    .entry .model { color: #4a4a58; font-variant: tabular-nums; }
    .entry .badge { background: #1e3a5f; color: #9bd1ff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }
    nav { margin-top: 4rem; font-family: system-ui, sans-serif; font-size: 0.875rem; }
    nav a { color: #9bd1ff; text-decoration: none; margin-right: 1.5rem; border-bottom: 1px dotted currentColor; }
    nav a:hover { color: #ffffff; }
  </style>
</head>
<body>
  <main>
    <h1>Archive</h1>
    <p class="lede">Every iteration of jordanpitts.com, kept at a stable URL forever. Newest first.</p>
    ${items || '<p class="lede">(no iterations archived yet)</p>'}
    <nav>
      <a href="/">Current iteration</a>
      <a href="/timeline/">Timeline</a>
      <a href="/feed.xml">RSS feed</a>
    </nav>
  </main>
</body>
</html>`
}

function renderSitemap(entries: IterationEntry[]): string {
  const latest = entries[0]?.date
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: 'https://jordanpitts.com/', lastmod: latest },
    { loc: 'https://jordanpitts.com/timeline/', lastmod: latest },
    { loc: 'https://jordanpitts.com/archive/', lastmod: latest },
    ...entries.map(e => ({ loc: `https://jordanpitts.com/archive/${e.date}/`, lastmod: e.date })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`
}

function renderRobots(): string {
  return `User-agent: *
Allow: /
Sitemap: https://jordanpitts.com/sitemap.xml
`
}

function renderRssFeed(entries: IterationEntry[]): string {
  const items = entries.map(e => `
    <item>
      <title>v${e.version}: ${escapeXml(e.brief || '(no brief)')}</title>
      <link>https://jordanpitts.com/archive/${e.date}/</link>
      <guid isPermaLink="true">https://jordanpitts.com/archive/${e.date}/</guid>
      <pubDate>${new Date(e.date + 'T06:00:00Z').toUTCString()}</pubDate>
      <description>${escapeXml((e.built || '') + (e.notes ? ' — ' + e.notes : ''))}</description>
    </item>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>jordanpitts.com — iterations</title>
    <link>https://jordanpitts.com/</link>
    <description>An evolving website, regenerated weekly by Claude. Archived in full.</description>
    <language>en</language>
    <atom:link href="https://jordanpitts.com/feed.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`
}
