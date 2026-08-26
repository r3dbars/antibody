import test from 'node:test';
import assert from 'node:assert/strict';
import { runRule, transcript, runJudge, setClient } from '../src/check.js';
import { computeCalibration, suggestStatus } from '../src/calibrate.js';

const trace = {
  id: 'tr-abcabcabcabc',
  messages: [
    { role: 'user', content: 'help me' },
    { role: 'assistant', content: "I'm so sorry! I apologize again, sorry for the trouble." },
  ],
};

test('rule checker reports hit with line and quote', () => {
  const fm = { id: 'FM-001', checker: { type: 'rule', pattern: '(sorry|apologi[sz]e).{0,300}?(sorry|apologi[sz]e)', flags: 'is', role: 'assistant' } };
  const r = runRule(trace, fm);
  assert.equal(r.hit, true);
  assert.equal(r.line, 2);
  assert.ok(r.quote.toLowerCase().includes('sorry'));
});

test('empty rule pattern is an error, not a hit on every message', () => {
  const r = runRule(trace, { id: 'FM-empty', checker: { type: 'rule', pattern: '', role: 'assistant' } });
  assert.equal(r.hit, null);
  assert.match(r.error, /missing a pattern/);
});

test('missing rule pattern is an error, not a hit on every message', () => {
  const r = runRule(trace, { id: 'FM-missing', checker: { type: 'rule', role: 'assistant' } });
  assert.equal(r.hit, null);
  assert.match(r.error, /missing a pattern/);
});

test('rule checker respects role restriction and misses cleanly', () => {
  const fm = { id: 'FM-001', checker: { type: 'rule', pattern: 'help', role: 'assistant' } };
  assert.equal(runRule(trace, fm).hit, false);
});

test('transcript numbers lines from 1', () => {
  assert.ok(transcript(trace).startsWith('1. [user] help me\n2. [assistant]'));
});

test('calibration math: agreement, TPR, TNR', () => {
  const labels = [
    { trace: 't1', bad: true },
    { trace: 't2', bad: true },
    { trace: 't3', bad: false },
    { trace: 't4', bad: false },
  ];
  const predictions = [
    { trace: 't1', hit: true },   // TP
    { trace: 't2', hit: false },  // FN
    { trace: 't3', hit: false },  // TN
    { trace: 't4', hit: false },  // TN
  ];
  const c = computeCalibration(labels, predictions);
  assert.equal(c.n_labels, 4);
  assert.equal(c.agreement, 0.75);
  assert.equal(c.tpr, 0.5);
  assert.equal(c.tnr, 1);
});

test('a judge that always says clean scores high agreement but zero TPR', () => {
  const labels = [
    { trace: 't1', bad: true },
    ...Array.from({ length: 9 }, (_, i) => ({ trace: `ok${i}`, bad: false })),
  ];
  const predictions = labels.map((l) => ({ trace: l.trace, hit: false }));
  const c = computeCalibration(labels, predictions);
  assert.equal(c.agreement, 0.9); // looks trustworthy…
  assert.equal(c.tpr, 0);        // …but catches nothing. This is why TPR exists.
  const s = suggestStatus({ status: 'calibrating' }, c);
  assert.equal(s.status, 'calibrating');
});

test('suggestStatus promotes only with enough labels and agreement', () => {
  assert.equal(suggestStatus({}, { n_labels: 3, agreement: 1, tpr: 1 }).status, 'calibrating');
  assert.equal(suggestStatus({}, { n_labels: 12, agreement: 0.92, tpr: 0.9 }).status, 'watching');
  assert.equal(suggestStatus({}, { n_labels: 12, agreement: 0.6, tpr: 0.5, tnr: 0.7 }).status, 'calibrating');
});


const judgeTrace = {
  id: 'tr-defdefdefdef',
  messages: [
    { role: 'user', content: 'status of my refund?' },
    { role: 'assistant', content: 'The refund is processing.' },
  ],
};
const judgeFm = {
  id: 'FM-003',
  name: 'invents-dates-not-in-sources',
  description: 'states a date that is not in the sources',
  checker: { type: 'judge' },
};
const judgeConfig = { models: { judge: 'claude-haiku-4-5' } };

function mockCreate(payload) {
  setClient({
    messages: {
      create: async () => (typeof payload === 'function' ? payload() : payload),
    },
  });
}

test('judge refusal is fail-closed: hit null, never hit false', async () => {
  mockCreate({ stop_reason: 'refusal', content: [], usage: {} });
  try {
    const r = await runJudge(judgeTrace, judgeFm, judgeConfig);
    assert.equal(r.hit, null);
    assert.notEqual(r.hit, false);
    assert.match(r.error, /declined|refusal|safety/i);
  } finally {
    setClient(null);
  }
});

test('judge parse error is fail-closed: hit null, never hit false', async () => {
  mockCreate({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'I cannot put this in JSON' }],
    usage: {},
  });
  try {
    const r = await runJudge(judgeTrace, judgeFm, judgeConfig);
    assert.equal(r.hit, null);
    assert.notEqual(r.hit, false);
    assert.match(r.error, /unparseable/i);
  } finally {
    setClient(null);
  }
});

test('judge network error is fail-closed: hit null, never hit false', async () => {
  mockCreate(() => { throw new Error('connect ECONNREFUSED'); });
  try {
    const r = await runJudge(judgeTrace, judgeFm, judgeConfig);
    assert.equal(r.hit, null);
    assert.notEqual(r.hit, false);
    assert.match(r.error, /ECONNREFUSED|failed/i);
  } finally {
    setClient(null);
  }
});

test('valid negative judge verdict is hit false with no error', async () => {
  mockCreate({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ hit: false, line: 0, quote: '', reason: 'no invented date' }) }],
    usage: { input_tokens: 10, output_tokens: 8 },
  });
  try {
    const r = await runJudge(judgeTrace, judgeFm, judgeConfig);
    assert.equal(r.hit, false);
    assert.equal(r.error, undefined);
    assert.match(r.reason, /no invented date/);
  } finally {
    setClient(null);
  }
});
