// antibody calibrate — measure each checker against human ground truth.
// Agreement alone lies when failures are rare (a judge that always says
// "clean" scores ~95%), so TPR/TNR are first-class (design decision D7).
// The tool only *suggests* status changes; a human commits the diff (D6).
import { listFms, loadTrace, loadConfig, loadVerdicts, latestVerdicts, saveFm } from './store.js';
import { check, pool, hasApiKey } from './check.js';

// Pure math, unit-testable: labels/predictions are arrays of {trace, bad|hit}.
export function computeCalibration(labels, predictions) {
  const predByTrace = new Map(predictions.map((p) => [p.trace, p.hit]));
  let agree = 0;
  let tp = 0, fn = 0, tn = 0, fp = 0;
  for (const l of labels) {
    const hit = predByTrace.get(l.trace);
    if (hit === undefined) continue;
    if (hit === l.bad) agree++;
    if (l.bad) hit ? tp++ : fn++;
    else hit ? fp++ : tn++;
  }
  const n = tp + fn + tn + fp;
  return {
    n_labels: n,
    agreement: n ? Number((agree / n).toFixed(2)) : null,
    tpr: tp + fn ? Number((tp / (tp + fn)).toFixed(2)) : null,
    tnr: tn + fp ? Number((tn / (tn + fp)).toFixed(2)) : null,
  };
}

export function suggestStatus(fm, cal) {
  if (cal.n_labels < 5) return { status: 'calibrating', why: `only ${cal.n_labels} labels — needs at least 5` };
  if (cal.agreement >= 0.85 && (cal.tpr == null || cal.tpr >= 0.7)) {
    return { status: 'watching', why: `agreement ${pct(cal.agreement)} over ${cal.n_labels} labels` };
  }
  return { status: 'calibrating', why: `agreement ${pct(cal.agreement)} (TPR ${pct(cal.tpr)}, TNR ${pct(cal.tnr)}) — below the trust bar` };
}

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export async function calibrate({ only = null, write = false, cwd = process.cwd() } = {}) {
  const config = loadConfig(cwd);
  let fms = listFms(cwd).filter((f) => f.status !== 'retired');
  if (only) fms = fms.filter((f) => f.id === only || f.name === only);
  const verdicts = latestVerdicts(loadVerdicts(cwd));

  const out = [];
  for (const fm of fms) {
    // Ground truth: explicit verdicts on this FM, plus open-ended flags on its
    // example traces (the flags that created the FM are labels for it too).
    const exampleIds = new Set((fm.examples ?? []).map((e) => e.trace));
    const labels = verdicts
      .filter((v) => v.fm === fm.id || (v.fm == null && exampleIds.has(v.trace)))
      .map((v) => ({ trace: v.trace, bad: v.verdict === 'bad' }));
    if (!labels.length) {
      out.push({ id: fm.id, name: fm.name, status: fm.status, calibration: null, note: 'no labeled traces yet' });
      continue;
    }
    if (fm.checker?.type === 'judge' && !hasApiKey()) {
      out.push({ id: fm.id, name: fm.name, status: fm.status, calibration: null, note: 'judge checker needs ANTHROPIC_API_KEY' });
      continue;
    }
    const usage = { calls: 0, usd: 0 };
    const predictions = await pool(labels, config.scan?.concurrency ?? 8, async (l) => {
      let trace;
      try {
        trace = loadTrace(l.trace, cwd);
      } catch {
        return { trace: l.trace, hit: undefined };
      }
      const result = await check(trace, fm, config, usage);
      return { trace: l.trace, hit: result.error ? undefined : result.hit };
    });
    const cal = computeCalibration(labels, predictions.filter((p) => p.hit !== undefined));
    cal.last_checked = new Date().toISOString().slice(0, 10);
    const suggestion = suggestStatus(fm, cal);
    if (write) {
      fm.calibration = cal;
      saveFm(fm, cwd);
    }
    out.push({ id: fm.id, name: fm.name, status: fm.status, calibration: cal, suggestion, usd: Number(usage.usd.toFixed(4)) });
  }
  return out;
}

export function renderCalibration(rows, wrote) {
  const lines = [];
  for (const r of rows) {
    if (!r.calibration) {
      lines.push(`- ${r.id} ${r.name} [${r.status}] — ${r.note}`);
      continue;
    }
    const c = r.calibration;
    lines.push(`- ${r.id} ${r.name} [${r.status}] — agrees with your labels ${pct(c.agreement)} (TPR ${pct(c.tpr)}, TNR ${pct(c.tnr)}, n=${c.n_labels})`);
    if (r.suggestion.status !== r.status) {
      lines.push(`    suggests: status → ${r.suggestion.status} (${r.suggestion.why}) — edit the FM file and commit to apply`);
    }
  }
  if (wrote) lines.push('', 'calibration blocks updated in registry files — review the diff and commit');
  return lines.join('\n') + '\n';
}
