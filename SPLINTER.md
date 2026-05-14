# Splinter cells

When a particular iteration resonates strongly — a "banger" — we fork it into its own project. The splinter takes on a life of its own. The main jordanpitts.com continues evolving from whatever was learned.

This document defines what a splinter is, when to make one, how to make one, and what changes vs stays.

## What is a splinter

A splinter is a new standalone project, born from a single iteration of jordanpitts.com that demonstrated unusual resonance, share count, return rate, press, or just felt like it deserved its own room.

Each splinter has its own:
- Domain (e.g. `splinter-name.com` or a subdomain)
- Repository
- Identity (may share visual DNA with the source iteration; may diverge)
- Cadence (might evolve weekly like the parent, or freeze, or evolve differently)
- Audience (likely overlaps with jordanpitts.com but not identical)

The parent project — jordanpitts.com — continues unchanged, but its `memory.md` records the splinter event and the lessons it generated.

## When to splinter

Loose criteria — splintering is ultimately a judgement call by Jordan:

- The iteration generated unusual traction — share count, press, return visits, conversation
- The iteration's premise feels like it needs more room than a weekly slot affords
- The iteration's audience reads as distinct enough from the main project's to warrant their own home
- Jordan genuinely wants to spend more time on it

Don't splinter:
- Because an iteration is "nice" — niceness is the baseline, not a signal
- Because of one good metric — wait for multiple signals
- If the iteration only worked *because* it was an iteration of jordanpitts.com — context matters

Signals that *aren't* trigger conditions but should be considered:
- Direct emails from visitors asking for more of it
- A specific community (subreddit, newsletter, group) repeatedly engaging with it
- A clear product or art project that could grow from the seed

## How to splinter — process

1. **Pick the iteration.** Identify the source by date (e.g. `2026-08-04`). It's already snapshotted at `site/archive/2026-08-04/`.
2. **Decide cadence.** Static fork (the splinter is itself unchanging, an artifact) or harness fork (the splinter has its own weekly Tuesday job, possibly with a different rhythm).
3. **Spin up the repo.** Copy the archive directory into a fresh git repo. If harness fork: also copy the relevant scripts and customise the harness files (rules, manifesto, morality) for the splinter's distinct intent.
4. **Acquire the domain.** Splinter-specific, registered fresh. Vercel handles deploy.
5. **Update the parent's `memory.md`.** Add a `## SPLINTER — YYYY-MM-DD` entry recording: source iteration, splinter domain, why it earned the split.
6. **Cross-link.** The parent's timeline references the splinter. The splinter credits the parent in a small "born from jordanpitts.com on YYYY-MM-DD" line.
7. **Decide who tends it.** Jordan + Claude, or just Jordan, or just Claude. Each splinter may have a different relationship to its makers.

A future `scripts/splinter.ts` can automate steps 3 and 5 — given a date and a target domain, scaffold the splinter repo. Build it when we actually use it the first time.

## What changes between parent and splinter

Each splinter inherits from the parent and then deviates. The deviations themselves are the interesting part — they document what made the iteration earn its split.

- The parent's `manifesto.md` is replaced with a splinter-specific manifesto: what is this *one* thing about?
- The parent's `morality.md` may be tightened or loosened depending on what the splinter is about.
- The parent's `rules.md` largely carries over (security, accessibility, OG, consent are universal).
- The parent's `evaluation.md` is rewritten: how do we judge this thing on its own terms?
- The parent's `memory.md` starts fresh, with a single "born from" entry.
- The parent's `directives/` and `assets/` start empty.

## What stays universal

These survive across splinters and reflect the project's deepest values:

- Honest framing: every splinter discloses its AI-generated, human-collaborated nature
- Archive integrity: nothing once shipped becomes inaccessible
- Consent banner and respect for Do Not Track
- The rules in `rules.md` around content limits (sexual / gambling / exploitative / hateful / dangerous / illegal) are absolute and not subject to deviation per splinter

## When a splinter dies

Some splinters will fail. They'll attract no audience, lose Jordan's interest, or simply stop being interesting. That's fine — they remain accessible at their domain (or a static export of them remains accessible). A splinter that ceases to evolve is logged in the parent's `memory.md`. It is not a failure of the parent project.

## The strategic role

Splinters spread the project's risk. If jordanpitts.com itself becomes too predictable, splintering lets the genuinely interesting work walk away with its own legs. Over years, we may end up with a network of splinters, each pointing back at the parent, each its own thing. That is a feature.
