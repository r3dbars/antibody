// Suggestion lifecycle: calibrating-checker hits become pending suggestions,
// humans resolve them, and a (trace, fm) pair is never proposed twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initWorkspace, saveTrace, appendSuggestion, pendingSuggestions, appendVerdict } from '../src/store.js';
import { makeTrace } from '../src/normalize.js';
import { scan } from '../src/scan.js';

const CALIBRATING_FM = `---
id: FM-001
name: over-apology
status: calibrating
discovered: 2026-08-09
discovered_by: test
examples: []
checker:
  type: rule
  pattern: (sorry|apologi[sz]e).{0,300}?(sorry|apologi[sz]e)
  flags: is
  role: assistant
calibration: { agreement: null, tpr: null, tnr: null, n_labels: 0 }
---

## Description

Apologizes twice in one message.
`;

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-suggest-'));
  initWorkspace(dir);
  fs.writeFileSync(path.join(dir, '.antibody', 'registry', 'FM-001-over-apology.md'), CALIBRATING_FM);
  return dir;
}

test('scan queues calibrating hits as suggestions, once, until resolved', async () => {
  const dir = workspace();
  const hitTrace = makeTrace([
    { role: 'user', content: 'help' },
    { role: 'assistant', content: "I'm so sorry! I apologize for the trouble." },
  ], 'test');
  const cleanTrace = makeTrace([
    { role: 'user', content: 'help' },
    { role: 'assistant', content: 'Done — deployed.' },
  ], 'test');
  saveTrace(hitTrace, dir);
  saveTrace(cleanTrace, dir);

  // first scan: the hit becomes one pending suggestion, and never gates
  const first = await scan({ cwd: dir });
  assert.equal(first.exitCode, 0);
  assert.equal(first.suggested, 1);
  const pending = pendingSuggestions(dir);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].trace, hitTrace.id);
  assert.equal(pending[0].fm, 'FM-001');
  assert.equal(pending[0].by, 'scan/FM-001');

  // second scan: same hit, no re-proposal
  const second = await scan({ cwd: dir });
  assert.equal(second.suggested, 0);
  assert.equal(pendingSuggestions(dir).length, 1);

  // human dismisses: pending empties, and scans never re-propose
  appendSuggestion({ trace: hitTrace.id, fm: 'FM-001', resolved: 'dismissed', by: 'tester' }, dir);
  assert.equal(pendingSuggestions(dir).length, 0);
  const third = await scan({ cwd: dir });
  assert.equal(third.suggested, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('a trace already FM-labeled by a human is never suggested', async () => {
  const dir = workspace();
  const hitTrace = makeTrace([
    { role: 'user', content: 'help' },
    { role: 'assistant', content: 'sorry, sorry again.' },
  ], 'test');
  saveTrace(hitTrace, dir);
  appendVerdict({ trace: hitTrace.id, verdict: 'bad', fm: 'FM-001', by: 'tester' }, dir);

  const summary = await scan({ cwd: dir });
  assert.equal(summary.suggested, 0);
  assert.equal(pendingSuggestions(dir).length, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});
