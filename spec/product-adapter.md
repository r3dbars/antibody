# Product adapter — antibody spec v1

A product adapter is the small, trusted boundary between Antibody and an AI
product. It lets Antibody run products written in any language without loading
their code into Antibody.

## Manifest

Commit `.antibody/product.yml`:

```yaml
schema: antibody.product.v1
name: example-agent
kind: support-agent

runner:
  command: ./script/antibody-run-case
  timeout_ms: 5000

privacy:
  raw_traces: local
  committed_cases: synthetic-only

suites:
  fast: .antibody/suites/fast.yml
  release: .antibody/suites/release.yml
```

`runner.command` is executed from the repository root. The command receives
one JSON case on standard input and must write exactly one JSON result to
standard output. Logs belong on standard error.

## Runner input

```json
{
  "case_id": "FM-0042.001",
  "input": {
    "message": "Where is my order?"
  }
}
```

## Runner result

```json
{
  "status": "ok",
  "result": {
    "answer": "I cannot give an estimate until the carrier responds."
  },
  "metrics": {
    "latency_ms": 184
  },
  "observations": {
    "tool_called": "delivery_lookup"
  }
}
```

`status` is `ok` when the product ran and returned an evaluable result. A
runner can return `error` with an `error` string, but infrastructure failures
must never be reported as passing quizzes.

The adapter may compute product-specific observations such as text integrity,
focus state, tool calls, or citation count. Quiz graders only inspect the
returned JSON; they do not execute arbitrary grader code.

## Trust and privacy

The adapter is application code and therefore part of the product's normal
trust boundary. Raw traces stay local by default. Committed quiz inputs must be
synthetic, redacted, or explicitly approved for publication.

