# 🚩 antibody

**An immune system for your AI agent. Flag a failure once — catch it forever.**

You read a handful of your agent's conversations and flag what looks wrong —
plain English, no metrics, no scorer code. antibody turns each flag into a
permanent defense: a named failure mode checked against every future run, the
way your immune system remembers every infection it has ever beaten.

- **No runner.** Traces in, verdicts out. Works with whatever produces your
  transcripts (promptfoo, Mastra, Inspect, plain logs) instead of competing
  with it.
- **No homework.** The only human input is "read this conversation, say
  what's wrong." Everything else — taxonomy, judges, CI gates — is derived.
- **Local-first.** Plain files, your own API key, MIT. Private traces never
  leave your machine. There is no database and no server: the registry and
  verdicts are small text files committed to git, so **team sync is `git pull`**.
- **Agent-first.** Every command emits `--json`; shipped [skills](skills/)
  teach Claude Code (or any coding agent) to run the whole loop — and the scan
  report is structured food for an agent that fixes what broke.

## The loop

```
your agent's logs                                (any JSON/JSONL transcripts)
   │  antibody import
   ▼
review — flip through, flag what's bad           (browser UI, chat, or CLI)
   │  antibody distill
   ▼
registry — named failure modes in git            (.antibody/registry/FM-*.md)
   │  antibody scan            ← every future run, CI and nightly
   ▼
report + exit code — "FM-001 hit 4× (last week: 0)"
```

Every failure mode is born from a real incident, carries its example traces,
and shows how often its checker agrees with human judgment. When someone asks
"why do we test for this?", the answer is a file in git, not a shrug.

## Quickstart (60 seconds, no API key)

```sh
git clone https://github.com/r3dbars/antibody && cd antibody && npm install
mkdir playground && cd playground
node ../src/cli.js init
node ../src/cli.js import ../examples/traces
cp ../examples/registry/*.md .antibody/registry/
node ../src/cli.js scan          # ✗ FM-001 over-apology — 1 hit → exit 1
```

With `ANTHROPIC_API_KEY` set, judge-type failure modes run too, and
`antibody review` opens the flip-through review queue on localhost.

Once published to npm it's `npx antibody <command>` — no clone needed.

## Commands

| command | what it does |
|---|---|
| `antibody init` | create `.antibody/` (config, registry, verdicts, scans) |
| `antibody import <files>` | normalize + fingerprint traces (idempotent; same conversation → same id on every machine) |
| `antibody review` | localhost review queue — keyboard-driven, team-aware ("you 9 · sarah 5 · 18 unclaimed") |
| `antibody verdict <id> bad\|ok` | record a verdict from a terminal or an agent |
| `antibody distill` | draft failure modes from your flags (status `proposed` — you approve via git diff) |
| `antibody scan [files]` | check every trace against every active mode; exit 1 when a **watching** mode hits |
| `antibody calibrate` | judge-vs-human agreement, TPR/TNR, and promotion suggestions |

## The trust ladder

Failure modes climb `proposed → calibrating → watching`, and **only `watching`
modes can fail CI**. A checker earns `watching` by agreeing with your labels
(`antibody calibrate` shows agreement, and TPR/TNR separately — a judge that
always says "clean" scores 95% agreement and 0% TPR, and antibody will tell
you so). Promotion is you editing one line in a git-tracked file: reviewable,
revertable, never tool magic.

## CI

```yaml
- run: npm run agent:testset          # produce traces however you already do
- run: npx antibody scan ./traces/    # fails the build if a known mistake returns
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Point the same command at yesterday's production traces on a nightly cron and
you have both deployment points: *"did this PR re-break anything we've ever
flagged?"* and *"is anything we've ever flagged happening to real users right
now?"*

## File formats are the product

The tool is just the nicest way to work with three tiny formats, specified in
[`spec/`](spec/):

- [`spec/trace.md`](spec/trace.md) — normalized traces + the content
  fingerprint that gives every machine the same trace ids
- [`spec/registry.md`](spec/registry.md) — failure modes as Markdown files
  with YAML frontmatter
- [`spec/verdicts.md`](spec/verdicts.md) — append-only JSONL, one file per
  reviewer, conflict-free by construction

Anything that reads and writes these files is part of the ecosystem.

## Credits & lineage

antibody packages the error-analysis methodology taught by
[Hamel Husain and Shreya Shankar](https://hamel.dev/blog/posts/evals-faq/)
(look at your data → open coding → axial coding → narrow judges → measure
judge-human agreement), and is directly inspired by Shreya's
[error-discovery-skill](https://github.com/shreyashankar/error-discovery-skill),
which pioneered agent-driven trace review. Her skill is a brilliant discovery
*session*; antibody is where discoveries become permanent immunity —
`antibody import --annotations annotations.json` accepts its output.

## License

MIT
