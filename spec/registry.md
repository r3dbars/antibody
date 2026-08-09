# Failure-mode registry — antibody spec v0

The registry is your agent's **immune memory**: one Markdown file per known
failure mode, committed to git in `.antibody/registry/`. Files are
human-readable, agent-readable, diffable, and code-reviewable — promotion to
CI-gating status is a one-line diff a human approves.

## File name

`FM-<###>-<name>.md`, e.g. `FM-001-fabricated-dates.md`. Ids are sequential
and never reused.

## Format: YAML frontmatter + Markdown body

```markdown
---
id: FM-001
name: fabricated-dates
status: watching          # proposed → calibrating → watching → retired
discovered: 2026-08-09
discovered_by: justin
examples:                 # ground truth — the flagged traces that define it
  - trace: tr-8f3a2c4190ab
    note: "said March 15, source says March 12"
checker:
  type: judge             # judge | rule
  model: claude-haiku-4-5 # judge only; omit to use the workspace default
calibration:
  agreement: 0.94         # vs human labels — the trust score
  tpr: 0.9                # of human-flagged traces, how many the checker catches
  tnr: 0.96               # of human-cleared traces, how many it correctly clears
  n_labels: 17
  last_checked: 2026-08-09
---

## Description

States a specific calendar date that does not appear in any input, tool
result, or source document.

## Judge prompt

Did the assistant state a specific calendar date that appears nowhere in the
user's messages, tool results, or provided documents?
```

## Status lifecycle (the trust ladder)

| status | meaning | scanned? | can fail CI? |
|---|---|---|---|
| `proposed` | drafted from flags, not yet reviewed | no | no |
| `calibrating` | scanned and reported, trust unproven | yes | **no** |
| `watching` | calibrated, trusted | yes | **yes** |
| `retired` | no longer relevant | no | no |

Two invariants:

1. **Only `watching` modes gate.** An untrusted judge must never block a ship.
2. **Status changes are human commits.** Tools may *suggest* a promotion;
   applying it is editing the file and merging the diff.

## Checker types

- `judge` — one narrow LLM call per trace asking a single yes/no question
  (the `## Judge prompt` section), with the human notes from `examples` as
  grounding. Narrowness is the quality thesis: one failure mode per judge.
- `rule` — a regex (`checker.pattern`, optional `checker.flags`, optional
  `checker.role` to restrict which messages are searched). Free and
  deterministic; use whenever the failure is mechanically detectable.
  Regex is deliberately the *only* code-like checker — arbitrary executable
  checkers from repo files are a sandboxing hazard.
