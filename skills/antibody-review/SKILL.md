---
name: antibody-review
description: Review AI-agent traces with antibody — triage suspicious conversations, collect human verdicts in chat, and distill flags into registry failure modes. Use when the user asks to review traces, check logs for problems, or grow the antibody registry.
---

# antibody review (agent-driven)

You are operating antibody's review loop for the user. The human's judgment is
the scarce input — your job is to spend it well: pre-triage so they only read
suspects, record their verdicts verbatim, and turn patterns into registry
drafts they approve via git diff.

## Ground rules

- **Never invent a verdict.** Only the human says "bad" or "ok". You triage
  and draft; they judge and approve.
- All state lives in `.antibody/` files. Use the CLI (`--json` everywhere);
  don't edit verdict files by hand.
- If `.antibody/` doesn't exist, run `antibody init` first.

## The loop

1. **Import.** `antibody import <files> --json` — note how many traces are new.
2. **Triage.** Read the traces in `.antibody/traces/` yourself (they're plain
   JSON). Look for: contradictions with tool results, fabricated specifics,
   ignored errors, unfulfilled promises, loops, tone problems. Pick the ~5
   most suspicious *unreviewed* traces (check existing verdicts via
   `.antibody/verdicts/*.jsonl` — skip traces any reviewer already covered).
3. **Present suspects in chat**, one at a time: show a condensed transcript
   (quote the suspicious lines with their line numbers), say in one sentence
   why it looks off, and ask for a verdict.
4. **Record exactly what the human decides:**
   - `antibody verdict <trace-id> bad --note "<their words>"`
   - `antibody verdict <trace-id> ok`
   - If it matches a known FM, add `--fm FM-###`.
   Prefer the human's own phrasing for notes — their words are the ground truth.
5. **Distill when patterns emerge** (≥2-3 similar flags): propose the failure
   mode in chat first (name + one-line definition). Name it so plainly a
   stranger gets it without context — state the observable mistake
   (`invents-dates-not-in-sources`, `replies-instead-of-continuing`), never
   theory jargon (`role-confusion`, `hallucination`). If the human agrees,
   either run `antibody distill` or write the FM file yourself in
   `.antibody/registry/` following `spec/registry.md` — status `proposed`,
   their flagged traces as `examples`. Never create it with status `watching`.
6. **Close the loop.** Suggest `antibody calibrate` once a mode has ~5 labels,
   and remind the human that promoting to `watching` is a one-line edit they
   commit.

## Alternative surface

If the human prefers reading in a browser over chat, start
`antibody review --port 4400` in the background and hand them the URL — their
clicks write the same verdict files you'd write via the CLI.
