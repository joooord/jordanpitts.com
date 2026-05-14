# Marketing

How jordanpitts.com finds the person who needs it.

## Principles
- Marketing serves the work, not the other way around. We share what was made; we don't make iterations to perform well.
- The audience is "the person who needs it" — not a demographic. Cast wide and let resonance decide.
- Automation is the default. Manual where it matters — launches, sponsorship conversations, real outreach.
- Honest framing: this is AI-generated in collaboration with a human. Visible in the metadata, the timeline, and any copy that describes the project.
- Draft-first. Nothing posts until trust is built. Drafts are committed to the repo each Tuesday for review.

## Budget
- £200/month, first month. Jordan's donation.
- Increase trigger: 1000 visits/day average over a week → next tier.
- Initial spend: minimal. We don't know what works yet. Let organic + cross-posting establish a baseline first.

## Channels

### Automated (every Tuesday after deploy, drafts generated; posting gated behind env flags)
- **Bluesky** — short post, OG image, link. Free AT Protocol API.
- **Mastodon** — medium post, OG image, link. Free, requires choosing an instance.
- **X / Twitter** — short post, OG image, link. Free tier capped at ~500 posts/month — fine for weekly.
- **Newsletter** — long-form blurb generated, written to `marketing/drafts/<date>/newsletter.md`. Sent via Buttondown (or similar) when explicitly enabled.
- **RSS** — already published at `/feed.xml`. Self-service for subscribers.

### Manual (one-offs, especially v0 launch)
- Hacker News (Show HN)
- Designernews
- Sidebar.io
- Tiny Awards / curated indie web lists
- A short list of people who'd care

### Paid (start small, scale on signal)
- Newsletter sponsorships in design / AI / art newsletters (rotating, one at a time, ~£50 each)
- Reserve budget for one experiment per month
- Defer Google / Meta / X ads until we know what audience responds — too easy to spend the whole £200 on the wrong people

## Budget allocation (month 1, suggested)
- £0 — social posting (automated, free)
- £8 — Buttondown newsletter subscription (when enabled)
- £50 — one newsletter sponsorship test (after v2 ships, when we have something to point at)
- £40 — premium tools / one-off purchases (Buffer if needed for scheduling, image tooling, etc.)
- £100+ — reserve. One experiment in week 3 or 4 based on signal. Could be a paid Reddit promotion, an X promoted post, a creator gifting, anything.

If the £200 isn't all spent month 1, that's correct, not a failure.

## How posts are generated
Each Tuesday's iteration includes a `marketing` block in the generator's output:

- `headline` — one sentence, no period, used as post and email subjects
- `post_short` — ≤280 characters, plain text, no link (link is appended by the poster)
- `post_medium` — 300–500 characters, plain text, no link
- `post_long` — 200–500 words, markdown allowed, suitable for newsletter
- `image_alt` — accessibility description of the OG image
- `hashtags` — array of tags without `#` (poster prepends)

The content review pass checks marketing copy against the same rules and morality file as the iteration itself.

## Draft flow
After deploy, the marketing module:
1. Writes drafts to `marketing/drafts/YYYY-MM-DD/` (one file per channel)
2. For each channel, if `MARKETING_AUTOPOST_<CHANNEL>=true` and credentials are present, posts and records the resulting URL
3. Appends a row to `marketing/log.md` recording date, channel, status, URL or error

Drafts are committed to the repo each Tuesday so Jordan can review and post manually if auto-posting is off.

## Off switches
- `MARKETING_ENABLED=false` — kills marketing entirely (no drafts, no posts).
- `MARKETING_AUTOPOST_BLUESKY=false` (and similar per channel) — drafts only, no API calls.
- A directive line `marketing: skip` — skips marketing for one iteration. The iteration ships normally.

Default state for v0: `MARKETING_ENABLED=true`, all `MARKETING_AUTOPOST_*=false`. Drafts only.

## Measurement
- All shared links UTM-tagged per channel: `?utm_source=bluesky&utm_medium=social&utm_campaign=v<N>` etc.
- Tracked in GA4 + Plausible.
- An iteration's evaluation metric may reference marketing performance ("shares from Bluesky", "newsletter clickthrough").
- The marketing log is reviewed monthly alongside the harness.

## What's not in scope for v0
- LinkedIn auto-posting (annoying API, low audience fit for now)
- Reddit auto-posting (ban risk)
- Hacker News auto-posting (no API)
- TikTok / Instagram (video-first, much higher production cost)
- Email list growth campaigns (focus on the work first, the list grows from referrers)
