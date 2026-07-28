# Memory

Append-only log read by the generator before each iteration. Reviewed periodically.

## Format

Iteration entries:

```
## YYYY-MM-DD — v[N]
Brief: one sentence on the direction.
Built: one sentence on what shipped.
Notes: moves to repeat, moves to retire, anything that felt off.
Directive applied: filename, if any.
Model: which model generated the iteration.
Visitor question: yes | no    ← rate-limited; at most one per two iterations
```

Review entries:

```
## REVIEW — YYYY-MM-DD
Patterns across recent iterations. Changes to rules, morality, or manifesto. What is earning its keep.
```

---

## 2026-05-13 — harness setup
Built: README, rules, manifesto, morality, evaluation, directives/, process, scripts, prompts, vercel.json, consent.js, og-default.svg, this log.
Decisions:
- Cadence: weekly, every Tuesday. First deployed iteration is v0 on 2026-05-19.
- Stack: GitHub (source) + Vercel (deploy + cron) + Supabase (data, deferred). SiteGround keeps domain registration; DNS points at Vercel.
- Analytics: GA4 + Plausible + server logs, with a hand-rolled consent banner.
- Morality: sensible defaults, file is tweakable in review.
- Jordan intervention channel: `directives/` folder. First directive logged for v0.
- Evaluation metric is generator-chosen per iteration and can change weekly.
- Model is per-run configurable; default `claude-opus-4-7`, overridable via env or directive.
- Sequencing before v0 ships: evolution mechanics → assets → v0.
Model: claude-opus-4-7

## 2026-05-13 — Jordan's framing (captured at end of session)
- Project one-line: "the best website for no reason — for learning and art(ish)"
- Quality bar: "surprised and impressed" — both, not either
- Audience: "the person who needs it" — not a demographic, optimise for resonance
- v0 directive: "start with something curious" — see `directives/2026-05-19.md`
- Idea proposed but not yet committed: publish a timeline/history of iterations somewhere separate from the on-site archive. Possible forms: RSS feed, timeline page, newsletter, cross-post to social. To be designed in next review.

## 2026-05-13/14 — structural expansion (overnight + morning)
Pre-v0 build-out, all in the harness:
- **Timeline + RSS** — `site/timeline/` and `site/feed.xml` generated each Tuesday from `memory.md`. Sitemap and robots too. Implemented in `scripts/timeline.ts`.
- **Content review pass** — second Claude call (Haiku) checks each iteration and its marketing copy against `rules.md` and `morality.md` before deploy. Implemented in `scripts/review.ts`.
- **End-of-run snapshot** — every iteration archived immediately so `/archive/<today>/` is live the moment v0 ships.
- **Reserved paths** — `archive/`, `_/`, `timeline/`, `feed.xml`, `sitemap.xml`, `robots.txt` are all script-managed; generator rejects writes to them.
- **Placeholder `site/index.html`** — dignified holding page until v0 overwrites it.
- **DNT** — `site/_/consent.js` now honours Do Not Track: no banner, no analytics for those browsers.
- **Marketing automation** — `scripts/marketing.ts`. Drafts always written to `marketing/drafts/<date>/` (Bluesky, Mastodon, X, newsletter). Real API posting gated behind `MARKETING_AUTOPOST_<CHANNEL>=true` env vars. Default off. £200/month budget, plan in `MARKETING.md`.
- **Splinter strategy** — `SPLINTER.md` documents when and how to fork a banger iteration into its own project.
- **Visitor questions** — optional `visitorQuestion` field in the generator output. **Rate-limited: at most one per two iterations**, enforced by the script reading the previous iteration's "Visitor question: yes|no" flag in memory.
- **Type-checked CI** — workflow runs `tsc --noEmit` before the Tuesday job.
- **Tooling** — `tsconfig.json`, `.gitignore`, updated `.env.example`.
- **Provider-agnostic LLM client** — `scripts/llm.ts`. Tuesday and review now route through a single `callLLM()` that auto-detects provider from the model string (Anthropic, OpenAI, Gemini). Variation across models becomes part of the longitudinal artifact.

## 2026-06-06 — v0 built, never shipped (not an iteration)
An iteration titled "Look Closer" was authored by hand in a Cowork session into the
v0 / 2026-05-19 slot, because the automated Tuesday job had never run. It was
committed locally and never pushed, so no visitor ever saw it and no archive URL
was ever published.

On 2026-07-28 an audit found the job would have failed even with its secrets set:
five blockers in the code, including a validator that rejected the very references
every well-behaved iteration makes, and a reserved-path check bypassable with a
"./" prefix. See PLAN.md. The harness was rebuilt and tested, and v0 was withdrawn
so that the first published iteration is genuinely the first one — dated the day it
actually goes live, rather than launching ten weeks stale.

Deliberately recorded here without a version heading, so it does not enter the
timeline, the feed or the version count. It is project history, not an iteration.
