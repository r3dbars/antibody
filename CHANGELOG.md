# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Fail-closed judges: refusal, parse, and network errors return `{ hit: null, error }` and watching errors exit `2`.
- `examples/support-agent/` walkthrough and a real `antibody demo` tape.
- Typecheck (`tsc --noEmit`), committed lockfile, and a `v*` GitHub release workflow.
- Immunization model: executable quizzes, product adapter, and permanent gates (PRs #2–#4).
- `antibody tap` plus OpenAI / Anthropic / Claude Code import adapters (from PR #1).

### Changed
- Publish only on `v*` tags or `workflow_dispatch`, never on every main push.

## [0.4.0] - 2026-08-16

### Added
- Traces can carry `meta` (reviewer context) that never enters the fingerprint.

## [0.3.0] - 2026-08-12

### Added
- Suggestions: agents propose failure-mode matches; humans accept or dismiss in review.

### Changed
- Review UI and CLI verdicts grew labeled evidence, per-reviewer files, and plainer names.

## [0.2.0] - 2026-08-11

### Added
- `antibody demo`: one-command keyless tour of a real scan catch.

## [0.1.1] - 2026-08-10

### Fixed
- Bin path and repository metadata so `npx antibody` resolves correctly.

## [0.1.0] - 2026-08-09

### Added
- First public release: init, import, review, distill, scan, calibrate, and a file-native registry.
