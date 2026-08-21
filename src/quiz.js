import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertWorkspace, loadTrace, ROOT_DIR } from './store.js';
import { loadProduct, runProduct } from './product.js';

export const QUIZ_STATUSES = ['draft', 'proving', 'blocking', 'retired'];
export const GRADERS = [
  'equals', 'not_equals', 'starts_with', 'includes', 'includes_any',
  'includes_all', 'excludes', 'matches_regex', 'json_schema', 'path_exists',
  'count_equals', 'count_lte', 'number_lte', 'number_gte', 'maximum_words',
  'expected_silence', 'expected_output',
];

export function parseQuiz(text, file = '') {
  let quiz;
  try {
    quiz = YAML.parse(text);
  } catch (err) {
    throw new Error(`${file}: invalid YAML: ${err.message}`);
  }
  quiz = quiz ?? {};
  quiz.file = file;
  return quiz;
}

export function validateQuiz(quiz) {
  const errors = [];
  const label = quiz.file || quiz.id || 'quiz';
  if (quiz.schema !== 'antibody.quiz.v1') errors.push(`${label}: schema must be antibody.quiz.v1`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(quiz.id ?? '')) errors.push(`${label}: id is required and must be file-safe`);
  if (!quiz.name || typeof quiz.name !== 'string') errors.push(`${label}: name is required`);
  if (!QUIZ_STATUSES.includes(quiz.status)) errors.push(`${label}: status must be ${QUIZ_STATUSES.join(', ')}`);
  if (!quiz.input || typeof quiz.input !== 'object' || Array.isArray(quiz.input)) errors.push(`${label}: input must be an object`);
  if (!Array.isArray(quiz.expect) || !quiz.expect.length) errors.push(`${label}: expect must contain at least one assertion`);
  for (const [index, assertion] of (quiz.expect ?? []).entries()) {
    if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
      errors.push(`${label}: expect[${index}] must be an object`);
      continue;
    }
    if (typeof assertion.path !== 'string') errors.push(`${label}: expect[${index}].path is required`);
    const graders = GRADERS.filter((key) => Object.hasOwn(assertion, key));
    if (graders.length !== 1) errors.push(`${label}: expect[${index}] must use exactly one supported grader`);
    if (graders[0] === 'matches_regex') {
      try { new RegExp(assertion.matches_regex); } catch { errors.push(`${label}: expect[${index}].matches_regex is invalid`); }
    }
  }
  return errors;
}

export function listQuizzes(cwd = process.cwd()) {
  const dir = path.join(assertWorkspace(cwd), 'quizzes');
  if (!fs.existsSync(dir)) return [];
  const quizzes = fs.readdirSync(dir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()
    .map((file) => parseQuiz(fs.readFileSync(path.join(dir, file), 'utf8'), path.join(ROOT_DIR, 'quizzes', file)));
  const seen = new Set();
  for (const quiz of quizzes) {
    if (seen.has(quiz.id)) throw new Error(`duplicate quiz id ${quiz.id}`);
    seen.add(quiz.id);
  }
  return quizzes;
}

function getPath(value, dottedPath) {
  if (dottedPath === '' || dottedPath == null) return { exists: true, value };
  let cursor = value;
  for (const part of dottedPath.split('.')) {
    if (cursor == null || !Object.hasOwn(Object(cursor), part)) return { exists: false, value: undefined };
    cursor = cursor[part];
  }
  return { exists: true, value: cursor };
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function textIncludes(actual, expected) {
  return String(actual).toLocaleLowerCase().includes(String(expected).toLocaleLowerCase());
}

function count(actual) {
  if (Array.isArray(actual) || typeof actual === 'string') return actual.length;
  if (actual && typeof actual === 'object') return Object.keys(actual).length;
  return NaN;
}

function matchesSchema(value, schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) return false;
  if (schema.type) {
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (type !== schema.type) return false;
  }
  if (schema.required && (!value || typeof value !== 'object' || schema.required.some((key) => !Object.hasOwn(value, key)))) return false;
  if (schema.properties && value && typeof value === 'object') {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key) && !matchesSchema(value[key], child)) return false;
    }
  }
  return true;
}

function isSilence(value) {
  return value == null || value === '' || value === false || ['silence', 'none', 'hide'].includes(String(value).toLowerCase());
}

export function gradeAssertion(envelope, assertion) {
  const resolved = getPath(envelope, assertion.path);
  const grader = GRADERS.find((key) => Object.hasOwn(assertion, key));
  const expected = assertion[grader];
  const actual = resolved.value;
  let passed = false;

  if (grader === 'path_exists') passed = resolved.exists === Boolean(expected);
  else if (!resolved.exists) passed = false;
  else if (grader === 'equals') passed = deepEqual(actual, expected);
  else if (grader === 'not_equals') passed = !deepEqual(actual, expected);
  else if (grader === 'starts_with') passed = String(actual).toLocaleLowerCase().startsWith(String(expected).toLocaleLowerCase());
  else if (grader === 'includes') passed = textIncludes(actual, expected);
  else if (grader === 'includes_any') passed = expected.some((item) => textIncludes(actual, item));
  else if (grader === 'includes_all') passed = expected.every((item) => textIncludes(actual, item));
  else if (grader === 'excludes') passed = (Array.isArray(expected) ? expected : [expected]).every((item) => !textIncludes(actual, item));
  else if (grader === 'matches_regex') passed = new RegExp(expected).test(String(actual));
  else if (grader === 'json_schema') passed = matchesSchema(actual, expected);
  else if (grader === 'count_equals') passed = count(actual) === Number(expected);
  else if (grader === 'count_lte') passed = count(actual) <= Number(expected);
  else if (grader === 'number_lte') passed = typeof actual === 'number' && actual <= Number(expected);
  else if (grader === 'number_gte') passed = typeof actual === 'number' && actual >= Number(expected);
  else if (grader === 'maximum_words') passed = typeof actual === 'string' && actual.trim().split(/\s+/).filter(Boolean).length <= Number(expected);
  else if (grader === 'expected_silence') passed = Boolean(expected) === isSilence(actual);
  else if (grader === 'expected_output') passed = Boolean(expected) === !isSilence(actual);

  return { path: assertion.path, grader, expected, actual, passed };
}

function suiteIds(name, product, cwd) {
  const suiteFile = product.suites?.[name];
  if (!suiteFile) return null;
  const absolute = path.resolve(cwd, suiteFile);
  if (!fs.existsSync(absolute)) throw new Error(`suite ${name} points to missing file ${suiteFile}`);
  const suite = YAML.parse(fs.readFileSync(absolute, 'utf8')) ?? {};
  if (suite.schema !== 'antibody.suite.v1' || !Array.isArray(suite.quizzes)) {
    throw new Error(`${suiteFile}: expected antibody.suite.v1 with a quizzes list`);
  }
  return new Set(suite.quizzes);
}

export function selectQuizzes(quizzes, { only = null, suite = null, statuses = null, product = null, cwd = process.cwd() } = {}) {
  let selected = quizzes.filter((quiz) => quiz.status !== 'retired');
  if (only) selected = selected.filter((quiz) => quiz.id === only || quiz.failure_mode === only);
  if (statuses) selected = selected.filter((quiz) => statuses.includes(quiz.status));
  if (suite) {
    const ids = product ? suiteIds(suite, product, cwd) : null;
    selected = selected.filter((quiz) => ids ? ids.has(quiz.id) : quiz.suite === suite);
  }
  return selected;
}

export function runQuizzes({ only = null, suite = null, statuses = null, cwd = process.cwd() } = {}) {
  const product = loadProduct(cwd);
  const quizzes = listQuizzes(cwd);
  const validation = quizzes.flatMap((quiz) => validateQuiz(quiz));
  if (validation.length) throw new Error(validation.join('\n'));
  const selected = selectQuizzes(quizzes, { only, suite, statuses, product, cwd });
  const results = [];
  for (const quiz of selected) {
    const run = runProduct(product, quiz, cwd);
    if (!run.ok) {
      results.push({ id: quiz.id, name: quiz.name, status: quiz.status, outcome: 'error', error: run.error });
      continue;
    }
    const assertions = quiz.expect.map((assertion) => gradeAssertion(run.result, assertion));
    results.push({
      id: quiz.id,
      name: quiz.name,
      status: quiz.status,
      outcome: assertions.every((assertion) => assertion.passed) ? 'pass' : 'fail',
      assertions,
      metrics: run.result.metrics ?? {},
    });
  }
  const summary = {
    at: new Date().toISOString(),
    product: product.name,
    quizzes: selected.length,
    passed: results.filter((item) => item.outcome === 'pass').length,
    failed: results.filter((item) => item.outcome === 'fail').length,
    errors: results.filter((item) => item.outcome === 'error').length,
    results,
  };
  summary.exitCode = summary.errors ? 2 : summary.failed ? 1 : 0;
  return summary;
}

export function renderQuizReport(summary) {
  const lines = [`antibody test — ${summary.product}`, ''];
  for (const result of summary.results) {
    const mark = result.outcome === 'pass' ? '✓' : result.outcome === 'fail' ? '✗' : '!';
    lines.push(`  ${mark} ${result.id} ${result.name} — ${result.outcome}`);
    if (result.error) lines.push(`      ${result.error}`);
    for (const assertion of result.assertions?.filter((item) => !item.passed) ?? []) {
      lines.push(`      ${assertion.path} ${assertion.grader} ${JSON.stringify(assertion.expected)} (got ${JSON.stringify(assertion.actual)})`);
    }
  }
  lines.push('', `${summary.passed}/${summary.quizzes} passed · ${summary.failed} failed · ${summary.errors} unable to evaluate`);
  return lines.join('\n');
}

export function createQuiz({ fm, from = null, name = null }, cwd = process.cwd()) {
  if (!/^FM-\d+$/.test(fm ?? '')) throw new Error('--fm expects an id like FM-001');
  const quizzes = listQuizzes(cwd);
  const next = quizzes
    .map((quiz) => quiz.id.match(new RegExp(`^${fm.replace('-', '\\-')}\\.(\\d+)$`)))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  const id = `${fm}.${String(next).padStart(3, '0')}`;
  if (from) loadTrace(from, cwd); // validate that the local evidence exists
  const quiz = {
    schema: 'antibody.quiz.v1',
    id,
    failure_mode: fm,
    name: name || 'describe-observable-behavior',
    status: 'draft',
    input: { synthetic_fixture: 'replace with a synthetic or approved input' },
    expect: [{ path: 'result', expected_output: true }],
    ...(from ? { source: { trace: from, note: 'local evidence only; raw trace not copied' } } : {}),
  };
  const dir = path.join(assertWorkspace(cwd), 'quizzes');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}-${quiz.name}.yml`);
  fs.writeFileSync(file, YAML.stringify(quiz));
  return { id, file: path.relative(cwd, file) };
}
