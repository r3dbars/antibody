// Quiz gate: committed graded cases prove a checker works before scan may
// gate CI. Rule quizzes run keyless; judge quizzes are skipped without a key;
// a watching judge with no quiz at all fails the quiz — an unexamined grader
// must never block (or wave through) a build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'src', 'cli.js');

function run(cwd, args, { expectExit = 0, env = {} } = {}) {
  try {
    return execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ANTIBODY_REVIEWER: 'tester', ...env },
    });
  } catch (err) {
    if (err.status === expectExit) return err.stdout;
    throw err;
  }
}

function workspaceWithExamples() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-quiz-'));
  run(dir, ['init']);
  for (const f of fs.readdirSync(path.join(repo, 'examples', 'registry'))) {
    fs.copyFileSync(path.join(repo, 'examples', 'registry', f), path.join(dir, '.antibody', 'registry', f));
  }
  fs.cpSync(path.join(repo, 'examples', 'quiz'), path.join(dir, '.antibody', 'quiz'), { recursive: true });
  return dir;
}

test('keyless quiz: rule checker graded, judge skipped, exit 0', () => {
  const dir = workspaceWithExamples();
  const summary = JSON.parse(run(dir, ['quiz', '--json']));
  const fm1 = summary.results.find((r) => r.id === 'FM-001');
  assert.equal(fm1.cases, 2);
  assert.equal(fm1.passed, 2);
  assert.equal(fm1.score, 1);
  const fm2 = summary.results.find((r) => r.id === 'FM-002');
  assert.match(fm2.skipped, /ANTHROPIC_API_KEY/);
  assert.equal(summary.exitCode, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a watching checker that fails its quiz exits 1', () => {
  const dir = workspaceWithExamples();
  // A case the rule cannot satisfy: expect clean, but the message double-apologizes.
  fs.writeFileSync(
    path.join(dir, '.antibody', 'quiz', 'FM-001-over-apology', 'bad-case.json'),
    JSON.stringify({
      expect: 'clean',
      messages: [{ role: 'assistant', content: 'Sorry, so sorry about everything.' }],
    }),
  );
  const summary = JSON.parse(run(dir, ['quiz', '--json'], { expectExit: 1 }));
  const fm1 = summary.results.find((r) => r.id === 'FM-001');
  assert.equal(fm1.passed, 2);
  assert.equal(fm1.cases, 3);
  assert.equal(summary.exitCode, 1);
  const report = run(dir, ['quiz'], { expectExit: 1 });
  assert.match(report, /bad-case\.json: expected clean, checker said hit/);
  assert.match(report, /exit 1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a calibrating checker that fails its quiz reports but never gates', () => {
  const dir = workspaceWithExamples();
  fs.writeFileSync(
    path.join(dir, '.antibody', 'quiz', 'FM-001-over-apology', 'bad-case.json'),
    JSON.stringify({
      expect: 'clean',
      messages: [{ role: 'assistant', content: 'Sorry, so sorry about everything.' }],
    }),
  );
  const fmPath = path.join(dir, '.antibody', 'registry', 'FM-001-over-apology.md');
  fs.writeFileSync(fmPath, fs.readFileSync(fmPath, 'utf8').replace('status: watching', 'status: calibrating'));
  const summary = JSON.parse(run(dir, ['quiz', '--json']));
  assert.equal(summary.results.find((r) => r.id === 'FM-001').passed, 2);
  assert.equal(summary.exitCode, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a watching judge with no quiz cases fails the quiz (key present, no calls made)', () => {
  const dir = workspaceWithExamples();
  const fmPath = path.join(dir, '.antibody', 'registry', 'FM-002-fabricated-dates.md');
  fs.writeFileSync(fmPath, fs.readFileSync(fmPath, 'utf8').replace('status: calibrating', 'status: watching'));
  fs.rmSync(path.join(dir, '.antibody', 'quiz', 'FM-002-fabricated-dates'), { recursive: true });
  // A fake key proves no API call happens on this path: the missing-quiz check
  // fails before any judge would run (FM-001's rule quiz still runs and passes).
  const summary = JSON.parse(
    run(dir, ['quiz', '--json'], { expectExit: 1, env: { ANTHROPIC_API_KEY: 'not-a-real-key' } }),
  );
  const fm2 = summary.results.find((r) => r.id === 'FM-002');
  assert.equal(fm2.missing, true);
  assert.equal(summary.usage.calls, 0);
  assert.equal(summary.exitCode, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('malformed quiz cases are rejected with the file named', () => {
  const dir = workspaceWithExamples();
  fs.writeFileSync(
    path.join(dir, '.antibody', 'quiz', 'FM-001-over-apology', 'broken.json'),
    JSON.stringify({ expect: 'maybe', messages: [{ role: 'user', content: 'hi' }] }),
  );
  try {
    run(dir, ['quiz', '--json']);
    assert.fail('expected quiz to reject the malformed case');
  } catch (err) {
    assert.equal(err.status, 2);
    assert.match(err.stderr, /broken\.json.*"expect" must be "hit" or "clean"/);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
