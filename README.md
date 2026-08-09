# 🚩 antibody

[![npm](https://img.shields.io/npm/v/antibody)](https://www.npmjs.com/package/antibody)
[![test](https://github.com/r3dbars/antibody/actions/workflows/test.yml/badge.svg)](https://github.com/r3dbars/antibody/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**An immune system for your AI agent. Flag a failure once — catch it forever.**

![How antibody works: traces → you flag it → registry in git → every future run scanned](https://raw.githubusercontent.com/r3dbars/antibody/main/assets/loop.png)

## The idea

Your AI agent makes mistakes. Today you find them by luck, fix them, and hope
they stay fixed. They don't.

antibody gives your agent a memory for its mistakes:

1. **Read a few of your agent's conversations** and flag the bad ones, in
   plain English — *"it made up a date"*, *"it ignored the error"*. That's
   the only work you ever do.
2. **antibody turns each flag into a named failure pattern** — a permanent
   record in your project, with the real conversations that prove it.
3. **Every future conversation gets checked against every pattern you've
   ever flagged.** When an old mistake sneaks back in, the check fails —
   loudly, before your users find it.

No metrics to invent. No test cases to imagine. No dashboard to babysit.
If you can read a conversation and say *"that's wrong,"* you can do this.

## Try it in 60 seconds (no API key needed)

```sh
git clone https://github.com/r3dbars/antibody && cd antibody && npm install
mkdir playground && cd playground
node ../src/cli.js init
node ../src/cli.js import ../examples/traces
cp ../examples/registry/*.md .antibody/registry/
node ../src/cli.js scan
```

You'll watch antibody catch a real mistake in a sample conversation and
refuse to pass the build:

```
✗ FM-001 over-apology — 1 hit
    tr-55fce8dd6320 line 4: "sorry about that! I sincerely apologize"
RESULT: known failure modes recurred — exit 1
```

## Use it on your own agent

No install — `npx` fetches it:

```sh
cd your-agent-project
npx antibody init          # set up (once) — creates a .antibody/ folder
npx antibody import logs/  # bring in your agent's conversations
npx antibody review        # flip through them, flag what's bad
npx antibody distill       # your flags become named failure patterns
npx antibody scan          # check everything — fails CI if a mistake returns
```

Add that last line to your CI, point it at production logs on a nightly
schedule, and every mistake anyone on your team has ever flagged is watched
for, forever.

## How it stays honest

Automated checkers can be wrong, so antibody makes each one **earn trust
before it can block anyone's work**. A new pattern starts as a draft, then
runs in report-only mode while antibody measures how often its verdicts
match yours (`npx antibody calibrate` shows the score). Only when you
promote it — by editing one line in its file and committing — can it fail a
build. Your judgment stays the ground truth; the robots just scale it.

## Working with a team

Everything antibody knows lives in small text files committed to git — the
pattern registry, everyone's verdicts, the scan history. Sharing state with
your team is `git pull`. No server, no accounts, and your conversations
never leave your machines.

## Want to go deeper?

- [`spec/`](spec/) — the three tiny file formats everything is built on
- [`skills/`](skills/) — teach Claude Code (or any coding agent) to run the
  whole loop for you
- The methodology behind it: [Hamel Husain & Shreya Shankar's evals
  FAQ](https://hamel.dev/blog/posts/evals-faq/) — antibody is their
  error-analysis loop, packaged. Directly inspired by Shreya's
  [error-discovery-skill](https://github.com/shreyashankar/error-discovery-skill);
  antibody imports its annotations (`npx antibody import --annotations`).

MIT licensed. Free forever.
