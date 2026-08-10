// antibody review — a localhost server for the human review surface.
// One static HTML file + three JSON endpoints over the same files the CLI and
// agents use. Binds 127.0.0.1 only; nothing is exposed to the network.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWorkspace, listTraceIds, loadTrace, listFms, loadVerdicts, latestVerdicts, appendVerdict, reviewerName, pendingSuggestions, appendSuggestion } from './store.js';

const UI_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'review.html');

function state(cwd) {
  const verdicts = latestVerdicts(loadVerdicts(cwd));
  const reviewedBy = new Map(); // trace -> [reviewer, ...] (open-ended verdicts only)
  for (const v of verdicts) {
    if (v.fm != null) continue;
    if (!reviewedBy.has(v.trace)) reviewedBy.set(v.trace, []);
    reviewedBy.get(v.trace).push({ by: v.by, verdict: v.verdict });
  }
  const me = reviewerName(cwd);
  const suggestions = {}; // trace -> [{fm, name, reason, by}]
  const fms = listFms(cwd).map((f) => ({ id: f.id, name: f.name, status: f.status }));
  const fmName = new Map(fms.map((f) => [f.id, f.name]));
  for (const s of pendingSuggestions(cwd)) {
    (suggestions[s.trace] ??= []).push({ fm: s.fm, name: fmName.get(s.fm) ?? '', reason: s.reason, by: s.by });
  }
  const traces = listTraceIds(cwd).map((id) => ({
    id,
    reviewers: reviewedBy.get(id) ?? [],
  }));
  return { me, traces, fms, suggestions };
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function startServer({ port = 4400, cwd = process.cwd() } = {}) {
  assertWorkspace(cwd);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(UI_PATH));
      } else if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, 200, state(cwd));
      } else if (req.method === 'GET' && url.pathname === '/api/trace') {
        const id = url.searchParams.get('id') ?? '';
        if (!/^tr-[0-9a-f]{12}$/.test(id)) return json(res, 400, { error: 'bad trace id' });
        json(res, 200, loadTrace(id, cwd));
      } else if (req.method === 'POST' && url.pathname === '/api/verdict') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const v = JSON.parse(body);
        if (!/^tr-[0-9a-f]{12}$/.test(v.trace ?? '')) return json(res, 400, { error: 'bad trace id' });
        if (!['bad', 'ok'].includes(v.verdict)) return json(res, 400, { error: 'verdict must be "bad" or "ok"' });
        json(res, 200, appendVerdict({ trace: v.trace, verdict: v.verdict, note: v.note ?? '', fm: v.fm ?? null }, cwd));
      } else if (req.method === 'POST' && url.pathname === '/api/suggestion') {
        // Human ruling on an agent proposal. Accepting records a real verdict
        // tagged with the FM — the labeled example calibration scores against.
        let body = '';
        for await (const chunk of req) body += chunk;
        const s = JSON.parse(body);
        if (!/^tr-[0-9a-f]{12}$/.test(s.trace ?? '')) return json(res, 400, { error: 'bad trace id' });
        if (!['accept', 'dismiss'].includes(s.action)) return json(res, 400, { error: 'action must be "accept" or "dismiss"' });
        const resolved = appendSuggestion({ trace: s.trace, fm: s.fm, resolved: s.action === 'accept' ? 'accepted' : 'dismissed' }, cwd);
        if (s.action === 'accept') appendVerdict({ trace: s.trace, verdict: 'bad', note: s.note ?? '', fm: s.fm }, cwd);
        json(res, 200, resolved);
      } else {
        json(res, 404, { error: 'not found' });
      }
    } catch (err) {
      json(res, 500, { error: String(err.message ?? err) });
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
