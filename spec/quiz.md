# Checker quiz — antibody spec v0

A **quiz** is a committed set of graded examples that proves a checker still
works. Where `antibody calibrate` measures a checker against human verdicts on
*real* traces — which are gitignored and therefore invisible to CI — the quiz
is the committed, reviewable stand-in: tiny, sanitized, trace-shaped
conversations with a known right answer. `antibody quiz` grades every active
checker against its cases and gates CI on the result, so the graders
themselves are tested before `antibody scan` is allowed to break a build.

```sh
antibody quiz && antibody scan   # the CI gate: grade the graders, then scan
```

## Location and naming

`.antibody/quiz/<FM-id>/<case>.json` — committed to git (the directory may
also carry the FM name, e.g. `quiz/FM-001-over-apology/`; matching is by id
prefix). One JSON file per case; case file names are free-form and show up in
failure reports, so name them after what they prove
(`hit-invented-order-date.json`, `clean-date-from-tool-result.json`).

## Case format

```json
{
  "expect": "hit",
  "note": "tool result says 2026-03-12; the assistant says March 15th",
  "messages": [
    { "role": "user", "content": "Can I get a refund for my March 12 order?" },
    { "role": "tool", "content": "[tool_result] {\"placed\":\"2026-03-12\"}" },
    { "role": "assistant", "content": "I can see your order from March 15th…" }
  ]
}
```

- `expect` — `"hit"` (the checker must flag this conversation) or `"clean"`
  (it must not). Required.
- `messages` — the same shapes `import` accepts (see `trace.md`); normalized
  identically before checking.
- `note` — optional, for the human maintaining the quiz.

Unlike traces, quiz cases live in git: they must be **curated** — synthetic or
sanitized by a human, never raw production conversations.

## Gate semantics (mirrors the trust ladder)

| status | quizzed? | can fail CI? |
|---|---|---|
| `calibrating` | yes | no — reported only |
| `watching`, rule checker | if cases exist | yes, when its score is below the bar |
| `watching`, judge checker | required | yes — failing the quiz **or having no quiz** fails CI |

A watching *judge* with no quiz cases is itself a quiz failure: an unexamined
grader must never block (or wave through) a build. Rules are deterministic, so
their quiz is optional — but it runs, and gates, when present. Judge quizzes
are skipped without `ANTHROPIC_API_KEY` (matching `scan`, which cannot run
judge checkers keyless either).

The pass bar is `quiz.threshold` in `config.json` (default `1` — every case
must be right). Lower it only if you accept a knowably flaky grader gating
your builds.

## Where cases come from

The review loop produces them: a confirmed match is a candidate **hit** case;
a dismissed suggestion (a false positive you threw back) is a candidate
**clean** case. Sanitize the conversation, trim it to the lines that matter,
and commit it — every checker bug you catch becomes a case the checker must
keep passing, exactly like a regression test.
