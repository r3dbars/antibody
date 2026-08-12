# Antibody visual story

Antibody is a physical failure-signature scanner for your AI system.

## 0. The diagnostic workstation

![Antibody diagnostic workstation](./00-hero.png)

## 1. A new failure appears

Your AI produces a bad answer. Antibody does not pretend to know that it is bad yet.

![An unknown AI failure arrives](./01-unknown-failure.png)

## 2. You flag it

You are the judge. Mark the output and describe what went wrong in your own words.

![A developer flags the bad output](./02-flag-it.png)

## 3. Antibody remembers it

The flag becomes a named, reviewable failure pattern in the registry.

![Antibody saves a failure signature](./03-signature-saved.png)

## 4. Every future run is scanned

New outputs pass through the same known-failure scanner.

![Antibody scans future outputs](./04-scan-future-outputs.png)

## 5. The mistake tries to return

Antibody recognizes the signature and catches it before you ship.

![Antibody catches a recurring failure](./05-match-found.png)

## 6. Checkers earn trust

New checkers start report-only, calibrate against your decisions, and gate CI only after you promote them.

![The Antibody trust ladder](./06-trust-ladder.png)

## 7. The boundary stays clear

Conversation traces remain local. Fingerprints, verdicts, and failure patterns can live in git.

![The Antibody file boundary](./07-file-boundary-terminal.png)
