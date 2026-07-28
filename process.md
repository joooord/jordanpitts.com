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
0. **Re-run guard** — if `memory.md` already logs an iteration for today, abort. A second run on the same date would overwrite that iteration's archive snapshot and double-log memory, producing two timeline entries pointing at one URL. Override with `FORCE=true` only after removing the existing entry and archive directory by hand.
1. **Read context** — harness files, recent memory, pending directive, asset index, previous iteration's analytics
2. **Snapshot previous** — replace `site/archive/<previous-iteration-date>/` with the current contents of `site/`, excluding orchestrator-owned paths (`archive/`, `_/`, `assets/`, `timeline/`, `feed.xml`, `sitemap.xml`, `robots.txt`). Replaces rather than merges, so a stale file from an earlier snapshot can never survive.
3. **Generate** — call Claude with the system prompt + all inputs; request structured output between sentinels
4. **Parse** — extract brief, files, memory entry, evaluation entry, chosen metric
5. **Validate (deterministic)** — HTML structure, OG metadata, consent script reference, allowed scripts, asset references
6. **Content review (second Claude pass)** — default Haiku checks the iteration against `rules.md` and `morality.md`; returns pass or fail with reasoning
7. **On failure** — one retry with `regenerateWithFix` (showing the error to the generator), then abort
8. **Write** — clear current iteration files from `site/` (preserving orchestrator-owned paths), write the new ones at their **normalised** paths, then sync `assets/` into `site/assets/` so `/assets/...` references resolve in production
9. **Log** — append to `memory.md` and `evaluation.md`. The orchestrator builds the `## YYYY-MM-DD — vN` heading itself and discards any heading the model wrote; see `scripts/memory.ts` for why
10. **Move directive** — if a directive was applied, move it to `directives/applied/<filename>--v<N>.md`
11. **Snapshot this iteration** — same replace-not-merge snapshot into `site/archive/<TODAY>/`. Makes the archive immediately complete.
12. **Generate timeline, feed, sitemap, robots** — regenerate `site/timeline/index.html`, `site/archive/index.html`, `site/feed.xml`, `site/sitemap.xml` and `site/robots.txt` from `memory.md`
13. **Pull-rebase & push** — fold in any concurrent commits, commit (drafts and log included), push to `main`
14. **Deploy** — Vercel auto-deploys on push
15. **Marketing** — **after** the push, never before: marketing announces a URL, and announcing it ahead of the deploy means a failed push leaves a live post pointing at a 404. Write drafts to `marketing/drafts/<today>/` for every channel; post via API for any channel where `MARKETING_AUTOPOST_<CHANNEL>=true` and credentials are set. Failures here never abort the run.
16. **Notify** — email Jordan with version, brief, link, metric and marketing summary. On failure, the email names the stage that failed.

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

## Validation checks

Implemented in `scripts/validate.ts` and `scripts/paths.ts`, and tested in
`scripts/__tests__/`. Every check below has at least one test asserting a good
iteration passes it and one asserting a bad one is caught. **If you add a rule to
`rules.md`, add the check and its tests here, or the rule is decoration.**

Shape (`assertShape`):
- `version` is an integer and equals the version this run must produce
- `brief`, `evaluationMetric`, `memoryEntry`, `evaluationEntry` are non-empty strings
- `files` is non-empty and contains `index.html`
- Every file path is legal after **normalisation** (see below) and unique
- Marketing block complete; `postShort` ≤ 180 chars, `postMedium` ≤ 500 chars
- `visitorQuestion`, if present, is well formed and `choice` questions carry options

Content (`validateIteration`):
- HTML well-formedness (`<html>`, `</html>`, `<head>`) for every `.html` file
- `og:title`, `og:description`, `twitter:card` present and non-empty, read as real
  meta tags rather than as substrings appearing anywhere in the document
- `og:image` and `twitter:image` present, **absolute `https://`, and not SVG**
- Every HTML page references `/_/analytics.js` as a script tag
- No `<script src>` to domains outside the approved analytics stack
- References resolve. Relative refs resolve against the **referring file's
  directory**; `/assets/...` must exist in the asset index; `/_/`, `/archive/`,
  `/timeline/`, `/feed.xml`, `/sitemap.xml` and `/robots.txt` are accepted as
  orchestrator-generated infrastructure
- A visible link to `/archive/` on the entry page
- The iteration date and version number visible in rendered text, not just markup
- Total weight under 1MB
- Visitor question rate limit: if the most recent iteration in `memory.md` has
  `Visitor question: yes`, this iteration must not include one

### Path normalisation is the security boundary

Paths are normalised **before** the reserved-name comparison. Comparing the raw
string meant `./_/analytics.js` and `x/../archive/2026-05-19/index.html` were
both accepted and written verbatim, so a generated iteration could replace shared
infrastructure or rewrite a published archive entry with nothing logged. The
orchestrator writes the normalised path, never the raw input.

Deferred: headless browser render check (Puppeteer) and Lighthouse CI for
performance and accessibility audits. Until then, `rules.md`'s console-error, LCP
and WCAG contrast lines are aspirations rather than enforced checks — the content
reviewer is explicitly told not to police aesthetics, so nothing catches them.

## Failure modes
- **API call fails** → abort, alert, leave site untouched
- **Generation truncated** (`stop_reason: max_tokens`) → abort with a message naming truncation, rather than mis-reporting it as a missing sentinel and retrying into the same wall
- **Parser fails** → one retry with stricter format instruction, then abort
- **Validation fails** → one retry asking the generator to fix the specific issue, then abort
- **Content reviewer returns garbage** → the review call is retried up to three times. This is *not* treated as a validation failure: regenerating an entire site because the gate malfunctioned is expensive and tells the generator something untrue about its work
- **Snapshot fails** → abort before generation (cannot lose previous version)
- **Commit/push fails** → alert; the iteration is discarded with the runner, and the generated output is uploaded as a CI artifact so it can be replayed
- **Deploy fails** → Vercel alerts separately; source of truth is the committed repo

A failed run leaves the live site unchanged: every destructive step happens after
every gate, and the push happens last. The archive is never overwritten — the
re-run guard and the replace-not-merge snapshot are what make that true rather
than merely intended.

## Notifications
- Sent to: `NOTIFY_EMAIL` env var (default: Jordan's email)
- Service: Resend
- On success: version, brief, link to live, link to archive entry, chosen metric
- On failure: stage that failed, error message, repo state

## Manual operations
- Trigger now: GitHub Actions → Tuesday iteration → Run workflow
- Dry run locally: `npm run tuesday:dry` (generates and validates but does not write, commit, or deploy)
- Roll back an iteration: revert the commit and force-push, or copy an archive entry back to `site/`
