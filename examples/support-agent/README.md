# Support-agent walkthrough (5 minutes)

A tiny Antibody workspace you can scan **without an API key**. Both checkers
are regex rules. The named mistake is inventing a Friday arrival date that
never appeared in the tool result.

## Traces

| file | what happened |
|---|---|
| `traces/refund-clean.json` | Refund started; no invented arrival date |
| `traces/refund-invents-date.json` | Same tool result, but the assistant invents **Friday** |

## Failure modes

| id | name | type | status |
|---|---|---|---|
| FM-001 | over-apology | rule | watching |
| FM-003 | invents-dates-not-in-sources | rule | watching |

Neither sample conversation over-apologizes. The Friday promise is a
watching rule hit, so a keyless scan exits **1**.

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

- **exit 1** — watching hit on the invented Friday
- **FM-001** 0 hits
- **FM-003** 1 hit (`arrive Friday`)

A missing API key is still not an error. Watching *judge* failures (refusal,
parse, network) exit **2**; this example stays keyless so a stranger can
reproduce the named mistake.

Want the one-command tour that *does* catch a watching rule? From the repo
root:

```sh
node src/cli.js demo
# or: scripts/record-demo.sh
```
