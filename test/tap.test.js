// antibody tap: proxy bytes through untouched, record each /v1/messages
// exchange as a normal trace. Runs against a local stub upstream — keyless,
// offline, no real API involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTap, assistantFromSse } from '../src/tap.js';
import { initWorkspace } from '../src/store.js';

const SSE_BODY = [
  'event: message_start',
  'data: {"type":"message_start","message":{"role":"assistant","content":[]}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"stream"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ed reply"}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"lookup_order","input":{}}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"id\\":"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"48213}"}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

function startStub() {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }
    const parsed = body ? JSON.parse(body) : {};
    if (parsed.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end(SSE_BODY);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'Hello back' }], stop_reason: 'end_turn' }));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-tap-'));
  initWorkspace(dir);
  const stub = await startStub();
  const tap = await startTap({ port: 0, target: `http://127.0.0.1:${stub.address().port}`, cwd: dir });
  return { dir, stub, tap, base: `http://127.0.0.1:${tap.address().port}` };
}

function traceFiles(dir) {
  return fs.readdirSync(path.join(dir, '.antibody', 'traces')).filter((f) => f.endsWith('.json'));
}

function teardown({ dir, stub, tap }) {
  stub.close();
  tap.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

test('tap passes a non-streaming call through and records the trace', async () => {
  const ctx = await setup();
  const res = await fetch(`${ctx.base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', system: 'be helpful', messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).content[0].text, 'Hello back'); // byte-for-byte passthrough
  const files = traceFiles(ctx.dir);
  assert.equal(files.length, 1);
  const trace = JSON.parse(fs.readFileSync(path.join(ctx.dir, '.antibody', 'traces', files[0]), 'utf8'));
  assert.deepEqual(trace.messages, [
    { role: 'system', content: 'be helpful' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'Hello back' },
  ]);
  assert.equal(trace.meta.model, 'claude-haiku-4-5');
  teardown(ctx);
});

test('tap reconstructs a streamed reply, client still gets raw SSE', async () => {
  const ctx = await setup();
  const res = await fetch(`${ctx.base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'go' }] }),
  });
  assert.equal(await res.text(), SSE_BODY); // stream untouched on the wire
  const files = traceFiles(ctx.dir);
  assert.equal(files.length, 1);
  const trace = JSON.parse(fs.readFileSync(path.join(ctx.dir, '.antibody', 'traces', files[0]), 'utf8'));
  assert.deepEqual(trace.messages, [
    { role: 'user', content: 'go' },
    { role: 'assistant', content: 'streamed reply\n[tool_call] lookup_order({"id":48213})' },
  ]);
  teardown(ctx);
});

test('tap ignores non-messages endpoints and unreachable upstreams fail loud', async () => {
  const ctx = await setup();
  assert.equal(await (await fetch(`${ctx.base}/health`)).text(), 'ok');
  assert.equal(traceFiles(ctx.dir).length, 0);
  ctx.stub.close();
  const res = await fetch(`${ctx.base}/v1/messages`, { method: 'POST', body: '{}' });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.type, 'antibody_tap_proxy_error');
  ctx.tap.close();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
});

test('assistantFromSse tolerates junk lines and unknown events', () => {
  const rebuilt = assistantFromSse('data: not json\n\ndata: {"type":"future_event"}\n\n' + SSE_BODY);
  assert.equal(rebuilt.role, 'assistant');
  assert.equal(rebuilt.content[0].text, 'streamed reply');
  assert.deepEqual(rebuilt.content[1].input, { id: 48213 });
  assert.equal(assistantFromSse('data: {"type":"message_stop"}'), null);
});
