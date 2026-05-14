# Process

The weekly Tuesday job, end to end.

## Schedule
- Cron: every Tuesday at 06:00 UTC (07:00 BST in summer)
- Triggered by GitHub Actions (`.github/workflows/tuesday.yml`)
- Manual trigger available via `workflow_dispatch` for testing or "fire now"

## Repository layout
```
<repo root>/
├── README.md, rules.md, manifesto.md, morality.md, evaluation.md, memory.md   # harness
├── directives/                        # Jordan's intervention channel
│   └── applied/                       # archive of applied directives
├── prompts/                           # generator system prompt
├── scripts/                           # the Tuesday job
├── assets/                            # original media library
├── .github/workflows/                 # CI / cron
├── package.json, .env.example, vercel.json
└── site/                              # ← Vercel deploys this
    ├── index.html                     # current iteration
    ├── ... (current iteration files)
    └── archive/
        ├── 2026-05-19/                # v0 snapshot
        └── ...
```

`vercel.json` sets `outputDirectory: "site"`. The harness markdown files at the repo root are not served; the project itself runs on the same domain via Vercel's serving of `site/`.

## Inputs read at job start
- `rules.md`, `manifesto.md`, `morality.md`, `evaluation.md`
- `memory.md` — last 8 entries
- Pending directive in `directives/YYYY-MM-DD.md` if present
- `assets/README.md` — asset manifest
- Previous iteration's analytics summary from Supabase (skipped on first run)

## Step by step
1. **Read context** — harness files, recent memory, pending directive, asset index, previous iteration's analytics
2. **Snapshot previous** — copy `site/*` (excluding `archive/`, `_/`, `timeline/`, `feed.xml`) into `site/archive/<previous-iteration-date>/` if a previous iteration exists. Idempotent.
3. **Generate** — call Claude with the system prompt + all inputs; request structured output between sentinels
4. **Parse** — extract brief, files, memory entry, evaluation entry, chosen metric
5. **Validate (deterministic)** — HTML structure, OG metadata, consent script reference, allowed scripts, asset references
6. **Content review (second Claude pass)** — default Haiku checks the iteration against `rules.md` and `morality.md`; returns pass or fail with reasoning
7. **On failure** — one retry with `regenerateWithFix` (showing the error to the generator), then abort
8. **Write** — clear current iteration files from `site/` (preserving `archive/` and `_/`), write the new ones
9. **Log** — append entries to `memory.md` and `evaluation.md`
10. **Move directive** — if a directive was applied, move it to `directives/applied/<filename>--v<N>.md`
11. **Snapshot this iteration** — copy the just-written `site/*` (excluding `archive/`, `_/`, `timeline/`, `feed.xml`) into `site/archive/<TODAY>/`. Makes the archive immediately complete.
12. **Generate timeline, feed, sitemap, robots** — regenerate `site/timeline/index.html`, `site/feed.xml`, `site/sitemap.xml`, and `site/robots.txt` from `memory.md`
13. **Marketing** — write drafts to `marketing/drafts/<today>/` for every channel; post via API for any channel where `MARKETING_AUTOPOST_<CHANNEL>=true` and credentials are set. Failures here never abort the run.
14. **Pull-rebase & push** — fold in any concurrent commits, commit (drafts and log included), push to `main`
15. **Deploy** — Vercel auto-deploys on push
16. **Notify** — email Jordan with version, brief, link, metric, marketing summary, anomalies

## Generator output format
Claude returns a single block wrapped between unique sentinels (not triple-backtick fences, to avoid collisions with backticks inside generated file content):

```
<<<OUTPUT_START>>>
{
  "version": 0,
  "brief": "one to three sentences",
  "evaluationMetric": "time_on_site",
  "files": [
    {"path": "index.html", "content": "..."}
  ],
  "memoryEntry": "markdown formatted per memory.md",
  "evaluationEntry": "markdown formatted per evaluation.md",
  "notes": "anything next-week's generator should know",
  "marketing": {
    "headline": "...",
    "postShort": "≤280 chars",
    "postMedium": "300–500 chars",
    "postLong": "200–500 words, markdown",
    "imageAlt": "...",
    "hashtags": ["..."]
  },
  "visitorQuestion": {
    "prompt": "...",
    "kind": "open | choice",
    "options": ["..."],
    "placeholder": "...",
    "rationale": "..."
  }
}
<<<OUTPUT_END>>>
```

`marketing` is required. `visitorQuestion` is optional and rate-limited to at most one per two iterations (enforced by the script reading the previous iteration's `Visitor question: yes|no` line in memory).

File paths are relative to `site/`. The parser rejects paths starting with `/`, `..`, `archive/`, or `_/`, and any path that resolves outside `site/`.

## Validation checks (v0 baseline)
- HTML well-formedness (presence of `<html>`, `</html>`, `<head>`) for every `.html` file
- `site/index.html` exists
- OG title, description, image and Twitter card meta tags present on every HTML page
- Every HTML page references `/_/consent.js`
- No `<script src>` to domains outside the approved analytics stack
- Asset references (`src=` / `href=`) resolve: absolute `/assets/...` paths must exist in the asset index; relative paths must match a generated file; `/_/` and `/archive/` paths are accepted as infrastructure
- `vercel.json` security headers present and unchanged
- Marketing block present with all required fields; `postShort` ≤ 280 chars, `postMedium` ≤ 500 chars
- Visitor question rate limit: if `memory.md`'s most recent iteration has `Visitor question: yes`, this iteration must not include one

Deferred to a follow-up: headless browser render check (Puppeteer) and Lighthouse CI for performance and accessibility audits.

## Failure modes
- **API call fails** → abort, alert, leave site untouched
- **Parser fails** → one retry with stricter format instruction, then abort
- **Validation fails** → one retry asking Claude to fix the specific issue, then abort
- **Snapshot fails** → abort before generation (cannot lose previous version)
- **Commit/push fails** → alert; repo state may be partial
- **Deploy fails** → Vercel alerts separately; source-of-truth is the committed repo

A failed run leaves the live site unchanged. The archive is never overwritten.

## Notifications
- Sent to: `NOTIFY_EMAIL` env var (default: Jordan's email)
- Service: Resend
- On success: version, brief, link to live, link to archive entry, chosen metric
- On failure: stage that failed, error message, repo state

## Manual operations
- Trigger now: GitHub Actions → Tuesday iteration → Run workflow
- Dry run locally: `npm run tuesday:dry` (generates and validates but does not write, commit, or deploy)
- Roll back an iteration: revert the commit and force-push, or copy an archive entry back to `site/`
