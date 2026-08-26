# Permanent gates — antibody spec v1

Antibody keeps detector trust and quiz trust separate. Failure-mode detectors
use `proposed → calibrating → watching → retired`. Executable quizzes use
`draft → proving → blocking → retired`.

Only a human-reviewed change may set a quiz to `blocking`. The CLI and skills
never promote one automatically.

## Base-versus-candidate proof

Run the same quiz contract against an isolated Git worktree at a known-bad ref
and the current candidate:

```sh
antibody test --compare origin/main
```

Antibody copies only the committed product manifest, quiz files, and suite
files into the comparison worktree. It does not copy raw traces, verdicts, or
other local evidence. The product runner itself must exist and be usable at the
base ref; otherwise the result is “unable to evaluate.”

If a quiz declares `proof.known_bad_outcome`, the base outcome must match it.
A candidate pass cannot validate a quiz that failed to catch its known bug.

## CI gate

```sh
antibody gate --ci
```

The gate runs only `blocking` quizzes and uses stable exit codes:

- `0`: all blocking quizzes passed.
- `1`: a known regression was evaluated and failed.
- `2`: the product or eval harness could not be evaluated.

Both `1` and `2` must block a merge. In GitHub Actions, `--ci` emits error
annotations and writes a Markdown table to `GITHUB_STEP_SUMMARY` when present.
Every test and gate run also writes structured JSON under `.antibody/runs/`,
which is local and Git-ignored by default.
