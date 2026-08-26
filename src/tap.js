// @ts-nocheck
// antibody tap — zero-instrumentation trace capture. A localhost proxy in
// front of the Anthropic API: point ANTHROPIC_BASE_URL at it and every
// conversation your agent has is recorded into .antibody/traces/ as a normal
// trace, no logging code required. The proxy is a bystander: bytes pass
// through verbatim (streaming included), recording happens off the copy, and
// a recording failure must never break the underlying API call.
import http from 'node:http';
import { assertWorkspace, saveTrace } from './store.js';
import { extractMessages, makeTrace } from './normalize.js';

// Hop-by-hop / body-encoding headers that must not be forwarded verbatim:
// fetch decompresses and re-chunks, so lengths and encodings no longer apply.
const STRIP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'accept-encoding']);

function forwardable(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!STRIP.has(k.toLowerCase()) && v !== undefined) out[k] = v;
  }
  return out;
}

// Rebuild the assistant message from an Anthropic SSE stream: text_delta and
// thinking_delta append to their block, input_json_delta accumulates the
// tool_use input JSON. Unknown event types are ignored, so schema additions
// degrade to "recorded less", never to a crash.
export function assistantFromSse(sseText) {
  const blocks = new Map();
  let role = 'assistant';
  for (const line of sseText.split('\n')) {
    if (!line.startsWith('data:')) continue;
    let ev;
    try {
      ev = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    if (ev.type === 'message_start' && ev.message?.role) role = ev.message.role;
    else if (ev.type === 'content_block_start') blocks.set(ev.index, { block: { ...(ev.content_block ?? {}) }, json: '' });
    else if (ev.type === 'content_block_delta') {
      const b = blocks.get(ev.index);
      if (!b) continue;
      if (ev.delta?.type === 'text_delta') b.block.text = (b.block.text ?? '') + ev.delta.text;
      else if (ev.delta?.type === 'thinking_delta') b.block.thinking = (b.block.thinking ?? '') + ev.delta.thinking;
      else if (ev.delta?.type === 'input_json_delta') b.json += ev.delta.partial_json ?? '';
    }
  }
  const content = [...blocks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, b]) => {
      if (b.json) {
        try {
          b.block.input = JSON.parse(b.json);
        } catch {
          b.block.input = { partial: b.json };
        }
      }
      return b.block;
    });
  return content.length ? { role, content } : null;
}

function recordExchange(requestJson, assistant, cwd) {
  if (!Array.isArray(requestJson?.messages) || !assistant) return null;
  // Same shape the Anthropic request/response import adapter accepts — one
  // normalize path, one fingerprint, whether a conversation was imported
  // from logs or recorded live.
  const raw = extractMessages({
    request: { system: requestJson.system, messages: requestJson.messages },
    response: assistant,
  });
  const trace = raw && makeTrace(raw, 'tap', requestJson.model ? { model: requestJson.model } : null);
  if (!trace) return null;
  saveTrace(trace, cwd);
  return trace;
}

export function startTap({ port = 4402, target = 'https://api.anthropic.com', cwd = process.cwd(), log = () => {} } = {}) {
  assertWorkspace(cwd);
  const base = target.replace(/\/$/, '');
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const upstream = await fetch(base + req.url, {
        method: req.method,
        headers: forwardable(req.headers),
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      res.writeHead(upstream.status, forwardable(Object.fromEntries(upstream.headers)));
      const responseChunks = [];
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          res.write(chunk); // client first — recording rides the copy
          responseChunks.push(Buffer.from(chunk));
        }
      }
      res.end();
      if (req.method !== 'POST' || !req.url.includes('/v1/messages') || !upstream.ok) return;
      try {
        const requestJson = JSON.parse(body.toString('utf8'));
        const responseText = Buffer.concat(responseChunks).toString('utf8');
        const assistant = (upstream.headers.get('content-type') ?? '').includes('text/event-stream')
          ? assistantFromSse(responseText)
          : JSON.parse(responseText);
        const trace = recordExchange(requestJson, assistant, cwd);
        if (trace) log(`recorded ${trace.id} (${trace.messages.length} messages)`);
      } catch (err) {
        log(`not recorded: ${err.message ?? err}`); // the API call itself already succeeded
      }
    } catch (err) {
      // Upstream unreachable or client hung up — report to the caller, since
      // there is no response left to corrupt.
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'antibody_tap_proxy_error', message: String(err.message ?? err) } }));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
