# Launch plan

Written 2026-07-28, after a full audit of the harness. This supersedes `LAUNCH.md`, which
described the go-live as four config steps. It isn't. `LAUNCH.md` will be deleted when
Phase 4 completes.

## Where we actually are

v0 is built and committed locally (4 commits, clean tree, nothing pushed). The site is not
live: `jordanpitts.com` still resolves to SiteGround serving a holding page. The Vercel
project's last production deploy was March 2026, from the superseded Astro repo. The Tuesday
cron has never run.

The story so far has been that the job was "never armed" — that the only thing missing was
`ANTHROPIC_API_KEY`. That is not true, and it is the most important finding of the audit:

> **If the secrets had been set in May, the first Tuesday would still have failed.**

Five independent blockers sat in the code. Two of them (reserved-path bypass, silent version
drift) would not have failed loudly — they would have quietly corrupted the archive, which is
the one thing this project promises is permanent.

So the plan is not "arm it." The plan is: harden, prove, then author a v0 that deserves the
launch.

---

## Decisions taken (2026-07-28)

| Decision | Choice | Consequence |
|---|---|---|
| Repository | Reuse `joooord/jordanpitts.com` | Already connected to the Vercel project — a push deploys with no rewiring. This harness becomes branch `main`; `main` becomes the production branch. The old Astro site stays in history on `master`. The local remote (`joooord/jordanpitts`, which does not exist) gets repointed. |
| Visibility | Public | The harness — rules, manifesto, morality, the generator prompt — is readable. For a site whose premise is that an AI rewrites it weekly, publishing the instructions is part of the artifact. Secrets stay in Actions secrets. |
| Analytics | Plausible only, cookieless, **no consent banner** | Deletes `consent.js`, a whole section of `rules.md`, the GA4 placeholder blocker, and weight from every iteration. Plausible reports visit duration, which the evaluation loop needs. ~£9/mo. |
| Autonomy | **Cowork-driven for now**, API harness deferred | Claude generates each Tuesday's iteration in a Cowork session, running it *through the real scripts* rather than by hand. Removes the API blockers from the critical path without wasting any work — the deterministic half of the pipeline is shared. Phase 5 arms the cron later. |
| v0 dating | Deferred | Settled in Phase 3, before anything is publicly visible. |

### Why Cowork-first is not a detour

The only work specific to the API harness is three findings (model IDs, `max_tokens`/streaming,
`stop_reason` handling). Everything else — the validator, reserved paths, archive safety,
timeline, OG images, tests — is needed identically under both models. Deferring the API layer
defers roughly 5% of the work and removes the two hardest-to-diagnose failure modes from the
launch.

The condition: **iterations run through `scripts/`, not by hand.** If Claude hand-writes the
site each week, the pipeline never gets exercised and Phase 5 becomes a rewrite. Hand-running
v0 in June was the right call for a one-off; it is not a working method.

---

## Phase 1 — Harden the harness ✅ COMPLETE (2026-07-28)

No live side effects. Nothing here touched the domain or the repo's remote.

**Result: 145 tests, all passing. `tsc --noEmit` clean.** The code was restructured
so the safety-critical logic is pure and importable rather than buried in the
orchestrator:

| Module | Responsibility |
|---|---|
| `scripts/paths.ts` | Path normalisation and reserved-path rules — the security boundary |
| `scripts/validate.ts` | Deterministic validation of a generated iteration |
| `scripts/memory.ts` | Parsing and construction of `memory.md` entries — the version chain |
| `scripts/tuesday.ts` | Orchestration only |
| `scripts/__tests__/` | 145 tests. `npm run check` = typecheck + tests |

The suite was mutation-tested: reintroducing the original raw-string reserved-path
check produces exactly 6 failures, each naming a specific bypass. A test suite
that cannot fail is decoration.

### 1a. Blockers

- [x] **Reserved-path bypass.** `tuesday.ts:342-359` checks reserved names against the raw
      string, then normalises for traversal only. `./_/consent.js`, `./archive/2026-05-19/index.html`
      and `x/../_/consent.js` all pass and get written verbatim. Re-run the reserved-name check
      against the normalised path. *This is the one that can silently rewrite a past iteration.*
- [x] **Validator rejects legitimate iterations.** The reference-check allowlist covers
      `/assets/`, `/_/` and `/archive/` but not `/timeline/`, `/feed.xml`, `/sitemap.xml` or
      `/robots.txt` — all script-generated, so never in the model's file list. v0 links to
      `/feed.xml` and `/timeline/` and would be rejected. Add them.
- [x] **`assets/` is never served.** Vercel serves `site/` only; `assets/` is a sibling at the
      repo root, and the validator explicitly blesses `/assets/...` references. Copy `assets/`
      into `site/assets/` before validation and write. (Currently masked — `assets/` holds only
      a README.)
- [x] **Relative links resolved wrongly.** Relative refs are matched against a flat path list
      ignoring the referring file's directory, producing false passes and false failures in the
      same check. Resolve against the referrer's directory. Blocks any multi-page iteration.

### 1b. Silent-corruption fixes

- [x] **The script writes the memory heading, not the model.** `nextVersion`,
      `previousIterationDate` and the entire timeline are parsed from `## YYYY-MM-DD — vN` in a
      free-text string the model produces. A hyphen or en dash instead of U+2014 and the run
      *succeeds and ships*, but the iteration never appears in the timeline or feed, the version
      number repeats next week, and the previous iteration is never archived. Compounds weekly.
      Generate the heading deterministically; validate anything the model supplies against the
      regex before writing.
- [x] **Same-day re-run guard.** A second run on the same date merges over the existing archive
      snapshot (`copyDirExcluding` merges rather than replaces) and double-logs memory, producing
      two timeline entries pointing at one URL. Refuse to run when the latest memory entry is
      already today's date, unless `FORCE=true`. Make the snapshot replace, not merge.
- [x] **Validate `version`.** Currently only checked for presence — `"one"` or `47` passes and
      flows into the commit message, the directive filename (`--vNaN.md`), the email and the UTM
      campaign. Assert it is a number equal to `nextVersion`.
- [x] **Marketing fires before the push.** Posts announce the new URL and archive path before a
      byte is deployed; if the push then fails, the announcement points at a 404. Move
      `runMarketing` after `pullRebaseAndPush`. (Latent only because autopost defaults to off.)
- [x] **Notify never checks `res.ok`**, and the failure-path call swallows all exceptions. A bad
      Resend key means failures are announced to nobody. Check the response; log loudly on
      failure. Failure emails should name the stage, per `process.md`.

### 1c. Analytics simplification

- [x] Replace `site/_/consent.js` with a cookieless Plausible snippet. Keep the `/_/` path and
      the "every page references it" rule so the validator check survives unchanged.
- [x] Strip the consent/banner language from `rules.md`, `README.md`, `process.md` and
      `prompts/system.md`. Keep Do Not Track respect.
- [x] Update `evaluation.md`'s note about metrics being unmeasurable.

### 1d. OG images

- [x] `og:image` is currently a **relative-URL SVG**. OG requires absolute URLs, and no major
      platform renders SVG previews — every launch-day share would unfurl blank. Ship a real PNG
      default at an absolute URL, and make the validator require absolute `og:image` and
      `twitter:image`.

### 1e. Validator hardening

Cheap deterministic checks that `rules.md` promises and the validator does not perform:

- [x] Visible link to `/archive/` on every iteration (required by `rules.md` and the prompt)
- [x] Visible iteration date and version number
- [x] Total page weight under 1MB
- [x] `twitter:image` present (named in `rules.md`, missing from `requiredMeta`)
- [x] Unique file paths within a response (duplicates currently last-write-wins)
- [x] Tighten the OG and analytics-script checks — both are naked substring matches that pass if
      the string appears anywhere, including inside prose or a comment

### 1f. Tests — the thing that doesn't exist yet

The validator is the only barrier between a hallucinating model and the live domain, and it has
**zero test coverage**. That is precisely why 1a's first two bugs survived. This is the single
highest-value item in Phase 1.

- [x] `npm test` with fixture-based cases: a valid iteration passes; each reserved-path bypass is
      rejected; missing OG rejected; third-party script rejected; oversized page rejected;
      malformed memory heading rejected; duplicate paths rejected
- [x] A **golden-file pipeline rehearsal** — a canned generator response fed through the real
      parse → validate → write → timeline path in a temp directory. Exercises the whole
      deterministic pipeline with no API call and no cost.
- [x] Wire both into CI alongside `tsc --noEmit`

### 1g. Housekeeping

- [x] `trailingSlash: false` in `vercel.json` fights `rules.md`'s canonical `/archive/YYYY-MM-DD/`.
      Every non-homepage sitemap URL is a 308 redirect, which Search Console declines to index,
      and RSS items get redirect chains. Pick one convention and apply it everywhere.
- [x] `process.md` lists a "`vercel.json` security headers present and unchanged" validation check
      that does not exist anywhere in the code. Implement it or delete it — a documented safety
      control that is fiction is worse than no control.
- [x] Reconcile the remaining `process.md` ↔ code drift (snapshot exclusion lists, rejected path
      prefixes, `/archive/index.html` generation, the "anomalies" line in the notification).
- [x] `npm ci` + `npm audit` in CI instead of `npm install --no-audit` — `rules.md` requires
      pinned, CVE-checked dependencies and the lockfile is now committed.
- [x] Drop the unused `@supabase/supabase-js` dependency.
- [x] Stale directives are never reaped: if two are pending, the older is ignored forever and
      re-read every week.

---

## Phase 2 — Prove it

Nothing ships until all of this is green.

- [ ] `npx tsc --noEmit` clean (currently passes)
- [ ] `npm test` green
- [ ] Golden-file rehearsal produces a byte-correct `site/` in a temp dir
- [ ] Preview deploy to Vercel. Click through by hand: `/`, `/archive/`, `/archive/<date>/`,
      `/timeline/`, `/feed.xml`, `/sitemap.xml`, `/robots.txt`
- [ ] Paste the preview URL into Slack, iMessage and X's card validator — confirm the OG image
      actually renders
- [ ] Confirm Plausible registers a pageview from the preview

---

## Phase 3 — Author v0 properly

Only after Phase 2. This is the part that matters, and it gets a fresh session with room to
think — not a tail-end of an infrastructure day.

- [ ] Write the v0 directive
- [ ] Generate through the pipeline, held to the manifesto's bar: surprising **and** impressive,
      specific over generic, confident over safe, worth telling someone about
- [ ] Settle the dating question — restamp v0 as its launch date, or keep 2026-05-19 and let the
      gap be part of the record
- [ ] Marketing drafts reviewed by hand before anything is posted

---

## Phase 4 — Go live

Steps only Jordan can take are marked **[J]**.

- [ ] **[J]** Repoint the local remote to `github.com/joooord/jordanpitts.com`
- [ ] **[J]** Push this harness as branch `main` (must be run from your own computer — a cloud
      session has no push credentials)
- [ ] **[J]** Vercel → project settings → production branch `main`, framework preset `astro` →
      Other/static, confirm `outputDirectory: site`
- [ ] **[J]** Vercel → add domain `jordanpitts.com` and `www`
- [ ] **[J]** SiteGround → update DNS to the records Vercel shows. Registration stays at
      SiteGround. Allow for propagation.
- [ ] **[J]** Create the Plausible property for `jordanpitts.com`
- [ ] Verify live: the six URLs above, over HTTPS, on the real domain, on a phone

---

## Phase 5 — Arm the API harness (later)

Deferred, not abandoned. Everything above makes this a small job.

- [ ] Verify real model IDs against `GET /v1/models`. `claude-opus-4-7` does not exist; neither
      does `claude-sonnet-4-6`. Both are currently defaults. `claude-haiku-4-5-20251001`
      (the reviewer) is real.
- [ ] Fix `max_tokens: 64000` — above the Opus output cap, a 400 on the configured default
- [ ] Switch generation to streaming. The SDK's 10-minute timeout × 2 retries = 30 minutes = the
      workflow timeout exactly, so a hung call gets SIGKILLed and **no failure email is sent**
- [ ] Check `stop_reason === 'max_tokens'` — truncated output is currently misreported as
      "missing sentinels" and pointlessly retried
- [ ] Retry the *review* call on malformed reviewer output, rather than regenerating the entire
      site because Haiku fumbled its JSON
- [ ] Upload the generated output as a CI artifact on failure, so a week's work isn't lost with
      the runner
- [ ] Update `@anthropic-ai/sdk` (currently 0.30.1, ~19 months old)
- [ ] **[J]** Set `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM`
- [ ] Dispatch with `dry_run = true`, read the output, then arm the cron
- [ ] Supervise the first two or three Tuesdays before letting it run unattended

---

## What "1000% solid" means here

Three properties, in order of importance:

1. **A bad iteration can never damage a good one.** The archive is immutable and the reserved
   paths are genuinely unwritable. This is the promise the project makes to anyone who links to
   it, and right now it is not kept.
2. **Every failure is loud.** No silent SIGKILL, no swallowed email error, no iteration that
   ships but never appears in the timeline. A failure that nobody hears about is worse than one
   that wakes you up.
3. **The gates are tested, not assumed.** The validator is safety-critical code with no tests.
   Until that changes, "solid" is a feeling rather than a fact.

Everything in Phase 1 serves one of those three.
