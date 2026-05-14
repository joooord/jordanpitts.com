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
- Every HTML page references `/_/consent.js` via `<script src="/_/consent.js" defer></script>` in `<head>`
- Each iteration is captured as a losslessly snapshottable static archive before the next deploy
- Archive URLs are stable forever: `/archive/YYYY-MM-DD/`

## Analytics and consent
- Analytics stack: GA4 + Plausible + server logs
- The `/_/consent.js` script handles the consent banner and conditionally loads GA4/Plausible only after consent is granted
- The banner is shown to every first-time visitor regardless of geography; rejection persists for the session
- This is intentionally simple for v0 and can be replaced with a third-party CMP in a later review

## OG image
- Every HTML page sets `og:image` (and `twitter:image`)
- The project default is `/_/og-default.svg`
- Iterations may write their own `og.svg` / `og.png` / `og.jpg` into `site/` and reference it
- Iterations may reference any image in `assets/` that appears in the asset index
- The default is preserved across iterations and never overwritten by the generator

## Model
- The generator is provider-agnostic. The active model is set per-run by the `MODEL` env var (default: `claude-opus-4-7`).
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
- No tracking or third-party scripts beyond the approved analytics stack (`googletagmanager.com`, `plausible.io`, `jordanpitts.com`)
- Nothing that breaks the archive or alters a past URL
- Nothing illegal in the UK, US, or EU

Full content posture and adjustable soft limits live in `morality.md`. Rules in this file are absolute and outrank everything else.

## Reserved paths in `site/`
The generator must not write to:
- `site/archive/` — past iterations are immutable
- `site/_/` — shared infrastructure (consent script, OG default, etc.) preserved across iterations
- `site/timeline/` — published chronological log, regenerated from `memory.md`
- `site/feed.xml` — RSS feed, regenerated from `memory.md`
- `site/sitemap.xml` — search engine sitemap, regenerated each Tuesday
- `site/robots.txt` — crawler directives, regenerated each Tuesday

These are enforced by the validator.

## Conflicts
Rules outrank the manifesto. `morality.md` is read alongside the rules. A `directives/YYYY-MM-DD.md` file overrides for a single iteration only and is logged. Edge cases go to `memory.md` and are resolved in review.
