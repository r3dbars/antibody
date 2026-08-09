// Keyless end-to-end: init → import examples → verdict → scan (rule FM gates,
// judge FM skipped without a key) → calibrate. Exercises the real CLI binary.
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
    return execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ANTIBODY_REVIEWER: 'tester' },
    });
  } catch (err) {
    if (err.status === expectExit) return err.stdout;
    throw err;
  }
}

test('full keyless loop: init, import, verdict, scan, calibrate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-e2e-'));

  assert.match(run(dir, ['init']), /initialized \.antibody\//);

  const imported = JSON.parse(run(dir, ['import', path.join(repo, 'examples', 'traces'), '--json']));
  assert.equal(imported.added, 3);
  assert.equal(imported.ids.length, 3);

  // importing again is idempotent — fingerprints already known
  const again = JSON.parse(run(dir, ['import', path.join(repo, 'examples', 'traces'), '--json']));
  assert.equal(again.added, 0);
  assert.equal(again.seen, 3);

  // install the example registry (rule FM is "watching", judge FM "calibrating")
  for (const f of fs.readdirSync(path.join(repo, 'examples', 'registry'))) {
    fs.copyFileSync(path.join(repo, 'examples', 'registry', f), path.join(dir, '.antibody', 'registry', f));
  }

  // record a human verdict for calibration ground truth
  const apologyTrace = imported.ids.find((id) => {
    const t = JSON.parse(fs.readFileSync(path.join(dir, '.antibody', 'traces', `${id}.json`), 'utf8'));
    return /apologize/i.test(JSON.stringify(t.messages));
  });
  const v = JSON.parse(run(dir, ['verdict', apologyTrace, 'bad', '--note', 'apology loop', '--fm', 'FM-001', '--json']));
  assert.equal(v.by, 'tester');
  assert.ok(fs.existsSync(path.join(dir, '.antibody', 'verdicts', 'tester.jsonl')));

  // scan: rule FM hits the apology trace → exit 1; judge FM skipped keyless
  const summary = JSON.parse(run(dir, ['scan', '--json'], { expectExit: 1 }));
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.traces, 3);
  const fm1 = summary.results.find((r) => r.id === 'FM-001');
  assert.equal(fm1.hits.length, 1);
  assert.equal(fm1.hits[0].trace, apologyTrace);
  assert.deepEqual(summary.skipped, ['FM-002']);
  assert.ok(fs.readdirSync(path.join(dir, '.antibody', 'scans')).length === 1);

  // second scan shows the trend field
  const second = JSON.parse(run(dir, ['scan', '--json'], { expectExit: 1 }));
  assert.equal(second.results.find((r) => r.id === 'FM-001').previousHits, 1);

  // calibrate the rule FM against the human label (keyless — rules are free)
  const cal = JSON.parse(run(dir, ['calibrate', '--fm', 'FM-001', '--json']));
  const row = cal.find((r) => r.id === 'FM-001');
  assert.equal(row.calibration.n_labels, 1);
  assert.equal(row.calibration.agreement, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});
