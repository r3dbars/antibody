// antibody quiz — grade the graders. Every checker that wants to gate CI must
// first pass a committed set of quiz cases: tiny trace-shaped conversations
// with a known right answer ("hit" or "clean"). Calibration proves a judge
// against real traffic; real traces are gitignored, so CI needs quiz cases —
// the committed, reviewable stand-in — to prove the checker still works
// before `antibody scan` is allowed to break the build.
import fs from 'node:fs';
import path from 'node:path';
import { assertWorkspace, listFms, loadConfig, ROOT_DIR } from './store.js';
import { check, pool, hasApiKey } from './check.js';
import { extractMessages, makeTrace } from './normalize.js';

// Cases live in .antibody/quiz/<FM-id or FM-id-name>/*.json — committed,
// unlike traces, because they are curated and sanitized by a human.
export function loadQuizCases(fmId, cwd = process.cwd()) {
  const quizRoot = path.join(assertWorkspace(cwd), 'quiz');
  if (!fs.existsSync(quizRoot)) return [];
  const dir = fs
    .readdirSync(quizRoot)
    .sort()
    .find((d) => d === fmId || d.startsWith(`${fmId}-`));
  if (!dir) return [];
  const cases = [];
  for (const f of fs.readdirSync(path.join(quizRoot, dir)).filter((f) => f.endsWith('.json')).sort()) {
    const rel = path.join(ROOT_DIR, 'quiz', dir, f);
    const raw = JSON.parse(fs.readFileSync(path.join(quizRoot, dir, f), 'utf8'));
    if (!['hit', 'clean'].includes(raw.expect)) {
      throw new Error(`${rel}: "expect" must be "hit" or "clean"`);
    }
    const messages = extractMessages(raw);
    const trace = messages && makeTrace(messages, rel);
    if (!trace) throw new Error(`${rel}: no non-empty "messages" list`);
    cases.push({ file: f, expect: raw.expect, note: raw.note ?? '', trace });
  }
  return cases;
}

// Gate semantics mirror the trust ladder (D6): only "watching" modes can fail
// the quiz, exactly as only "watching" modes can fail a scan. A watching
// *judge* with no quiz is itself a failure — an unexamined grader must not
// gate a build. Rules are deterministic, so their quiz is optional (but runs,
// and gates, when present). Calibrating modes are graded and reported only.
export async function quiz({ only = null, cwd = process.cwd() } = {}) {
  const config = loadConfig(cwd);
  let fms = listFms(cwd).filter((f) => ['watching', 'calibrating'].includes(f.status));
  if (only) fms = fms.filter((f) => f.id === only || f.name === only);
  const threshold = config.quiz?.threshold ?? 1;
  const keyless = !hasApiKey();
  const usage = { calls: 0, usd: 0 };
  const results = [];

  for (const fm of fms) {
    const base = { id: fm.id, name: fm.name, status: fm.status, checker: fm.checker?.type };
    const isJudge = fm.checker?.type === 'judge';
    if (isJudge && keyless) {
      results.push({ ...base, skipped: 'judge checker needs ANTHROPIC_API_KEY', cases: 0 });
      continue;
    }
    const cases = loadQuizCases(fm.id, cwd);
    if (!cases.length) {
      // No quiz. Fatal only for a gating judge — see the gate note above.
      results.push({ ...base, cases: 0, missing: isJudge && fm.status === 'watching' });
      continue;
    }
    const graded = await pool(cases, config.scan?.concurrency ?? 8, async (c) => {
      let got;
      let detail = '';
      try {
        const r = await check(c.trace, fm, config, usage);
        got = r.error ? 'error' : r.hit ? 'hit' : 'clean';
        detail = r.error ?? r.reason ?? '';
      } catch (err) {
        got = 'error';
        detail = String(err.message ?? err);
      }
      return { file: c.file, expect: c.expect, got, pass: got === c.expect, detail };
    });
    const passed = graded.filter((g) => g.pass).length;
    results.push({
      ...base,
      cases: graded.length,
      passed,
      score: Number((passed / graded.length).toFixed(2)),
      failed: graded.filter((g) => !g.pass),
    });
  }

  const gatingFailures = results.filter(
    (r) => r.status === 'watching' && !r.skipped && (r.missing || (r.cases > 0 && r.score < threshold)),
  );
  return {
    at: new Date().toISOString(),
    threshold,
    results,
    usage: { calls: usage.calls, usd: Number(usage.usd.toFixed(4)) },
    exitCode: gatingFailures.length ? 1 : 0,
  };
}

const pct = (x) => `${Math.round(x * 100)}%`;

export function renderQuiz(summary) {
  const lines = [];
  if (!summary.results.length) return 'nothing to quiz — no active failure modes (status watching or calibrating)\n';
  lines.push(`Quizzed active checkers against committed cases in ${ROOT_DIR}/quiz/ (pass bar: ${pct(summary.threshold)}).`);
  lines.push('');
  for (const r of summary.results) {
    const gate = r.status === 'calibrating' ? ' [calibrating — reported, never gates]' : '';
    if (r.skipped) {
      lines.push(`- ${r.id} ${r.name} skipped: ${r.skipped}`);
    } else if (!r.cases) {
      lines.push(
        r.missing
          ? `✗ ${r.id} ${r.name} — watching judge has NO quiz cases (add ${ROOT_DIR}/quiz/${r.id}/*.json or demote to calibrating)`
          : `- ${r.id} ${r.name} — no quiz cases${gate}`,
      );
    } else {
      const ok = r.score >= summary.threshold;
      lines.push(`${ok ? '✓' : '✗'} ${r.id} ${r.name} (${r.checker}) — ${r.passed}/${r.cases} correct${gate}`);
      for (const f of r.failed) {
        lines.push(`    ${f.file}: expected ${f.expect}, checker said ${f.got}${f.detail ? ` — ${f.detail}` : ''}`);
      }
    }
  }
  lines.push('');
  if (summary.usage.calls) lines.push(`${summary.usage.calls} judge calls · ~$${summary.usage.usd.toFixed(4)}`);
  lines.push(
    summary.exitCode
      ? 'RESULT: a gating checker failed its quiz — fix the checker (or its quiz) before trusting scan — exit 1'
      : 'RESULT: graders passed the quiz — exit 0',
  );
  return lines.join('\n') + '\n';
}
