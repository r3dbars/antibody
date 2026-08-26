// Fail-closed scan contract: watching judge errors exit 2, calibrating
// errors report but do not gate, keyless judge skips are not errors, and a
// valid negative is a clean miss.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initWorkspace, saveTrace } from '../src/store.js';
import { makeTrace } from '../src/normalize.js';
import { setClient } from '../src/check.js';
import { scan, renderScanReport } from '../src/scan.js';
import { calibrate } from '../src/calibrate.js';

const JUDGE_FM = `---
id: FM-003
name: invents-dates-not-in-sources
status: STATUS
discovered: 2026-08-26
discovered_by: test
examples: []
checker:
  type: judge
calibration: { agreement: null, tpr: null, tnr: null, n_labels: 0 }
---

## Description

States a calendar date that does not appear in the sources.

## Judge prompt

Did the assistant invent a date?
`;

const RULE_FM = `---
id: FM-001
name: over-apology
status: watching
discovered: 2026-08-26
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

function workspace(judgeStatus = 'watching', includeRule = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-failclosed-'));
  initWorkspace(dir);
  fs.writeFileSync(path.join(dir, '.antibody', 'registry', 'FM-003-invents-dates.md'), JUDGE_FM.replace('STATUS', judgeStatus));
  if (includeRule) {
    fs.writeFileSync(path.join(dir, '.antibody', 'registry', 'FM-001-over-apology.md'), RULE_FM);
  }
  const trace = makeTrace([
    { role: 'user', content: 'When will my refund arrive?' },
    { role: 'assistant', content: 'The refund is processing.' },
  ], 'test');
  saveTrace(trace, dir);
  return { dir, trace };
}

function mockCreate(payload) {
  setClient({
    messages: {
      create: async () => (typeof payload === 'function' ? payload() : payload),
    },
  });
}

function withKey(fn) {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevTok = process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  return fn().finally(() => {
    setClient(null);
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevTok === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = prevTok;
  });
}

function keyless(fn) {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevTok = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  return fn().finally(() => {
    setClient(null);
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevTok === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = prevTok;
  });
}

test('watching judge refusal → exit 2, not a clean miss', async () => {
  const { dir } = workspace('watching');
  mockCreate({ stop_reason: 'refusal', content: [], usage: {} });
  await withKey(async () => {
    const summary = await scan({ cwd: dir });
    assert.equal(summary.exitCode, 2);
    assert.equal(summary.results[0].hits.length, 0);
    assert.ok(summary.results[0].errors >= 1);
    assert.match(renderScanReport(summary), /unable to evaluate — exit 2/);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('watching judge parse error → exit 2', async () => {
  const { dir } = workspace('watching');
  mockCreate({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'not-json' }],
    usage: {},
  });
  await withKey(async () => {
    const summary = await scan({ cwd: dir });
    assert.equal(summary.exitCode, 2);
    assert.ok(summary.results[0].errors >= 1);
    assert.equal(summary.results[0].hits.length, 0);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('valid negative watching judge → exit 0', async () => {
  const { dir } = workspace('watching');
  mockCreate({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ hit: false, line: 0, quote: '', reason: 'clean' }) }],
    usage: { input_tokens: 4, output_tokens: 4 },
  });
  await withKey(async () => {
    const summary = await scan({ cwd: dir });
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.results[0].hits.length, 0);
    assert.equal(summary.results[0].errors, 0);
    assert.deepEqual(summary.skipped, []);
    assert.match(renderScanReport(summary), /clean — exit 0/);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('keyless judge skip is not an error and does not exit 2', async () => {
  const { dir } = workspace('watching', true);
  await keyless(async () => {
    const summary = await scan({ cwd: dir });
    assert.deepEqual(summary.skipped, ['FM-003']);
    assert.equal(summary.exitCode, 0);
    assert.ok(!summary.results.some((r) => r.id === 'FM-003'));
    assert.ok(!summary.results.some((r) => r.errors > 0));
    assert.match(renderScanReport(summary), /FM-003 skipped: judge checker needs ANTHROPIC_API_KEY/);
    assert.match(renderScanReport(summary), /clean — exit 0/);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('calibrating judge error reports but does not gate', async () => {
  const { dir } = workspace('calibrating');
  mockCreate({ stop_reason: 'refusal', content: [], usage: {} });
  await withKey(async () => {
    const summary = await scan({ cwd: dir });
    assert.equal(summary.exitCode, 0);
    assert.ok(summary.results[0].errors >= 1);
    assert.equal(summary.results[0].status, 'calibrating');
    assert.match(renderScanReport(summary), /errored/);
    assert.match(renderScanReport(summary), /clean — exit 0/);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('calibrate surfaces n_errors when the judge fails', async () => {
  const { dir, trace } = workspace('calibrating');
  fs.appendFileSync(
    path.join(dir, '.antibody', 'verdicts', 'tester.jsonl'),
    JSON.stringify({ trace: trace.id, verdict: 'ok', note: '', fm: 'FM-003', by: 'tester', at: '2026-08-26T00:00:00Z' }) + '\n',
  );
  mockCreate({ stop_reason: 'refusal', content: [], usage: {} });
  await withKey(async () => {
    const rows = await calibrate({ only: 'FM-003', cwd: dir });
    const row = rows.find((r) => r.id === 'FM-003');
    assert.ok(row.calibration);
    assert.equal(row.calibration.n_errors, 1);
    assert.equal(row.calibration.n_labels, 0);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
