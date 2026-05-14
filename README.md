# jordanpitts.com

An evolving website. Regenerated weekly. Archived in full. Actively marketed.

> The best website for no reason — a place for learning and art(ish).

## Harness
- `rules.md` — absolute constraints (security, devices, content limits, performance floor, OG, consent)
- `manifesto.md` — direction for the current period
- `morality.md` — adjustable content posture and soft limits
- `evaluation.md` — what "good" means this week; how it's measured
- `memory.md` — append-only log of iterations and reviews
- `process.md` — the Tuesday job specification, end to end
- `MARKETING.md` — channels, budget, draft-first approach
- `SPLINTER.md` — when and how to fork an iteration into its own project
- `BRINGUP.md` — step-by-step setup guide
- `directives/` — Jordan's intervention channel; one-iteration overrides
- `prompts/system.md` — the generator's system prompt
- `assets/` — original media library, with manifest in `assets/README.md`
- `marketing/` — generated post drafts (`drafts/<date>/`) and the marketing log

## Code
- `scripts/tuesday.ts` — the weekly job
- `scripts/llm.ts` — provider-agnostic LLM client (Anthropic / OpenAI / Gemini, auto-detected)
- `scripts/timeline.ts` — generates `/timeline/`, `/feed.xml`, `/sitemap.xml`, `/robots.txt` from `memory.md`
- `scripts/review.ts` — second-Claude content review pass against rules and morality (covers marketing copy too)
- `scripts/marketing.ts` — channel adapters for Bluesky / Mastodon / X / newsletter; draft-first
- `.github/workflows/tuesday.yml` — cron + manual-trigger workflow with type-check
- `vercel.json` — deploy config and security headers
- `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` — project housekeeping

## Deployment surface (`site/`)
- `site/index.html` — the current iteration's entry (pre-launch placeholder before v0 ships)
- `site/<other files>` — current iteration's assets
- `site/archive/YYYY-MM-DD/` — past iterations, immutable
- `site/_/` — shared infrastructure preserved across iterations:
  - `site/_/consent.js` — cookie consent + conditional analytics loader (honours Do Not Track)
  - `site/_/og-default.svg` — default Open Graph image (iterations may override)
- `site/timeline/` — published chronological log, regenerated each Tuesday from `memory.md`
- `site/feed.xml` — RSS feed, regenerated each Tuesday
- `site/sitemap.xml` — search engine sitemap, regenerated each Tuesday
- `site/robots.txt` — crawler directives, regenerated each Tuesday

The generator may not write to any of the reserved paths above. All are enforced by the validator.

## Process (summary)
Each Tuesday at 06:00 UTC:
1. Read harness + recent memory + pending directive + asset index + last week's analytics
2. Snapshot the previously-live iteration into `site/archive/<previous-date>/` (belt-and-braces; idempotent)
3. Call Claude with all the above; receive structured output between sentinels
4. Validate deterministically (HTML, OG, consent script, allowed scripts, asset references)
5. Content review: second Claude pass against `rules.md` and `morality.md`
6. (On failure: one retry with feedback, then abort — site untouched)
7. Write the new files into `site/` (preserving `archive/` and `_/`)
8. Append log entries to `memory.md` and `evaluation.md`
9. Move any applied directive to `directives/applied/`
10. Snapshot the just-shipped iteration into `site/archive/<today>/`
11. Regenerate `timeline/`, `feed.xml`, `sitemap.xml`, `robots.txt`
12. Pull-rebase, commit, push to `main` — Vercel auto-deploys
13. Email Jordan with version, brief, link, metric

Full detail in `process.md`.

## Stack
- Source: GitHub
- Deploy + cron: Vercel + GitHub Actions
- Data + analytics aggregation: Supabase (deferred for v0)
- Domain registration: SiteGround (DNS points at Vercel)
- Analytics: GA4 + Plausible + server logs, with a hand-rolled consent banner

## Versioning
- v0: first deployed iteration (target: 2026-05-19)
- v1, v2, ... weekly thereafter
- Harness setup is logged in `memory.md` without a version number

## Models
- Provider-agnostic via `scripts/llm.ts`. Set the model with `MODEL` env var or workflow input.
- Supported, auto-detected by prefix:
  - `claude-*` → Anthropic (needs `ANTHROPIC_API_KEY`)
  - `gpt-*`, `o1*`, `o3*`, `o4*` → OpenAI (needs `OPENAI_API_KEY`)
  - `gemini-*` → Google Gemini (needs `GEMINI_API_KEY`)
- A directive may override the model with a `model: <id>` line in the directive file.
- Default generator: `claude-opus-4-7`. Default content reviewer: `claude-haiku-4-5-20251001`. Both swappable.
