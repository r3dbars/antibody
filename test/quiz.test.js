import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAssertion, validateQuiz, validateQuizSet } from '../src/quiz.js';

const envelope = {
  status: 'ok',
  result: { action: 'show', suggestion: 'the updated deck after lunch.' },
  metrics: { latency_ms: 284 },
  observations: { text_integrity: true, citations: ['a', 'b'] },
};

test('deterministic graders describe behavior without one magic sentence', () => {
  const assertions = [
    { path: 'result.action', equals: 'show' },
    { path: 'result.suggestion', includes_any: ['deck', 'it'] },
    { path: 'result.suggestion', includes: 'AFTER LUNCH' },
    { path: 'result.suggestion', excludes: ['tomorrow', 'tonight'] },
    { path: 'result.suggestion', maximum_words: 10 },
    { path: 'metrics.latency_ms', number_lte: 500 },
    { path: 'observations.citations', count_equals: 2 },
    { path: 'observations', json_schema: { type: 'object', required: ['text_integrity'] } },
    { path: 'observations.text_integrity', equals: true },
  ];
  assert.ok(assertions.every((assertion) => gradeAssertion(envelope, assertion).passed));
});

test('missing paths fail ordinary graders but can be asserted explicitly', () => {
  assert.equal(gradeAssertion(envelope, { path: 'result.missing', equals: null }).passed, false);
  assert.equal(gradeAssertion(envelope, { path: 'result.missing', path_exists: false }).passed, true);
});

test('quiz validation requires a lifecycle and exactly one safe grader', () => {
  const valid = {
    schema: 'antibody.quiz.v1',
    id: 'FM-001.001',
    name: 'keeps-visible-date',
    status: 'proving',
    input: { message: 'Friday' },
    expect: [{ path: 'result.answer', includes: 'Friday' }],
  };
  assert.deepEqual(validateQuiz(valid), []);
  assert.match(validateQuiz({ ...valid, status: 'watching' })[0], /status must be/);
  assert.match(validateQuiz({ ...valid, expect: [{ path: 'result.answer', includes: 'Friday', equals: 'Friday' }] })[0], /exactly one/);
});

test('known-bad regression quizzes require a separate existing control', () => {
  const regression = {
    schema: 'antibody.quiz.v1', id: 'FM-001.001', name: 'bad-case', status: 'proving',
    input: {}, expect: [{ path: 'result', expected_output: true }],
    proof: { known_bad_outcome: 'fail' },
  };
  assert.match(validateQuizSet([regression])[0], /require control\.case/);
  regression.control = { case: 'FM-001.002' };
  assert.match(validateQuizSet([regression])[0], /control quiz FM-001.002 not found/);
  const control = { ...regression, id: 'FM-001.002', name: 'healthy-control', proof: undefined, control: undefined };
  assert.deepEqual(validateQuizSet([regression, control]), []);
});
