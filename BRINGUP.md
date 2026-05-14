# Bring-up guide

Step-by-step walkthrough to take this project from a folder on your machine to a live, automated, scheduled website. Allow 60–90 minutes the first time. Order matters — earlier steps unblock later ones.

---

## 0. Prerequisites
- A computer with `git` installed.
- Accounts on: GitHub, Vercel, Resend, Google (for GA4), Anthropic.
- Access to your SiteGround DNS panel.

## 1. Create the GitHub repo
1. Go to github.com → New repository.
2. Name it `jordanpitts` (private or public — your call; private is safer).
3. Do not initialise with README, .gitignore, or licence — we'll push what we have.
4. Create.
5. Note the HTTPS or SSH URL shown on the next screen.

## 2. Push the project to GitHub
Open a terminal in the project folder (the one containing `README.md`, `rules.md`, `scripts/`, etc.).

Optional but recommended: install dependencies once locally first, which generates a `package-lock.json` and locks future CI builds to exact versions.
```bash
npm install
```

Then commit and push:
```bash
git init
git branch -M main
git add -A
git commit -m "v0 setup: harness + scripts + infrastructure"
git remote add origin <the URL from step 1>
git push -u origin main
```

If you skipped the `npm install` step, CI will still work — the workflow uses `npm install` (not `npm ci`), so it doesn't strictly require a lockfile. Committing one just makes builds deterministic.

## 3. Create the Vercel project
1. vercel.com → New Project → Import Git Repository.
2. Select the `jordanpitts` repo. Authorise GitHub access if asked.
3. Framework Preset: **Other**.
4. Build settings: leave defaults. Vercel will read `vercel.json` and serve `site/`.
5. Environment Variables: skip for now (we don't need any in Vercel — only GitHub Actions does).
6. Deploy. The first deploy will succeed but show "no index.html" — that's expected; v0 hasn't been generated yet.

## 4. Move jordanpitts.com DNS to Vercel
1. In Vercel → Project → Settings → Domains → Add `jordanpitts.com` and `www.jordanpitts.com`.
2. Vercel will show DNS records you need to set (an `A` record for the apex and a `CNAME` for `www`).
3. In SiteGround → Site Tools → Domain → DNS Zone Editor:
   - Replace the existing `A` record for `@` with the value Vercel gave you (`76.76.21.21` typically).
   - Replace or add a `CNAME` for `www` pointing to `cname.vercel-dns.com`.
4. Save. DNS can take 5 minutes to a few hours to propagate.
5. Back in Vercel, wait for the green check on both domains.

> Keep the domain registration on SiteGround — only the DNS records change.

## 5. Get model API keys
**Anthropic (default).** console.anthropic.com → API Keys → Create key. Copy and store. Top up credits if new ($10 is plenty to start).

**Optional — OpenAI** (for `gpt-*`/`o*` models). platform.openai.com → API Keys → Create. Useful if you want to occasionally swap the model via a directive line like `model: gpt-5`.

**Optional — Google** (for `gemini-*` models). aistudio.google.com → Get API key. Free tier is generous.

You only need Anthropic for v0. The other two slot in whenever you want to vary the model. The script auto-detects provider from the model string.

## 6. Get a Resend API key
1. resend.com → API Keys → Create API Key.
2. Permission: Sending access.
3. Copy and store.

(Optional polish, can be done later: in Resend, add `jordanpitts.com` as a verified Domain so notification emails come from `claude@jordanpitts.com` instead of `onboarding@resend.dev`. Follow Resend's DNS instructions in your SiteGround DNS panel.)

## 7. Create a GA4 property
1. analytics.google.com → Admin → Create property.
2. Name: `jordanpitts.com`. Pick UK timezone and GBP if relevant.
3. Add a Data Stream → Web → enter `https://jordanpitts.com`.
4. Copy the **Measurement ID** (looks like `G-XXXXXXXXXX`).
5. Open `site/_/consent.js` in the project and replace the `G-XXXXXXXXXX` placeholder with the real ID.
6. Commit and push:
   ```bash
   git add site/_/consent.js
   git commit -m "Wire up real GA4 measurement ID"
   git push
   ```

## 8. Add secrets to the GitHub repo
1. GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret.
2. Add each of these (one at a time):
   - `ANTHROPIC_API_KEY` = the key from step 5
   - `RESEND_API_KEY` = the key from step 6
   - `NOTIFY_EMAIL` = your email address
   - (Optional) `NOTIFY_FROM` = `Claude <claude@jordanpitts.com>` if you completed Resend domain verification; otherwise omit and the script defaults to the Resend sandbox sender.
   - (Optional) `OPENAI_API_KEY` and/or `GEMINI_API_KEY` — only if you plan to swap the model to a non-Claude provider on a given Tuesday.
3. (Defer for v0) `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — leave unset. The script handles their absence gracefully.

## 9. Seed assets (optional but recommended)
Drop any starter media into `assets/` and describe each one in `assets/README.md`. Even a small set helps v0 — Claude can only reference assets it has been told exist.

If nothing's ready, the project still ships without assets. The generator will use defaults.

## 10. Trigger the first run
1. GitHub → the repo → Actions tab.
2. Pick the "Tuesday iteration" workflow on the left.
3. Click "Run workflow" (top right of the workflow runs list).
4. Tick **Dry run** the first time. This generates the iteration and validates it but does not commit or deploy.
5. Click "Run workflow". Watch the logs.
6. If the dry run passes, run it again without "Dry run" ticked. This commits and deploys v0.

If anything errors, you'll get a failure email from Resend (or in the Actions logs). Read the error, fix, re-run. Common first-run issues:
- Missing GA4 measurement ID → step 7
- Resend domain unverified → use the sandbox sender (omit `NOTIFY_FROM`)
- API key invalid → regenerate and re-add to GitHub secrets
- Branch protection on `main` → temporarily disable or grant the bot push access

## 11. Verify
After a successful run:
- jordanpitts.com loads with v0 content (the placeholder is overwritten)
- jordanpitts.com/timeline/ shows v0 with a "current" badge
- jordanpitts.com/feed.xml is a valid RSS feed (paste into any RSS reader to test)
- jordanpitts.com/archive/2026-05-19/ exists and matches the live site
- jordanpitts.com/sitemap.xml lists `/`, `/timeline/`, and `/archive/2026-05-19/`
- jordanpitts.com/robots.txt allows all crawlers and points to the sitemap
- The consent banner appears on first visit (or no banner if your browser sends Do Not Track)
- A notification email arrived in your inbox

If a check fails, the live site won't have been updated — the script aborts on validation or review failure and leaves whatever was there before. Check the Actions log, fix, re-run.

## 12. Marketing — review drafts, then enable channels
Every Tuesday after deploy, the marketing module writes draft posts to `marketing/drafts/<date>/` for every channel (Bluesky, Mastodon, X, newsletter). Until you flip the autopost flags, nothing is sent anywhere — drafts are just for review.

When you're ready to switch a channel to auto-posting:

1. Generate credentials for that channel:
   - **Bluesky**: bsky.app → Settings → App Passwords → create one. Note your handle (e.g. `jordanpitts.bsky.social`) and the app password.
   - **Mastodon**: pick an instance (mastodon.social works), create an app at `/settings/applications` with `write:statuses` scope, copy the access token.
   - **X**: defer — needs an OAuth 2.0 user-context flow not yet implemented in `scripts/marketing.ts`.
   - **Newsletter (Buttondown)**: buttondown.com → Settings → Programming → copy API key.
2. Add the secrets to GitHub Actions:
   - `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD`
   - `MASTODON_INSTANCE_URL`, `MASTODON_ACCESS_TOKEN`
   - `BUTTONDOWN_API_KEY`
3. Flip the autopost flag for that channel via a repository variable or by editing `.github/workflows/tuesday.yml` defaults:
   - `MARKETING_AUTOPOST_BLUESKY=true`
   - `MARKETING_AUTOPOST_MASTODON=true`
   - `MARKETING_AUTOPOST_NEWSLETTER=true` (creates a Buttondown draft — sending is still manual unless you change `status: 'draft'` in `scripts/marketing.ts` to `'scheduled'`)
4. Read a couple of weeks of drafts before flipping. If they consistently look right, flip the switch. If anything feels off, leave drafts-only and refine the system prompt.

The full plan, budget allocation, and channel philosophy live in `MARKETING.md`.

## 13. Ongoing
- Every Tuesday at 06:00 UTC the workflow fires automatically.
- Drop a `directives/YYYY-MM-DD.md` file in the repo before a Tuesday to steer that week's iteration. Anything you write goes into the generator's context.
- Review the project periodically (suggested: once a month). Update `manifesto.md`, `morality.md`, `rules.md`, or `MARKETING.md` in review. Log a `## REVIEW — YYYY-MM-DD` entry in `memory.md` describing what changed and why.

## 14. Manual interventions
- **Roll back an iteration**: `git revert <commit>` and `git push`. Or copy a past `site/archive/YYYY-MM-DD/` directory back into `site/`.
- **Skip a week**: in `.github/workflows/tuesday.yml`, comment out the `schedule:` block, push, then restore when ready.
- **Fire a one-off now**: Actions → Run workflow → optionally override the model from the input dropdown.

If anything in this guide is wrong or missing, fix it as you go and commit the change — this guide should match the truth.
