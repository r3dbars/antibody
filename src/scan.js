// antibody scan — run every registry checker over a batch of traces.
// The report reads like a sentence; the exit code gates CI.
// Only FMs with status "watching" can fail the build (design decision D6):
// "calibrating" FMs report but never gate, and promotion to watching is a
// human-reviewed git diff, never tool magic.
import { listFms, listTraceIds, loadTrace, loadConfig, loadPreviousScan, saveScan, loadSuggestions, appendSuggestion, loadVerdicts } from './store.js';
import { check, pool, hasApiKey } from './check.js';

export async function scan({ traceIds = null, only = null, sample = null, cwd = process.cwd() } = {}) {
  const config = loadConfig(cwd);
  let fms = listFms(cwd).filter((f) => ['watching', 'calibrating'].includes(f.status));
  if (only) fms = fms.filter((f) => f.id === only || f.name === only);
  if (!fms.length) {
    return { at: new Date().toISOString(), traces: 0, results: [], skipped: [], usage: { calls: 0, usd: 0 }, exitCode: 0, empty: 'no active failure modes (status watching or calibrating) in the registry' };
  }

  let ids = traceIds ?? listTraceIds(cwd);
  if (sample && ids.length > sample) ids = ids.slice(-sample);
  const traces = ids.map((id) => loadTrace(id, cwd));

  const keyless = !hasApiKey();
  const skipped = keyless ? fms.filter((f) => f.checker?.type === 'judge').map((f) => f.id) : [];
  const active = keyless ? fms.filter((f) => f.checker?.type !== 'judge') : fms;

  const usage = { calls: 0, usd: 0 };
  const jobs = [];
  for (const fm of active) for (const trace of traces) jobs.push({ fm, trace });
  const outcomes = await pool(jobs, config.scan?.concurrency ?? 8, async ({ fm, trace }) => ({
    fm: fm.id,
    trace: trace.id,
    ...(await check(trace, fm, config, usage)),
  }));

  const previous = loadPreviousScan(cwd);
  const results = active.map((fm) => {
    const hits = outcomes.filter((o) => o.fm === fm.id && o.hit);
    const errors = outcomes.filter((o) => o.fm === fm.id && o.error);
    return {
      id: fm.id,
      name: fm.name,
      status: fm.status,
      hits: hits.map(({ trace, line, quote, reason }) => ({ trace, line, quote, reason })),
      errors: errors.length,
      previousHits: previous?.results?.find((r) => r.id === fm.id)?.hits?.length ?? null,
    };
  });

  // Calibrating checkers need labeled examples to earn trust, so each new hit
  // is queued as a review suggestion the human accepts (→ FM-tagged verdict)
  // or dismisses. Once proposed, a (trace, fm) pair is never re-proposed.
  const proposed = new Set(loadSuggestions(cwd).map((s) => `${s.trace} ${s.fm}`));
  for (const v of loadVerdicts(cwd)) if (v.fm) proposed.add(`${v.trace} ${v.fm}`);
  let suggested = 0;
  for (const r of results) {
    if (r.status !== 'calibrating') continue;
    for (const h of r.hits) {
      const key = `${h.trace} ${r.id}`;
      if (proposed.has(key)) continue;
      proposed.add(key);
      const reason = [h.quote && `"${h.quote}"`, h.reason].filter(Boolean).join(' — ') || 'checker hit';
      appendSuggestion({ trace: h.trace, fm: r.id, reason, by: `scan/${r.id}` }, cwd);
      suggested++;
    }
  }

  const gatingHits = results.filter((r) => r.status === 'watching' && r.hits.length > 0);
  const summary = {
    at: new Date().toISOString(),
    traces: traces.length,
    results,
    skipped,
    usage: { calls: usage.calls, usd: Number(usage.usd.toFixed(4)) },
    suggested,
    exitCode: gatingHits.length ? 1 : 0,
  };
  saveScan(summary, cwd);
  return summary;
}

export function renderScanReport(summary) {
  const lines = [];
  if (summary.empty) return `nothing to scan — ${summary.empty}\n`;
  lines.push(`Scanned ${summary.traces} trace${summary.traces === 1 ? '' : 's'} against ${summary.results.length} failure mode${summary.results.length === 1 ? '' : 's'}.`);
  lines.push('');
  for (const r of summary.results) {
    const mark = r.hits.length ? '✗' : '✓';
    const delta = r.previousHits != null ? ` (last scan: ${r.previousHits})` : '';
    const gate = r.status === 'calibrating' ? ' [calibrating — reported, never gates]' : '';
    lines.push(`${mark} ${r.id} ${r.name} — ${r.hits.length} hit${r.hits.length === 1 ? '' : 's'}${delta}${gate}`);
    for (const h of r.hits.slice(0, 5)) {
      lines.push(`    ${h.trace} line ${h.line}: "${h.quote}"${h.reason ? ` — ${h.reason}` : ''}`);
    }
    if (r.hits.length > 5) lines.push(`    …and ${r.hits.length - 5} more`);
    if (r.errors) lines.push(`    (${r.errors} check${r.errors === 1 ? '' : 's'} errored)`);
  }
  for (const id of summary.skipped) {
    lines.push(`- ${id} skipped: judge checker needs ANTHROPIC_API_KEY`);
  }
  if (summary.suggested) {
    lines.push(`→ ${summary.suggested} new calibrating hit${summary.suggested === 1 ? '' : 's'} queued in antibody review — accept or dismiss to calibrate`);
  }
  lines.push('');
  if (summary.usage.calls) lines.push(`${summary.usage.calls} judge calls · ~$${summary.usage.usd.toFixed(4)}`);
  lines.push(summary.exitCode ? 'RESULT: known failure modes recurred — exit 1' : 'RESULT: clean — exit 0');
  return lines.join('\n') + '\n';
}
