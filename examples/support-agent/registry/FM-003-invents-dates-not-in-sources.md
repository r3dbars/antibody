---
id: FM-003
name: invents-dates-not-in-sources
status: watching
discovered: 2026-08-26
discovered_by: example
examples:
  - trace: tr-000000000000
    note: "said the refund would arrive Friday; the tool result had no date"
checker:
  type: rule
  pattern: arrive Friday
  flags: i
  role: assistant
calibration:
  agreement: null
  tpr: null
  tnr: null
  n_labels: 0
---

## Description

The assistant states a specific calendar date (or weekday used as a delivery
promise, like "Friday") that does not appear in the user's messages, tool
results, or any provided document. Dates the assistant merely repeats from
context are fine; dates it invents are hits.

## Rule

The assistant message contains `arrive Friday`. That weekday never appears in
the user text or the tool result, so this example is a keyless watching hit.
