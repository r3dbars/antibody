---
name: antibody-scan
description: Run an antibody scan over agent traces, interpret the report, and diagnose or fix regressions of known failure modes. Use when the user asks to scan traces, check CI failures from antibody, or investigate why a failure mode is hitting again.
---

# antibody scan (agent-driven)

You are the self-healing half of antibody: the scan report is structured food
for you, not just a dashboard for humans.

## Running a scan

```
antibody scan [trace files...] --json
```

- No args scans every stored trace; passing files imports them first.
- Exit 1 means a `watching` failure mode has hits — a known, trusted-checker
  failure recurred. Exit 0 with hits on `calibrating` modes is informational.
- `--only FM-001` and `--sample 50` control scope and cost.
- In CI, run `antibody quiz` first: it grades every checker against the
  committed cases in `.antibody/quiz/` and exits 1 if a `watching` checker
  fails (or a watching judge has none) — never trust a scan verdict from a
  judge that is currently failing its quiz. See `spec/quiz.md`.

## When a watching mode hits

1. **Read the failure mode**: `.antibody/registry/FM-###-*.md` — the
   description, judge prompt, and example notes define exactly what "broken"
   means here.
2. **Read the hit traces**: `.antibody/traces/<id>.json`, at the line numbers
   the report cites. Confirm the hit is real; judges are calibrated but not
   perfect (check the FM's `calibration` block for its trust level).
3. **Diagnose upstream.** The interesting question is what *changed* — a
   prompt edit, a model swap, a tool change. Compare against
   `.antibody/scans/` history (`previousHits` in the report shows the trend).
4. **Fix and re-scan.** Apply the fix to the agent's prompt/code, regenerate
   traces if you can, and re-run the same scan. Include before/after hit
   counts in your summary or PR description — that's the evidence.
5. **If you believe the hit is a false positive**, say so with the quote, and
   suggest the human record `antibody verdict <trace> ok --fm FM-###` — their
   verdict feeds calibration, and a drifting judge shows up in
   `antibody calibrate`.

## What you must not do

- Don't edit a failure mode's `status` to make a scan pass. Only humans
  promote or retire modes, via a committed diff.
- Don't delete or weaken quiz cases to make `antibody quiz` pass. A failing
  quiz means the checker regressed — fix the checker (its pattern or judge
  prompt) and let the human review that diff.
- Don't delete verdicts or scan history.
- Don't treat `calibrating` hits as build failures — they're signal for
  calibration, not gates.
