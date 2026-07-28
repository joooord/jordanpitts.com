# Iterations authored in a Cowork session

When an iteration is written by Claude in a Cowork session rather than by the
automated Tuesday job, the payload is kept here as `YYYY-MM-DD.json` and fed to
the pipeline with `ITERATION_FILE`:

```bash
ITERATION_FILE=iterations/2026-07-28.json npm run tuesday:cowork
```

The payload is exactly the JSON shape the generator returns, so it takes the same
path as an automated run: parse, validate, content review, write, log, archive,
regenerate the timeline, commit, push, market, notify. Nothing is hand-written
into `site/`, which means nothing skips a gate.

These files are kept rather than discarded because they are the only record of
what was authored as opposed to what was rendered. The archive holds the output;
this holds the intent, the brief, the marketing copy and the memory entry that
went with it.

`memory.md` records how each iteration was produced under `Provenance:`.
