# 🚩 antibody

[![npm](https://img.shields.io/npm/v/antibody)](https://www.npmjs.com/package/antibody)
[![test](https://github.com/r3dbars/antibody/actions/workflows/test.yml/badge.svg)](https://github.com/r3dbars/antibody/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**AI evals made simple.** You flag a bad AI conversation once, and antibody
catches that mistake every time it tries to come back.

![How antibody works: traces → you flag it → registry in git → every future run scanned](https://raw.githubusercontent.com/r3dbars/antibody/main/assets/loop.png)

## The short version

Everyone says you need evals for your AI product. Then you go look at what
that actually involves — metrics, golden datasets, judge prompts, labeling
thousands of examples, some dashboard to maintain — and you quietly close
the tab. Meanwhile your agent keeps making the same mistakes, and nobody
notices until a user does.

antibody skips all of that and starts from the one thing you can already
do: read a conversation and tell when something's off.

1. You read a few of your agent's conversations and flag the bad ones, in
   your own words — *"it made up a date"*, *"it ignored the error"*. That's
   the only work you ever do.
2. antibody turns each flag into a named pattern, saved as a small text
   file in your project, with the real conversations that prove it.
3. From then on, every new conversation gets checked against everything
   you've ever flagged. If an old mistake sneaks back in, the check fails
   loudly — before your users see it.

You never invent a metric or write a test case. You just point at things
that are wrong, and the pointing accumulates into something that guards
your project.

## Try it in 30 seconds

One command. Nothing to install, no API key, and it runs in a throwaway
folder so there's nothing to clean up:

```sh
npx antibody demo
```

You'll see it catch a real mistake in a sample conversation and refuse to
pass the build:

![npx antibody demo — antibody imports sample conversations, catches an over-apology failure with the exact quote and line number, and exits 1](https://raw.githubusercontent.com/r3dbars/antibody/main/assets/demo.gif)

## Use it on your own agent

Setup is one command:

```sh
cd your-agent-project && npx antibody init
```

Then, whenever you have fresh conversations to look at:

```sh
npx antibody import logs/  # bring in your agent's conversations
npx antibody review        # flip through them, flag what's bad
npx antibody distill       # your flags become named patterns
npx antibody scan          # check everything — fails CI if a mistake returns
```

If you use Claude Code or another coding agent, you can skip the commands —
this repo ships [`skills/`](skills/) that teach your agent the whole loop.
Just say: *"install antibody in this project and review my agent's traces."*

Put that `scan` in CI, point it at your logs on a schedule, and the
mistakes you've flagged stay caught.

## The checkers have to earn your trust

A fair question at this point: what if the automated checkers are wrong?

They will be, sometimes. So antibody doesn't let a new checker block
anyone's work. It starts in report-only mode, and while it's running, its
catches show up in your review queue as suggestions — one keypress to say
"yes, that's the mistake" or "no, it's not." antibody keeps score of how
often the checker agrees with you (`npx antibody calibrate` shows it). When
the score convinces you, you promote the checker by editing one line in its
file. Only then can it fail a build.

In other words: you stay the judge. The checkers are just deputies you've
personally vetted.

## Using it with a team

Everything antibody knows is small text files committed to git — the
patterns, everyone's verdicts, the scan history. Syncing with a teammate is
just `git pull`. There's no server and no accounts, and your conversations
never leave your machines.

## Want to go deeper?

- [`spec/`](spec/) — the three tiny file formats everything is built on
- [`skills/`](skills/) — teach Claude Code (or any coding agent) to run the
  whole loop for you
- The thinking behind it: [Hamel Husain & Shreya Shankar's evals
  FAQ](https://hamel.dev/blog/posts/evals-faq/) — antibody is their
  error-analysis loop, packaged up. Directly inspired by Shreya's
  [error-discovery-skill](https://github.com/shreyashankar/error-discovery-skill);
  antibody imports its annotations (`npx antibody import --annotations`).

MIT licensed.
