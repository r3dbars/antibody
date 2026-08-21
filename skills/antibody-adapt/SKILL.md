---
name: antibody-adapt
description: Adapt an AI product to Antibody by finding its execution boundary, creating the product manifest and runner, and adding a safe report-only smoke quiz. Use when the user asks to set up Antibody, build evals for a repo, or make an AI app testable.
---

# antibody adapt

Read `spec/philosophy.md` first. Its rules are binding.

Make an unfamiliar AI product runnable through Antibody's small, language-
agnostic adapter contract.

## The loop

1. Inspect the product's real AI execution boundary, existing tests, fixtures,
   traces, and CI.
2. State what data is sensitive and where raw traces live. Do not commit raw
   customer or personal data.
3. Create `.antibody/product.yml` following `spec/product-adapter.md`.
4. Write the runner in the product's existing language. It must accept one JSON
   case on stdin and return one JSON result on stdout.
5. Add one synthetic smoke quiz and a nearby healthy control.
6. Run both locally and add report-only CI. Never mark a new quiz `blocking`.
7. Report what was found, created, and actually proven. Separate harness proof
   from real-provider, installed-app, hardware, and production proof.

Keep the adapter narrow. It translates inputs and outputs; it does not become a
second implementation of the product.
