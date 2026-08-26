// @ts-nocheck
// Workspace layout and file access. Files are truth; there is no database.
// Everything lives under .antibody/ in the working directory:
//   config.json            committed   provider + model defaults
//   registry/FM-*.md       committed   failure modes (frontmatter + markdown body)
//   verdicts/<name>.jsonl  committed   append-only, one file per reviewer
//   suggestions.jsonl      committed   agent proposals awaiting human ruling
//   scans/<ts>.json        committed   hit-count summaries for trends
//   traces/tr-*.json       gitignored  normalized trace snapshots
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

export const ROOT_DIR = '.antibody';

export function root(cwd = process.cwd()) {
  return path.join(cwd, ROOT_DIR);
}

export function assertWorkspace(cwd = process.cwd()) {
  if (!fs.existsSync(root(cwd))) {
    throw new Error(`no ${ROOT_DIR}/ found in ${cwd} — run \`antibody init\` first`);
  }
  return root(cwd);
}

const DEFAULT_CONFIG = {
  models: {
    judge: 'claude-haiku-4-5',
    distill: 'claude-opus-5',
  },
  scan: { concurrency: 8 },
};

// USD per million tokens, used only for the cost line in reports.
export const PRICES = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
};

export function initWorkspace(cwd = process.cwd()) {
  const r = root(cwd);
  const created = [];
  for (const dir of ['', 'registry', 'verdicts', 'scans', 'traces', 'quizzes', 'suites', 'runs']) {
    const p = path.join(r, dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created.push(path.join(ROOT_DIR, dir) || ROOT_DIR);
    }
  }
  const configPath = path.join(r, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    created.push(path.join(ROOT_DIR, 'config.json'));
  }
  ensurePrivatePathsIgnored(r, created);
  return created;
}

function ensurePrivatePathsIgnored(workspaceRoot, created = null) {
  const gitignore = path.join(workspaceRoot, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, 'traces/\nruns/\n');
    created?.push(path.join(ROOT_DIR, '.gitignore'));
  } else {
    const contents = fs.readFileSync(gitignore, 'utf8');
    const ignored = contents.split('\n').filter(Boolean);
    const missing = ['traces/', 'runs/'].filter((entry) => !ignored.includes(entry));
    if (missing.length) fs.appendFileSync(gitignore, `${contents.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`);
  }
}

export function saveQuizRun(summary, cwd = process.cwd()) {
  const workspaceRoot = assertWorkspace(cwd);
  ensurePrivatePathsIgnored(workspaceRoot);
  const dir = path.join(workspaceRoot, 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const name = summary.at.replace(/[:.]/g, '-') + '.json';
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2) + '\n');
  return path.join(ROOT_DIR, 'runs', name);
}

export function loadConfig(cwd = process.cwd()) {
  const p = path.join(assertWorkspace(cwd), 'config.json');
  return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
}

// ---------- traces ----------

export function saveTrace(trace, cwd = process.cwd()) {
  const p = path.join(assertWorkspace(cwd), 'traces', `${trace.id}.json`);
  const existed = fs.existsSync(p);
  fs.writeFileSync(p, JSON.stringify(trace, null, 2) + '\n');
  return !existed;
}

export function listTraceIds(cwd = process.cwd()) {
  const dir = path.join(assertWorkspace(cwd), 'traces');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function loadTrace(id, cwd = process.cwd()) {
  const p = path.join(assertWorkspace(cwd), 'traces', `${id}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ---------- registry (failure modes) ----------

// FM files are Markdown with YAML frontmatter. The body carries two sections:
// "## Description" (human + judge context) and "## Judge prompt" (the check).
export function parseFm(text, file = '') {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing YAML frontmatter`);
  const fm = YAML.parse(m[1]) ?? {};
  fm.body = m[2].trim();
  const sections = {};
  for (const part of fm.body.split(/^## +/m).slice(1)) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    sections[heading] = nl === -1 ? '' : part.slice(nl + 1).trim();
  }
  fm.description = sections['description'] ?? '';
  fm.judgePrompt = sections['judge prompt'] ?? '';
  fm.file = file;
  return fm;
}

export function serializeFm(fm) {
  const front = {
    id: fm.id,
    name: fm.name,
    status: fm.status,
    discovered: fm.discovered,
    discovered_by: fm.discovered_by,
    examples: fm.examples ?? [],
    checker: fm.checker,
    calibration: fm.calibration ?? { agreement: null, tpr: null, tnr: null, n_labels: 0 },
  };
  let body = `## Description\n\n${fm.description.trim()}\n`;
  if (fm.checker?.type === 'judge') {
    body += `\n## Judge prompt\n\n${(fm.judgePrompt ?? '').trim()}\n`;
  }
  return `---\n${YAML.stringify(front).trimEnd()}\n---\n\n${body}`;
}

export function listFms(cwd = process.cwd()) {
  const dir = path.join(assertWorkspace(cwd), 'registry');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseFm(fs.readFileSync(path.join(dir, f), 'utf8'), f));
}

export function saveFm(fm, cwd = process.cwd()) {
  const file = fm.file || `${fm.id}-${fm.name}.md`;
  const p = path.join(assertWorkspace(cwd), 'registry', file);
  fs.writeFileSync(p, serializeFm(fm));
  return path.join(ROOT_DIR, 'registry', file);
}

export function nextFmId(fms) {
  const max = fms
    .map((f) => Number((f.id ?? '').replace('FM-', '')))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `FM-${String(max + 1).padStart(3, '0')}`;
}

// ---------- verdicts ----------

export function reviewerName(cwd = process.cwd()) {
  if (process.env.ANTIBODY_REVIEWER) return slug(process.env.ANTIBODY_REVIEWER);
  try {
    const name = execFileSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' }).trim();
    if (name) return slug(name);
  } catch {
    // not a git repo or git absent — fall through
  }
  return slug(process.env.USER || process.env.USERNAME || 'reviewer');
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reviewer';
}

export function appendVerdict(verdict, cwd = process.cwd()) {
  const by = verdict.by || reviewerName(cwd);
  const record = {
    trace: verdict.trace,
    verdict: verdict.verdict, // "bad" | "ok"
    note: verdict.note ?? '',
    fm: verdict.fm ?? null, // set when confirming/rejecting a known FM
    by,
    at: verdict.at ?? new Date().toISOString(),
  };
  const p = path.join(assertWorkspace(cwd), 'verdicts', `${by}.jsonl`);
  fs.appendFileSync(p, JSON.stringify(record) + '\n');
  return record;
}

export function loadVerdicts(cwd = process.cwd()) {
  const dir = path.join(assertWorkspace(cwd), 'verdicts');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // skip corrupt lines rather than failing the whole load
      }
    }
  }
  return out;
}

// Latest human verdict per (trace, fm) — later lines win within a reviewer,
// and cross-reviewer conflicts surface as disagreement, resolved by recency.
export function latestVerdicts(verdicts) {
  const byKey = new Map();
  for (const v of verdicts) {
    const key = `${v.trace} ${v.fm ?? ''}`;
    const prev = byKey.get(key);
    if (!prev || (v.at ?? '') >= (prev.at ?? '')) byKey.set(key, v);
  }
  return [...byKey.values()];
}

// ---------- suggestions (agents propose a label; a human resolves it) ----------

// One append-only file, suggestions.jsonl. Agents (or `antibody scan`, for
// calibrating checkers) append proposals {trace, fm, reason, by}; the review
// UI appends resolutions {trace, fm, resolved: accepted|dismissed, by}. A
// proposal with no later resolution is pending. Accepting one also records a
// normal human verdict tagged with the FM — exactly the labeled data
// calibration needs. Suggestions are never ground truth; verdicts are.
export function appendSuggestion(s, cwd = process.cwd()) {
  const record = {
    trace: s.trace,
    fm: s.fm,
    ...(s.resolved ? { resolved: s.resolved } : { reason: s.reason ?? '' }),
    by: s.by || reviewerName(cwd),
    at: s.at ?? new Date().toISOString(),
  };
  fs.appendFileSync(path.join(assertWorkspace(cwd), 'suggestions.jsonl'), JSON.stringify(record) + '\n');
  return record;
}

export function loadSuggestions(cwd = process.cwd()) {
  const p = path.join(assertWorkspace(cwd), 'suggestions.jsonl');
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip corrupt lines rather than failing the whole load
    }
  }
  return out;
}

export function pendingSuggestions(cwd = process.cwd()) {
  const byKey = new Map();
  for (const s of loadSuggestions(cwd)) {
    const key = `${s.trace} ${s.fm}`;
    if (s.resolved) byKey.delete(key);
    else if (!byKey.has(key)) byKey.set(key, s);
  }
  return [...byKey.values()];
}

// ---------- scans ----------

export function saveScan(summary, cwd = process.cwd()) {
  const name = summary.at.replace(/[:.]/g, '-') + '.json';
  const p = path.join(assertWorkspace(cwd), 'scans', name);
  fs.writeFileSync(p, JSON.stringify(summary, null, 2) + '\n');
  return path.join(ROOT_DIR, 'scans', name);
}

export function loadPreviousScan(cwd = process.cwd()) {
  const dir = path.join(assertWorkspace(cwd), 'scans');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
}
