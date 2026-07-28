# Rules

Constraints that hold for every iteration of jordanpitts.com. Updated by review only.

## Always
- Works on iOS Safari, Android Chrome, and the current + previous major versions of Chrome, Firefox, Safari, Edge on desktop
- Loads cleanly with no console errors, no unhandled rejections, no broken assets
- LCP under 2.5s on simulated 4G; total page weight under 1MB unless the iteration's brief justifies more
- Keyboard navigable; WCAG 2.1 AA contrast minimum
- HTTPS only, with HSTS, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy headers set (configured in `vercel.json`)
- All user input sanitised against XSS and injection; output-encoded where rendered
- Dependencies pinned and kept current; no known CVEs at deploy time
- Secrets in environment variables only; never inline
- Visible link to the archive on every iteration
- Visible iteration date and version number
- Open Graph and Twitter card metadata on every HTML page (title, description, image)
- `og:image` and `twitter:image` are **absolute `https://` URLs** and are **PNG or JPG, never SVG** — social platforms resolve neither relative URLs nor SVG previews
- Every HTML page references `/_/analytics.js` via `<script src="/_/analytics.js" defer></script>` in `<head>`
- Each iteration is captured as a losslessly snapshottable static archive before the next deploy
- Archive URLs are stable forever: `/archive/YYYY-MM-DD/`

## Analytics
- Analytics stack: **Plausible only, cookieless**, plus server logs
- `/_/analytics.js` loads it. No cookies, no localStorage, no fingerprinting, no cross-site identifiers
- **No consent banner.** Because nothing personal is stored and no cookie is set, no consent is required. Do not add one back without changing this rule first
- Do Not Track and Global Privacy Control are honoured: those visitors load no analytics at all
- Analytics never load outside production, so previews don't pollute the numbers the evaluation loop reads

## OG image
- Every HTML page sets `og:image` and `twitter:image`
- Both must be **absolute `https://` URLs**, and **PNG or JPG — never SVG**. A relative or SVG OG image unfurls blank on every major platform
- The project default is `https://jordanpitts.com/_/og-default.png`
- Iterations may write their own `og.png` / `og.jpg` into `site/` and reference it by absolute URL
- Iterations may reference any image in `assets/` that appears in the asset index; `assets/` is synced into `site/assets/` each run, so `/assets/...` resolves in production
- The default is preserved across iterations and never overwritten by the generator
- Files in `assets/` are never deleted once an iteration has referenced them — archived iterations depend on them

## Model
- The generator is provider-agnostic. The active model is set per-run by the `MODEL` env var (default: `claude-opus-5`).
- Model IDs are dateless from the Claude 4.6 generation onward. Verify any ID against the live model list before setting it — an invented ID fails every run at the first API call, which is exactly how this project lost its first ten Tuesdays.
  - `claude-opus-5` — default generator. Flagship generalist; the weekly iteration is design and writing work more than it is patch-generation.
  - `claude-fable-5` — alternate for code-heavy or highly interactive iterations. Leads the coding benchmarks.
  - `claude-haiku-4-5-20251001` — content reviewer. A cheap gate, not an author.
- Supported providers, auto-detected from the model string prefix:
  - `claude-*` → Anthropic (requires `ANTHROPIC_API_KEY`)
  - `gpt-*`, `o1*`, `o3*`, `o4*` → OpenAI (requires `OPENAI_API_KEY`)
  - `gemini-*` → Google Gemini (requires `GEMINI_API_KEY`)
- A directive may override the model for a single iteration by placing `model: <model-id>` as a frontmatter-style line.
- The model used for each iteration is recorded in `memory.md`. Variation across models is a feature: the longitudinal archive shows how different models think about the same harness.

## Never
- No sexually explicit content
- No gambling content or mechanics
- No content that exploits, endangers, or sexualises minors
- No hate speech, harassment, or targeted dehumanisation
- No real-world dangerous instructions (weapons, drugs, self-harm)
- No defamation of real people; no deepfakes or impersonation of real people without consent
- No misrepresentation of Jordan or unverified factual claims about real people, events, or products
- No tracking or third-party scripts beyond the approved analytics stack (`plausible.io`, `jordanpitts.com`)
- Nothing that breaks the archive or alters a past URL
- Nothing illegal in the UK, US, or EU

Full content posture and adjustable soft limits live in `morality.md`. Rules in this file are absolute and outrank everything else.

## Reserved paths in `site/`
The generator must not write to:
- `site/archive/` — past iterations are immutable
- `site/_/` — shared infrastructure (analytics loader, OG default) preserved across iterations
- `site/assets/` — synced from the repo's `assets/` each run
- `site/timeline/` — published chronological log, regenerated from `memory.md`
- `site/feed.xml` — RSS feed, regenerated from `memory.md`
- `site/sitemap.xml` — search engine sitemap, regenerated each Tuesday
- `site/robots.txt` — crawler directives, regenerated each Tuesday

These are enforced by the validator.

## Conflicts
Rules outrank the manifesto. `morality.md` is read alongside the rules. A `directives/YYYY-MM-DD.md` file overrides for a single iteration only and is logged. Edge cases go to `memory.md` and are resolved in review.
