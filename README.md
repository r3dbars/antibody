# 🚩 antibody

[![npm](https://img.shields.io/npm/v/antibody)](https://www.npmjs.com/package/antibody)
[![test](https://github.com/r3dbars/antibody/actions/workflows/test.yml/badge.svg)](https://github.com/r3dbars/antibody/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**AI evals made simple.** An immune system for your AI agent: flag a failure
once — catch it forever.

![How antibody works: traces → you flag it → registry in git → every future run scanned](https://raw.githubusercontent.com/r3dbars/antibody/main/assets/loop.png)

## Evals are hard. Starting them shouldn't be.

Everyone says "you need evals." Then you look at what that means: invent
metrics, build golden datasets, write judge prompts, label thousands of
examples, stand up a dashboard. It's a lot — so most people do nothing, and
their agent's mistakes ship silently, again and again.

antibody is the simple way in. You start with the one skill you already
have — reading a conversation and saying *"that's wrong"* — and a real eval
suite grows underneath you:

1. **Read a few of your agent's conversations** and flag the bad ones, in
   plain English — *"it made up a date"*, *"it ignored the error"*. That's
   the only work you ever do.
2. **antibody turns each flag into a named failure pattern** — a permanent
   record in your project, with the real conversations that prove it.
3. **Every future conversation gets checked against every pattern you've
   ever flagged.** When an old mistake sneaks back in, the check fails —
   loudly, before your users find it.

No metrics to invent. No test cases to imagine. No dashboard to babysit.
No PhD in evaluation. If you can read a conversation and say *"that's
wrong,"* you are qualified to run evals with antibody — that's the entire
point of it.

## Try it in 30 seconds

One command. No install, no API key, no cleanup — it plays out in a
throwaway folder:

```sh
npx antibody demo
```

You'll watch antibody catch a real mistake in a sample conversation and
refuse to pass the build:

![npx antibody demo — antibody imports sample conversations, catches an over-apology failure with the exact quote and line number, and exits 1](https://raw.githubusercontent.com/r3dbars/antibody/main/assets/demo.gif)

## Use it on your own agent

Setup is one command (`npx` fetches antibody, nothing to install):

```sh
cd your-agent-project && npx antibody init
```

Then the loop, whenever you have fresh conversations:

```sh
npx antibody import logs/  # bring in your agent's conversations
npx antibody review        # flip through them, flag what's bad
npx antibody distill       # your flags become named failure patterns
npx antibody scan          # check everything — fails CI if a mistake returns
```

Using Claude Code or another coding agent? Skip the commands entirely — this
repo ships [`skills/`](skills/) that teach your agent the whole loop. Just
say: *"install antibody in this project and review my agent's traces."*

Add that last line to your CI, point it at production logs on a nightly
schedule, and every mistake anyone on your team has ever flagged is watched
for, forever.

## How it stays honest

Automated checkers can be wrong, so antibody makes each one **earn trust
before it can block anyone's work**. A new pattern starts as a draft, then
runs in report-only mode while antibody measures how often its verdicts
match yours (`npx antibody calibrate` shows the score). While it's proving
itself, its hits appear in `npx antibody review` as agent suggestions —
one keypress to agree or dismiss, and each ruling becomes a calibration
label. Only when you
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
