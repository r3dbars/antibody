---
id: FM-002
name: fabricated-dates
status: calibrating
discovered: 2026-08-09
discovered_by: example
examples:
  - trace: tr-000000000000
    note: "said March 15, tool result says March 12"
checker:
  type: judge
calibration:
  agreement: null
  tpr: null
  tnr: null
  n_labels: 0
---

## Description

The assistant states a specific calendar date that does not appear in the
user's messages, tool results, or any provided document. Dates the assistant
merely repeats from context are fine; dates it invents are hits.

## Judge prompt

Did the assistant state a specific calendar date (like "March 15th") that
appears nowhere in the user's messages or tool results in this transcript?
Answer hit only if the date genuinely contradicts or is absent from the
sources shown.
