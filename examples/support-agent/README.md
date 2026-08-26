# Support-agent walkthrough (5 minutes)

A tiny Antibody workspace you can scan **without an API key**. The watching
checker is a regex; the date-invention judge stays calibrating and is skipped
until you set `ANTHROPIC_API_KEY`.

## Traces

| file | what happened |
|---|---|
| `traces/refund-clean.json` | Refund started; no invented arrival date |
| `traces/refund-invents-date.json` | Same tool result, but the assistant invents **Friday** |

## Failure modes

| id | name | type | status |
|---|---|---|---|
| FM-001 | over-apology | rule | watching |
| FM-003 | invents-dates-not-in-sources | judge | calibrating |

Neither sample conversation over-apologizes, so the watching rule stays clean.
The Friday promise is the judge's job — skipped keyless, reported (never
gating) once you add a key.

## Walkthrough

From the Antibody repo (or after `npm pack` / `npx antibody`):

```sh
dir=$(mktemp -d)
cd "$dir"
npx antibody init
npx antibody import /path/to/antibody/examples/support-agent/traces
cp /path/to/antibody/examples/support-agent/registry/*.md .antibody/registry/
npx antibody scan
```

Using a local checkout instead of npx:

```sh
dir=$(mktemp -d)
cd "$dir"
node /path/to/antibody/src/cli.js init
node /path/to/antibody/src/cli.js import /path/to/antibody/examples/support-agent/traces
cp /path/to/antibody/examples/support-agent/registry/*.md .antibody/registry/
node /path/to/antibody/src/cli.js scan
```

Expected keyless result (see `expected-scan.txt`):

- **exit 0** — no watching hits
- **FM-001** 0 hits
- **FM-003** skipped (judge needs `ANTHROPIC_API_KEY`)

That skip is not an error. Watching judge failures (refusal, parse, network)
exit **2**; calibrating judge failures report and still exit 0.

Want the one-command tour that *does* catch a watching rule? From the repo
root:

```sh
node src/cli.js demo
# or: scripts/record-demo.sh
```
