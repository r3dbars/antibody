import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'src', 'cli.js');

function run(cwd, args, { expectExit = 0 } = {}) {
  try {
    return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  } catch (err) {
    if (err.status === expectExit) return err.stdout;
    throw err;
  }
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-quiz-'));
  run(dir, ['init']);
  fs.writeFileSync(path.join(dir, '.antibody', 'product.yml'), `schema: antibody.product.v1\nname: autocomplete-fixture\nkind: autocomplete\nrunner:\n  command: node adapter.mjs\n  timeout_ms: 1000\nsuites:\n  fast: .antibody/suites/fast.yml\n`);
  fs.writeFileSync(path.join(dir, 'adapter.mjs'), `let raw = '';\nfor await (const chunk of process.stdin) raw += chunk;\nconst testCase = JSON.parse(raw);\nconst suggestion = testCase.input.bad ? 'the deck tomorrow.' : 'the deck after lunch.';\nprocess.stdout.write(JSON.stringify({ status: 'ok', result: { action: 'show', suggestion }, metrics: { latency_ms: 10 }, observations: { text_integrity: true } }));\n`);
  fs.writeFileSync(path.join(dir, '.antibody', 'quizzes', 'FM-001.001.yml'), `schema: antibody.quiz.v1\nid: FM-001.001\nfailure_mode: FM-001\nname: preserve-deadline\nstatus: proving\nsuite: fast\ninput:\n  bad: false\nexpect:\n  - path: result.suggestion\n    includes: after lunch\n  - path: result.suggestion\n    excludes: [tomorrow]\n`);
  fs.writeFileSync(path.join(dir, '.antibody', 'suites', 'fast.yml'), `schema: antibody.suite.v1\nquizzes: [FM-001.001]\n`);
  return dir;
}

test('quiz validate, list, inspect, and test use the real adapter contract', () => {
  const dir = setup();
  assert.match(run(dir, ['quiz', 'validate']), /1 quiz valid/);
  assert.match(run(dir, ['quiz', 'list']), /FM-001.001\tproving\tpreserve-deadline/);
  assert.equal(JSON.parse(run(dir, ['quiz', 'inspect', 'FM-001.001', '--json'])).id, 'FM-001.001');

  const summary = JSON.parse(run(dir, ['test', '--suite', 'fast', '--json']));
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.passed, 1);
  assert.equal(summary.results[0].assertions.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('product assertion failures exit 1 and adapter failures exit 2', () => {
  const dir = setup();
  const quizFile = path.join(dir, '.antibody', 'quizzes', 'FM-001.001.yml');
  fs.writeFileSync(quizFile, fs.readFileSync(quizFile, 'utf8').replace('bad: false', 'bad: true'));
  const failed = JSON.parse(run(dir, ['test', '--json'], { expectExit: 1 }));
  assert.equal(failed.failed, 1);

  fs.writeFileSync(path.join(dir, '.antibody', 'product.yml'), `schema: antibody.product.v1\nname: broken\nrunner:\n  command: node missing.mjs\n  timeout_ms: 1000\n`);
  const broken = JSON.parse(run(dir, ['test', '--json'], { expectExit: 2 }));
  assert.equal(broken.errors, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
