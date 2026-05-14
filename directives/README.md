# Directives

Jordan's intervention channel. Drop a markdown file here any time. The generator reads any pending directive before producing the next iteration.

## How it works
- File name: `YYYY-MM-DD.md` — dated for the Tuesday the directive should apply to. If undated, applies to the next upcoming Tuesday.
- Anything inside is read as instruction. Plain English. No format required.
- After application, the file moves to `directives/applied/` with the iteration version appended to the filename.
- The directive's application is logged in `memory.md`.
- A directive can override `manifesto.md` and `morality.md` (soft limits only) for the single iteration it applies to. It cannot override `rules.md`.

## What goes in here
- A specific brief for the week: "this Tuesday: do X"
- A constraint: "don't use the colour orange this iteration"
- A reference: "look at brutalist architecture, react to it"
- A tonal nudge: "play it straighter this time"
- An asset drop: "use the photos in `/assets/scotland/`"
- A topic: "make something about the deep sea"
- Anything else

## What does not go in here
- Permanent rule changes — those go in `rules.md` after review
- Permanent posture changes — those go in `morality.md` after review
- Permanent direction changes — those go in `manifesto.md` after review

Directives are single-iteration overrides. Anything you want to stick should be promoted in a review.
