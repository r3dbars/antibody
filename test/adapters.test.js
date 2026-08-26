// Provider-specific import shapes: OpenAI chat-completions logs (request +
// choices, tool_calls flattened), Anthropic request/response logs, and
// Claude Code session transcripts. All feed the same normalize path — same
// roles, same block flattening, same fingerprints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tracesFromFile, extractMessages, normalizeMessages } from '../src/normalize.js';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-adapters-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

test('OpenAI chat-completions log: request messages + response choices', () => {
  const line = {
    model: 'gpt-x',
    messages: [{ role: 'user', content: 'where is my order?' }],
    choices: [{ index: 0, message: { role: 'assistant', content: 'Let me check that for you.' }, finish_reason: 'stop' }],
  };
  const [trace] = tracesFromFile(tmpFile('calls.jsonl', JSON.stringify(line) + '\n'));
  assert.deepEqual(trace.messages, [
    { role: 'user', content: 'where is my order?' },
    { role: 'assistant', content: 'Let me check that for you.' },
  ]);
});

test('OpenAI tool_calls flatten to [tool_call] text, tool replies keep their role', () => {
  const messages = normalizeMessages([
    { role: 'assistant', content: null, tool_calls: [{ id: 'x', function: { name: 'lookup_order', arguments: '{"id":48213}' } }] },
    { role: 'tool', tool_call_id: 'x', content: '{"status":"shipped"}' },
  ]);
  assert.deepEqual(messages, [
    { role: 'assistant', content: '[tool_call] lookup_order({"id":48213})' },
    { role: 'tool', content: '{"status":"shipped"}' },
  ]);
});

test('Anthropic request/response log: system + request messages + reply blocks', () => {
  const log = {
    request: {
      system: 'You are a support agent.',
      messages: [{ role: 'user', content: 'refund please' }],
    },
    response: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Refund started.' }],
      stop_reason: 'end_turn',
    },
  };
  const [trace] = tracesFromFile(tmpFile('call.json', JSON.stringify(log)));
  assert.deepEqual(trace.messages, [
    { role: 'system', content: 'You are a support agent.' },
    { role: 'user', content: 'refund please' },
    { role: 'assistant', content: 'Refund started.' },
  ]);
});

test('Claude Code session transcript: one conversation, meta lines skipped, blocks flattened', () => {
  const lines = [
    { type: 'summary', summary: 'Fix the flaky test' },
    { type: 'user', message: { role: 'user', content: 'fix the flaky test in ci' }, uuid: 'a1' },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hidden' },
          { type: 'text', text: 'Looking at the test file.' },
          { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
        ],
      },
      uuid: 'a2',
    },
    { type: 'file-history-snapshot', snapshot: {} },
  ];
  const traces = tracesFromFile(tmpFile('session.jsonl', lines.map((l) => JSON.stringify(l)).join('\n')));
  assert.equal(traces.length, 1);
  assert.deepEqual(traces[0].messages, [
    { role: 'user', content: 'fix the flaky test in ci' },
    { role: 'assistant', content: 'Looking at the test file.\n[tool_call] Bash({"command":"npm test"})' },
  ]);
});

test('adapters do not shadow the plain shapes', () => {
  assert.deepEqual(extractMessages({ messages: [{ role: 'user', content: 'hi' }] }), [{ role: 'user', content: 'hi' }]);
  assert.equal(extractMessages({ note: 'not a conversation' }), null);
});
