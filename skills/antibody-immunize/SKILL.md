---
name: antibody-immunize
description: Turn a confirmed AI product failure into an executable Antibody regression quiz, prove the bad revision fails, fix the product, and prove the candidate passes. Use when the user asks to turn a failure into an eval, prevent a bug from returning, or fix an issue eval-first.
---

# antibody immunize

Read `spec/philosophy.md` first. Its rules are binding.

## The loop

1. Confirm the human-defined, observable failure. A suspicious trace alone is
   not permission to invent a verdict.
2. Create the quiz before changing product behavior.
3. Run it against the known-bad revision and confirm it fails for the intended
   reason.
4. Add a nearby healthy control. Add variants when the failure is a broader
   family rather than a single edge case.
5. Identify the narrowest responsible subsystem and make the smallest fix.
6. Run the quiz and control against the candidate.
7. Run all existing blocking gates.
8. Report known-bad versus candidate evidence, infrastructure failures, and the
   exact proof boundary.
9. Leave promotion to `blocking` as a human-reviewed diff. Never promote it
   automatically.

## Hard rules

- Do not weaken the grader to make the candidate pass.
- Do not change expected behavior after seeing candidate output.
- Do not claim the issue fixed unless known-bad fails and candidate passes.
- Do not put raw customer or personal data in Git.
- Fix the failure family, not only the original sentence.

