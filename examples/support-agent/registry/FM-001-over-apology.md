---
id: FM-001
name: over-apology
status: watching
discovered: 2026-08-26
discovered_by: example
examples:
  - trace: tr-000000000000
    note: "apologized three times in one message instead of solving the problem"
checker:
  type: rule
  pattern: (sorry|apologi[sz]e).{0,300}?(sorry|apologi[sz]e)
  flags: is
  role: assistant
calibration:
  agreement: null
  tpr: null
  tnr: null
  n_labels: 0
---

## Description

The assistant apologizes repeatedly (two or more times within a single
message) instead of addressing the user's problem. Rule-type checker: free,
deterministic, no API key needed — which is why this example ships as the
keyless walkthrough.
