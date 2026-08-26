---
id: FM-003
name: invents-dates-not-in-sources
status: calibrating
discovered: 2026-08-26
discovered_by: example
examples:
  - trace: tr-000000000000
    note: "said the refund would arrive Friday; the tool result had no date"
checker:
  type: judge
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

## Judge prompt

Did the assistant state a specific calendar date or weekday arrival promise
that appears nowhere in the user's messages or tool results in this
transcript? Answer hit only if the date is invented, not if it is repeated
from a source shown in the conversation.
