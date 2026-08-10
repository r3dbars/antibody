# Verdicts — antibody spec v0

A **verdict** is one human judgment about one trace. Verdicts are the ground
truth the whole system calibrates against, and the only work a human ever has
to do.

## Storage: one append-only JSONL file per reviewer

`.antibody/verdicts/<reviewer>.jsonl`, committed to git.

One writer per file means team sync is `git pull` with **no merge conflicts,
ever**. The reviewer name comes from `git config user.name` (slugified), or
`$ANTIBODY_REVIEWER`.

## Record shape (one JSON object per line)

```json
{"trace":"tr-8f3a2c4190ab","verdict":"bad","note":"said March 15, source says March 12","fm":null,"by":"justin","at":"2026-08-09T14:02:11Z"}
```

| field | meaning |
|---|---|
| `trace` | the trace fingerprint (see `trace.md`) |
| `verdict` | `"bad"` or `"ok"` — **ok verdicts matter**: negative labels are half of ground truth |
| `note` | free-text open coding — what's wrong, in the reviewer's words |
| `fm` | `null` for open-ended review; an FM id when confirming/rejecting a known failure mode |
| `by` | reviewer slug (must match the file name) |
| `at` | ISO 8601 timestamp |

## Semantics

- **Append-only.** Corrections are new lines; the latest verdict per
  `(trace, fm)` wins, by timestamp.
- **Claim state** falls out for free: a trace is "reviewed" when any verdict
  references it. Review UIs show unclaimed traces first and label who
  reviewed what.
- **Disagreement is a feature.** Two reviewers with different verdicts on the
  same trace mark a failure-mode definition that needs sharpening — surface
  it, don't hide it.
- Verdicts with `fm: null` and `verdict: "bad"` are the input to distillation
  (drafting new failure modes). Verdicts with an `fm` are calibration labels
  for that mode.
- Verdict files contain **no conversation content** — only fingerprints and
  judgments — so committing them doesn't put transcripts in git.

## Suggestions: agents propose, humans resolve

`.antibody/suggestions.jsonl`, one shared append-only file, committed to git.
A **suggestion** is an agent's proposal that a trace matches a known failure
mode — never ground truth, always awaiting a human ruling.

```json
{"trace":"tr-8f3a2c4190ab","fm":"FM-001","reason":"\"I apologize\" — matched rule","by":"scan/FM-001","at":"2026-08-09T14:03:00Z"}
{"trace":"tr-8f3a2c4190ab","fm":"FM-001","resolved":"accepted","by":"justin","at":"2026-08-09T14:05:12Z"}
```

- A proposal with no later `resolved` line for the same `(trace, fm)` is
  **pending** and appears in `antibody review` as a visually distinct card.
- Writers: `antibody scan` auto-proposes every new hit from a *calibrating*
  checker (its way of asking for labels); agents propose via
  `antibody suggest`. A `(trace, fm)` pair is proposed at most once, ever.
- **Every ruling is a calibration label.** Accepting appends a `bad` verdict
  tagged with the FM ("this mistake applies here"); dismissing appends an `ok`
  verdict tagged with the FM ("not this mistake") — the negative labels that
  make a checker's false-positive rate measurable. Either way the human
  ruled; that's the point.
