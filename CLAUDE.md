# antibody — development guide

A small CLI (`src/cli.js`) plus plain files under `.antibody/`. No build step:
the package ships the `src/` ES modules as-is (Node >= 20, no bundler, no
transpile).

## Commands

```sh
npm install            # setup (also needed before tests — they exec the real CLI)
npm test               # node --test test/*.test.js — keyless, no network
npm run lint           # eslint (flat config in eslint.config.js)
node src/cli.js demo   # end-to-end smoke test in a throwaway folder, no API key
```

Run lint and the tests before every commit; both must be clean. CI (`.github/
workflows/test.yml`) runs the same two, plus a `judge-quiz` job that grades
the example LLM judge with `antibody quiz` when an `ANTHROPIC_API_KEY` secret
is present.

## The two CI lanes

- **Deterministic:** lint + tests. Everything here runs keyless and offline;
  keep it that way — tests that need a key must skip cleanly without one.
- **Non-deterministic:** LLM judge checkers. A judge may only gate CI while it
  passes its committed quiz (`.antibody/quiz/FM-*/`, see `spec/quiz.md`).
  `antibody quiz && antibody scan` is the canonical CI gate.

## Layout

- `src/` — one file per concern: `cli.js` (dispatch), `store.js` (all file
  I/O), `normalize.js` (fingerprinting — spec'd in `spec/trace.md`; changing
  it changes every trace id, so don't, casually — note the fingerprint
  separators are `\u0000`/`\u0001` escapes; never let literal control
  characters into source), `check.js` (rule + judge checkers), `scan.js`,
  `quiz.js`, `calibrate.js`, `distill.js`, `serve.js` (review UI server),
  `tap.js` (recording proxy).
- `spec/` — file-format contracts. Code changes that alter a format must
  update the matching spec in the same commit.
- `examples/` — the demo's traces, registry, and quiz cases; the e2e tests
  depend on their exact contents.
- `skills/` — instructions for coding agents operating antibody in *user*
  projects (not for developing antibody itself).

## Conventions

- Dependencies are a last resort; the runtime deps are `@anthropic-ai/sdk`
  and `yaml`, and it should stay that close to zero.
- Comments explain design decisions and constraints, not mechanics — match
  the existing density and tone.
- Humans hold all judgment: nothing may auto-promote a failure mode's status,
  invent a verdict, or weaken a quiz case to get to green.
