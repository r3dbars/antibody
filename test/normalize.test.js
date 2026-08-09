import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, makeTrace, normalizeMessages, extractMessages, stableJson } from '../src/normalize.js';

test('fingerprint is stable across metadata differences', () => {
  const a = makeTrace([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], 'a.json');
  const b = makeTrace([{ role: 'user', content: 'hi', timestamp: 123 }, { role: 'assistant', content: 'hello', id: 'x' }], 'b.jsonl:9');
  assert.equal(a.id, b.id);
  assert.match(a.id, /^tr-[0-9a-f]{12}$/);
});

test('fingerprint differs when content differs', () => {
  const a = makeTrace([{ role: 'user', content: 'hi' }]);
  const b = makeTrace([{ role: 'user', content: 'hi!' }]);
  assert.notEqual(a.id, b.id);
});

test('fingerprint applies NFC normalization', () => {
  const composed = makeTrace([{ role: 'user', content: 'café' }]);
  const decomposed = makeTrace([{ role: 'user', content: 'café' }]);
  assert.equal(composed.id, decomposed.id);
});

test('role synonyms map to the canonical set', () => {
  const msgs = normalizeMessages([
    { role: 'human', content: 'a' },
    { role: 'AI', content: 'b' },
    { role: 'function', content: 'c' },
  ]);
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'tool']);
});

test('block content flattens deterministically', () => {
  const msgs = normalizeMessages([
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'checking' },
        { type: 'tool_use', name: 'lookup', input: { b: 2, a: 1 } },
      ],
    },
  ]);
  assert.equal(msgs[0].content, 'checking\n[tool_call] lookup({"a":1,"b":2})');
});

test('thinking blocks are excluded from the observable conversation', () => {
  const withThinking = makeTrace([
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'secret' }, { type: 'text', text: 'answer' }] },
  ]);
  const without = makeTrace([{ role: 'assistant', content: 'answer' }]);
  assert.equal(withThinking.id, without.id);
});

test('extractMessages finds common container keys', () => {
  assert.ok(extractMessages({ messages: [1] }));
  assert.ok(extractMessages({ conversation: [1] }));
  assert.ok(extractMessages({ turns: [1] }));
  assert.ok(extractMessages([1]));
  assert.equal(extractMessages({ nope: true }), null);
});

test('stableJson sorts keys recursively', () => {
  assert.equal(stableJson({ b: { d: 1, c: 2 }, a: [3, { z: 1, y: 2 }] }), '{"a":[3,{"y":2,"z":1}],"b":{"c":2,"d":1}}');
});
