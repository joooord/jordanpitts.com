// scripts/marketing.ts
// Marketing automation. Runs after the iteration is built and the timeline regenerated.
//
// Always writes drafts to `marketing/drafts/YYYY-MM-DD/` so Jordan can review and post manually.
// Channels with MARKETING_AUTOPOST_<CHANNEL>=true also post via API, gated on credentials.
//
// Failures never abort the Tuesday job — marketing is a side-effect, not core.

import { promises as fs } from 'fs'
import { join } from 'path'

export interface MarketingPayload {
  version: number
  date: string                  // YYYY-MM-DD
  brief: string
  headline: string
  postShort: string             // ≤280 chars
  postMedium: string            // 300–500 chars
  postLong: string              // 200–500 words, markdown
  imageAlt: string
  hashtags: string[]
  url: string                   // canonical iteration URL
  archiveUrl: string            // /archive/YYYY-MM-DD/ URL
}

export interface ChannelResult {
  channel: string
  status: 'posted' | 'drafted' | 'skipped' | 'failed' | 'disabled'
  url?: string
  error?: string
}

export interface MarketingResult {
  enabled: boolean
  channels: ChannelResult[]
}

export async function runMarketing(rootDir: string, payload: MarketingPayload): Promise<MarketingResult> {
  if (process.env.MARKETING_ENABLED === 'false') {
    return { enabled: false, channels: [{ channel: 'all', status: 'disabled' }] }
  }

  await writeDrafts(rootDir, payload)

  const results = await Promise.all([
    safe('bluesky', () => postToBluesky(payload)),
    safe('mastodon', () => postToMastodon(payload)),
    safe('x', () => postToX(payload)),
    safe('newsletter', () => sendNewsletter(payload)),
  ])

  await appendMarketingLog(rootDir, payload, results)
  return { enabled: true, channels: results }
}

async function safe(channel: string, fn: () => Promise<ChannelResult>): Promise<ChannelResult> {
  try {
    return await fn()
  } catch (err) {
    return { channel, status: 'failed', error: String((err as Error).message ?? err) }
  }
}

// ---------- Drafts ----------

async function writeDrafts(rootDir: string, p: MarketingPayload): Promise<void> {
  const dir = join(rootDir, 'marketing', 'drafts', p.date)
  await fs.mkdir(dir, { recursive: true })

  const hashtags = p.hashtags.map(t => '#' + t).join(' ')

  await fs.writeFile(join(dir, 'bluesky.txt'), [
    p.postShort,
    '',
    withUtm(p.url, 'bluesky', `v${p.version}`),
    hashtags ? '\n' + hashtags : '',
  ].join('\n').trim() + '\n')

  await fs.writeFile(join(dir, 'mastodon.txt'), [
    p.postMedium,
    '',
    withUtm(p.url, 'mastodon', `v${p.version}`),
    hashtags ? '\n' + hashtags : '',
  ].join('\n').trim() + '\n')

  await fs.writeFile(join(dir, 'x.txt'), [
    p.postShort,
    '',
    withUtm(p.url, 'x', `v${p.version}`),
    hashtags ? '\n' + hashtags : '',
  ].join('\n').trim() + '\n')

  await fs.writeFile(join(dir, 'newsletter.md'), [
    `# ${p.headline}`,
    '',
    p.postLong,
    '',
    `Read this iteration → ${withUtm(p.url, 'newsletter', `v${p.version}`)}`,
    `Browse the archive → ${withUtm('https://jordanpitts.com/timeline/', 'newsletter', `v${p.version}`)}`,
  ].join('\n'))

  await fs.writeFile(join(dir, 'image-alt.txt'), p.imageAlt + '\n')
  await fs.writeFile(join(dir, 'headline.txt'), p.headline + '\n')
}

// ---------- Bluesky ----------

async function postToBluesky(p: MarketingPayload): Promise<ChannelResult> {
  if (process.env.MARKETING_AUTOPOST_BLUESKY !== 'true') {
    return { channel: 'bluesky', status: 'drafted' }
  }
  const identifier = process.env.BLUESKY_IDENTIFIER
  const appPassword = process.env.BLUESKY_APP_PASSWORD
  if (!identifier || !appPassword) {
    return { channel: 'bluesky', status: 'skipped', error: 'missing BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD' }
  }

  const sessRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password: appPassword }),
  })
  if (!sessRes.ok) {
    return { channel: 'bluesky', status: 'failed', error: `login ${sessRes.status}` }
  }
  const sess = await sessRes.json() as { accessJwt: string; did: string; handle: string }

  const text = `${p.postShort}\n\n${withUtm(p.url, 'bluesky', `v${p.version}`)}`
  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess.accessJwt}` },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      record: { text, createdAt: new Date().toISOString(), $type: 'app.bsky.feed.post' },
    }),
  })
  if (!postRes.ok) {
    return { channel: 'bluesky', status: 'failed', error: `post ${postRes.status}` }
  }
  const data = await postRes.json() as { uri: string }
  const rkey = data.uri.split('/').pop() ?? ''
  return { channel: 'bluesky', status: 'posted', url: `https://bsky.app/profile/${sess.handle}/post/${rkey}` }
}

// ---------- Mastodon ----------

async function postToMastodon(p: MarketingPayload): Promise<ChannelResult> {
  if (process.env.MARKETING_AUTOPOST_MASTODON !== 'true') {
    return { channel: 'mastodon', status: 'drafted' }
  }
  const instance = process.env.MASTODON_INSTANCE_URL  // e.g. https://mastodon.social
  const token = process.env.MASTODON_ACCESS_TOKEN
  if (!instance || !token) {
    return { channel: 'mastodon', status: 'skipped', error: 'missing MASTODON_INSTANCE_URL or MASTODON_ACCESS_TOKEN' }
  }

  const status = `${p.postMedium}\n\n${withUtm(p.url, 'mastodon', `v${p.version}`)}`
  const res = await fetch(`${instance.replace(/\/$/, '')}/api/v1/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status, visibility: 'public' }),
  })
  if (!res.ok) {
    return { channel: 'mastodon', status: 'failed', error: `post ${res.status}` }
  }
  const data = await res.json() as { url: string }
  return { channel: 'mastodon', status: 'posted', url: data.url }
}

// ---------- X / Twitter ----------

async function postToX(p: MarketingPayload): Promise<ChannelResult> {
  if (process.env.MARKETING_AUTOPOST_X !== 'true') {
    return { channel: 'x', status: 'drafted' }
  }
  // X requires OAuth 2.0 user-context with a refresh-token dance.
  // Implementing that is non-trivial and best done once Jordan has a developer app set up.
  // For now: skip with a clear message.
  return {
    channel: 'x',
    status: 'skipped',
    error: 'X auto-posting not implemented yet. Use the draft in marketing/drafts/<date>/x.txt manually, or wait for the OAuth integration.',
  }
}

// ---------- Newsletter (Buttondown) ----------

async function sendNewsletter(p: MarketingPayload): Promise<ChannelResult> {
  if (process.env.MARKETING_AUTOPOST_NEWSLETTER !== 'true') {
    return { channel: 'newsletter', status: 'drafted' }
  }
  const apiKey = process.env.BUTTONDOWN_API_KEY
  if (!apiKey) {
    return { channel: 'newsletter', status: 'skipped', error: 'missing BUTTONDOWN_API_KEY' }
  }

  // Create a draft email in Buttondown rather than sending immediately —
  // even with autopost enabled, newsletters are higher-stakes than social posts.
  // Switch the `status` field below to "scheduled" when comfortable.
  const body = [
    p.postLong,
    '',
    `Read this iteration → ${withUtm(p.url, 'newsletter', `v${p.version}`)}`,
    `Browse the archive → ${withUtm('https://jordanpitts.com/timeline/', 'newsletter', `v${p.version}`)}`,
  ].join('\n')

  const res = await fetch('https://api.buttondown.com/v1/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${apiKey}` },
    body: JSON.stringify({ subject: p.headline, body, status: 'draft' }),
  })
  if (!res.ok) {
    return { channel: 'newsletter', status: 'failed', error: `create draft ${res.status}` }
  }
  const data = await res.json() as { id?: string; absolute_url?: string }
  return { channel: 'newsletter', status: 'posted', url: data.absolute_url ?? `buttondown:${data.id ?? 'unknown'}` }
}

// ---------- Log ----------

async function appendMarketingLog(rootDir: string, p: MarketingPayload, results: ChannelResult[]): Promise<void> {
  const logPath = join(rootDir, 'marketing', 'log.md')
  await fs.mkdir(join(rootDir, 'marketing'), { recursive: true })
  if (!await exists(logPath)) {
    await fs.writeFile(logPath, '# Marketing log\n\nAppend-only record of marketing activity per iteration.\n\n')
  }
  const lines = [
    `## ${p.date} — v${p.version}`,
    `Brief: ${p.brief}`,
    ...results.map(r => {
      const detail = r.url ? ` ${r.url}` : (r.error ? ` (${r.error})` : '')
      return `- **${r.channel}** — ${r.status}${detail}`
    }),
    '',
  ]
  await fs.appendFile(logPath, lines.join('\n') + '\n')
}

async function exists(path: string): Promise<boolean> {
  try { await fs.access(path); return true } catch { return false }
}

// ---------- Helpers ----------

function withUtm(url: string, source: string, campaign: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', source)
    u.searchParams.set('utm_medium', source === 'newsletter' ? 'email' : 'social')
    u.searchParams.set('utm_campaign', campaign)
    return u.toString()
  } catch {
    return url
  }
}
