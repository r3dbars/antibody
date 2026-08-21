# Executable quizzes — antibody spec v1

A quiz is a reproducible product input plus a reviewable behavioral contract.
It tests a behavior, not one magic output sentence.

## File and lifecycle

Store quizzes as YAML in `.antibody/quizzes/`. Each quiz has one lifecycle:

`draft → proving → blocking → retired`

- `draft`: incomplete or not yet reproduced.
- `proving`: runnable and report-only.
- `blocking`: trusted enough to gate CI after a human-reviewed diff.
- `retired`: retained as history but no longer run.

Only `blocking` quizzes may fail a gate. Antibody never promotes a quiz.

## Format

```yaml
schema: antibody.quiz.v1
id: FM-002.001
failure_mode: FM-002
name: do-not-invent-delivery-date
status: proving
suite: fast

input:
  user: Where is order 123?
  tool_result:
    delivery_estimate: null

expect:
  - path: result.answer
    excludes:
      - Friday
      - tomorrow
  - path: observations.tool_called
    equals: delivery_lookup
  - path: metrics.latency_ms
    number_lte: 500

control:
  case: FM-002.002

proof:
  known_bad_ref: abc123
  known_bad_outcome: fail

source:
  issue: 42
  trace: tr-8f3a2c4190ab
```

`input` is passed to the product adapter without interpretation. `expect` is
an ordered list of deterministic assertions over the adapter result.

Supported graders:

- `equals`, `not_equals`
- `starts_with`
- `includes`, `includes_any`, `includes_all`, `excludes`
- `matches_regex`
- `path_exists`
- `count_equals`, `count_lte`
- `number_lte`, `number_gte`
- `maximum_words`
- `expected_silence`, `expected_output`

Every assertion has a `path` using dot notation. Missing paths fail unless the
grader is `path_exists: false`.

## Controls and proof

Every regression quiz should have a nearby healthy control. A fix that avoids
the failure by disabling healthy behavior is not a fix.

A new regression quiz is proven only when:

1. The known-bad revision fails for the intended reason.
2. The candidate revision passes without a weaker grader.
3. Its control passes on the candidate.
4. Existing blocking quizzes still pass.

