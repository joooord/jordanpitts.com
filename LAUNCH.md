# Launch / go-live checklist

Status as of 2026-06-06: **v0 is built and committed, but the site is not live and the weekly automation has never run.** This file records why, and exactly what only you can do to fix it.

## Why v0 never shipped

The harness was set up on 2026-05-13/14 (commit `e6a743d`). v0 was scheduled to generate automatically on Tuesday 2026-05-19 via `.github/workflows/tuesday.yml` (cron `0 6 * * 2`). It never produced an iteration, and the live placeholder still reads "v0 pending — Tuesday 2026-05-19".

The cause is configuration, not code: the Tuesday job needs repository **secrets that were never set**. With no `ANTHROPIC_API_KEY`, the generate step aborts immediately and the site is left untouched (which is the harness behaving correctly — a failed run never overwrites the live site). The project also doesn't appear to be connected to Vercel or the domain yet, so even the placeholder may not be served.

So nothing was broken — it was just never armed.

## What I did in this session (no live side effects)

- Generated and built **v0** (`site/index.html`) by hand, following `prompts/system.md`, the v0 directive, and the rules. It replaces the stale placeholder.
- Ran the deterministic half of the Tuesday pipeline: logged v0 to `memory.md` and `evaluation.md`, moved the directive to `directives/applied/2026-05-19--v0.md`, snapshotted v0 to `site/archive/2026-05-19/`, and regenerated `timeline/`, `feed.xml`, `sitemap.xml`, `robots.txt`.
- Wrote the v0 marketing drafts to `marketing/drafts/2026-05-19/` (draft-only — nothing posted).
- Fixed a latent bug: the site links to `/archive/` but nothing generated `/archive/index.html`, so that link would have 404'd. `scripts/timeline.ts` now generates it each week.
- Added `package-lock.json` for reproducible CI installs.
- Committed everything locally as the `v0` commit. **I did not push** — pushing is what triggers a live deploy, so that's left to you (see below).

## What only you can do (go-live steps)

### 1. Set GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → New repository secret.

- [ ] `ANTHROPIC_API_KEY` — **required.** The default generator and the content reviewer are both Claude. (Only swap to `OPENAI_API_KEY` / `GEMINI_API_KEY` if you change `MODEL`.)
- [ ] `NOTIFY_EMAIL`, `RESEND_API_KEY`, `NOTIFY_FROM` — recommended, for the per-run success/failure email (via Resend).
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — optional. Analytics aggregation; deferred for v0, safe to skip for now.
- [ ] Marketing (all optional; drafts are written regardless). Leave the `MARKETING_AUTOPOST_*` flags at `false` to stay draft-only: `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD`, `MASTODON_INSTANCE_URL`, `MASTODON_ACCESS_TOKEN`, `BUTTONDOWN_API_KEY`.

### 2. Connect Vercel
- [ ] Import the GitHub repo as a Vercel project. It reads `vercel.json` automatically (`outputDirectory: site`, security headers, clean URLs).
- [ ] Confirm the production branch is `main`. The first deploy serves `site/index.html`.

### 3. Point the domain
- [ ] In Vercel, add `jordanpitts.com`. At SiteGround, update DNS to the records Vercel shows (apex `A` / `www` `CNAME`). Keep registration at SiteGround.

### 4. Set the real analytics ID (before trusting metrics)
- [ ] In `site/_/consent.js`, replace the `G-XXXXXXXXXX` placeholder with the real GA4 measurement ID. Plausible is already set to `jordanpitts.com`. Until then the banner shows but GA4 loads a placeholder, so v0's "median time on site" metric can't be measured yet.

### 5. Go live
- [ ] `git push origin main` (Vercel auto-deploys), **or** GitHub → Actions → "Tuesday iteration" → Run workflow. Tip: run once with `dry_run = true` to generate + validate without committing.
- [ ] After that, the cron takes over: the next iteration generates automatically each Tuesday at 06:00 UTC.

## A note on v0's date

v0 is dated **2026-05-19** — its originally scheduled slot — so it lines up with the directive filename, the placeholder's promise, and the archive/sitemap/feed URLs. The internal logs note it was actually authored on 2026-06-06. If you'd rather stamp it with today's date, it's a small change in `site/index.html`, `memory.md`, `evaluation.md`, the archive folder name, and the applied-directive filename — tell me and I'll redo it.
