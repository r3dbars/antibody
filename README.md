# 🚩 antibody

[![npm](https://img.shields.io/npm/v/antibody)](https://www.npmjs.com/package/antibody)
[![test](https://github.com/r3dbars/antibody/actions/workflows/test.yml/badge.svg)](https://github.com/r3dbars/antibody/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**The immune system for your AI application.** Flag a failure once. Catch it
whenever it comes back.

Your tests catch deterministic bugs. Antibody catches recurring AI behavior you
never want to ship again: fabricated facts, ignored instructions, broken tool
use, unhelpful refusals, or whatever *you* decide is wrong.

Antibody is a small CLI and a `.antibody/` folder in your repo. You review real
conversations, describe failures in plain language, and turn those decisions
into regression checks.

## See it work in 30 seconds

No install or API key required:

```sh
npx antibody demo
```

![A terminal demo where Antibody imports sample conversations, detects a known over-apology failure, shows the matching quote, and exits with code 1](https://raw.githubusercontent.com/r3dbars/antibody/main/assets/demo.gif)

The demo intentionally exits with code `1`. That is the win: a known failure
came back, so Antibody stopped the run.

## The whole idea

![Review real conversations, flag bad behavior, distill it into a failure pattern, and scan future conversations](assets/working-loop.svg)

1. **Review** conversations your application actually produced.
2. **Flag** a bad one and explain the problem in your own words.
3. **Distill** repeated flags into a named, reviewable failure pattern.
4. **Scan** new conversations and fail CI when a trusted failure returns.

If you know regression testing, you already know the mental model:

| Software testing | Antibody |
|---|---|
| A bug report | A flagged conversation |
| A regression test | A failure pattern |
| Test fixtures | Reviewed traces |
| The test suite | The failure registry |
| A failing build | A known behavior returned |

Antibody does not decide what “good AI” means. You make that call; Antibody
helps you remember it.

## Use it on your agent

Initialize Antibody inside your project:

```sh
cd your-agent-project
npx antibody init
```

Then run the loop whenever you have fresh conversations:

```sh
npx antibody import logs/  # normalize JSON or JSONL conversations
npx antibody review        # review locally and flag failures
npx antibody distill       # turn flags into draft failure patterns
npx antibody scan          # exit 1 if a trusted failure returned
```

Put `antibody scan` in CI once your checkers have earned your trust.

Using Claude Code or another coding agent? The [`skills/`](skills/) directory
teaches it the same loop. Ask it to *“install Antibody in this project and
review my agent's traces.”*

## What Antibody creates

There is no server or database. The state is ordinary files:

```text
.antibody/
├── .gitignore            # keeps traces out of git
├── config.json           # models and scan settings
├── traces/               # normalized conversations; local only
├── verdicts/             # human decisions; one JSONL file per reviewer
├── registry/             # known failure patterns; Markdown
├── suggestions.jsonl     # matches waiting for a human decision
└── scans/                 # scan summaries and trends
```

A failure pattern is readable, diffable, and code-reviewable:

```markdown
---
id: FM-001
name: fabricated-dates
status: calibrating
examples:
  - trace: tr-8f3a2c4190ab
    note: "promised a delivery date that appeared nowhere in the source"
checker:
  type: judge
---

## Description

States a specific date that is not supported by the conversation,
tool results, or source documents.
```

This is your application's immune memory: a versioned record of mistakes that
should not return.

## Checkers earn trust

An LLM judge can be wrong. New checkers therefore cannot block a build.

![A failure pattern moves from a draft, to report-only calibration, to CI gating only after a human promotes it](assets/trust-ladder.svg)

- **Proposed** patterns are drafts for you to inspect.
- **Calibrating** patterns report matches but cannot fail CI. Every accept or
  dismiss becomes another label.
- **Watching** patterns may fail CI. Promotion is a one-line status change that
  a human reviews and commits.

`npx antibody calibrate` shows agreement, true-positive rate, true-negative
rate, and label count. Antibody may suggest a promotion; it never promotes a
checker for you.

## Local where it matters

Raw conversations can contain sensitive data, so Antibody keeps them out of
Git by default.

| Stays local and Git-ignored | Designed to live in Git |
|---|---|
| Conversation text | Trace fingerprints and human verdicts |
| Messages and tool output | Failure-pattern definitions |
| Trace metadata | Calibration and scan summaries |

The review queue runs on localhost. Rule-based checkers run entirely on your
machine. `judge` checkers and `distill` use the configured LLM provider, so
review that provider's data policy before using them with sensitive traces.

Teams sync the shared memory with normal Git. Verdicts are append-only and use
one file per reviewer, avoiding the usual everyone-edits-the-same-file conflict.

## Checker types

- **Rule:** a narrow regular expression. Free, deterministic, and local.
- **Judge:** one narrow yes/no LLM check grounded in your examples. Useful when
  the failure cannot be expressed mechanically.

Prefer a rule whenever one can describe the failure. Use a judge when the
behavior requires interpretation.

## Honest limits

- `distill` and `judge` checkers currently use Anthropic and require
  `ANTHROPIC_API_KEY`. Rule checkers do not.
- Calibration needs labels. Expect roughly 10 or more verdicts before treating
  a score as meaningful.
- Import handles common JSON and JSONL message shapes. Unusual trace formats may
  need an adapter.
- A trace fingerprint depends on normalized conversation text. Reformatting the
  same conversation can create a new trace.

## Why this exists

Antibody packages the error-analysis loop from Hamel Husain and Shreya
Shankar's [Evals FAQ](https://hamel.dev/blog/posts/evals-faq/) into a small,
Git-native workflow. It is directly inspired by Shreya's
[error-discovery-skill](https://github.com/shreyashankar/error-discovery-skill).

File formats are documented in [`spec/`](spec/). Antibody is MIT licensed.
