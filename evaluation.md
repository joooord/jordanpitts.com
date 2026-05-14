# Evaluation

How we judge whether an iteration was good. The generator picks one or more metrics at brief time, analytics measure across the week, the result is logged here, the next brief reads recent results.

Closed loop. The eval metric is allowed to change weekly. It is not the same as the technical performance floor in `rules.md` — that floor is always required.

## Available metrics (initial set)
- Average time on site
- Median time on site
- Pages per visit
- Return visitor rate (% returning within 7 days)
- Direct shares (links pasted into chats, posts, etc. — proxied via referrer and UTM)
- Email signups (when the iteration includes signup)
- Press or backlink mentions
- Manual subjective rating (1–10, reviewed at next planning session)

The generator can propose a new metric not in this list. New metrics are added here when they earn their keep.

## How the loop runs
1. Brief picks the metric(s) — e.g. "this iteration optimises for time on site"
2. Iteration ships on Tuesday
3. Across the following week, the analytics stack measures
4. Result entered here under the iteration's date
5. Next brief reads recent results, decides what to optimise for next

## Format

```
## YYYY-MM-DD — v[N]
Metric chosen: X
Target (if any): Y
Result: Z
Notes: what the number means, surprises, hypotheses to test next.
```

## Note
Don't lock to one metric forever. The point is to learn what's interesting, not to game a single number. When a metric starts being optimised for at the cost of the manifesto's posture, retire it.
