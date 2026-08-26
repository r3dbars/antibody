// @ts-check
// check(trace, fm) → {hit, line, quote, reason} — the one function everything
// else loops over. Two checker types: "rule" (regex, free, deterministic) and
// "judge" (one narrow LLM call per trace, structured output).
//
// Judges are fail-closed: refusal, unparseable output, and network errors
// return `{ hit: null, error }`. Never coerce those into `hit: false` — a
// valid negative is the only path to a clean miss.
import Anthropic from '@anthropic-ai/sdk';
import { PRICES } from './store.js';

/**
 * @typedef {import('./types.js').Trace} Trace
 * @typedef {import('./types.js').FailureMode} FailureMode
 * @typedef {import('./types.js').CheckResult} CheckResult
 */

/** @type {any} */
let _client = null;

/** @returns {any} */
export function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** Inject or clear the Anthropic client (tests). @param {any} next */
export function setClient(next) {
  _client = next;
}

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** @param {Trace} trace */
export function transcript(trace) {
  return trace.messages.map((m, i) => `${i + 1}. [${m.role}] ${m.content}`).join('\n');
}

/**
 * @param {Trace} trace
 * @param {FailureMode} fm
 * @returns {CheckResult}
 */
export function runRule(trace, fm) {
  const pattern = fm.checker?.pattern;
  if (!pattern) {
    return { hit: null, error: 'rule checker is missing a pattern' };
  }
  const re = new RegExp(pattern, fm.checker?.flags ?? 'i');
  for (let i = 0; i < trace.messages.length; i++) {
    const m = trace.messages[i];
    if (fm.checker?.role && m.role !== fm.checker.role) continue;
    const match = re.exec(m.content);
    if (match) {
      return { hit: true, line: i + 1, quote: match[0].slice(0, 200), reason: `matched /${fm.checker?.pattern}/` };
    }
  }
  return { hit: false };
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    hit: { type: 'boolean', description: 'true only if this exact failure mode occurred' },
    line: { type: 'integer', description: 'transcript line number of the failure, or 0 when hit is false' },
    quote: { type: 'string', description: 'short verbatim quote showing the failure, or empty' },
    reason: { type: 'string', description: 'one sentence explaining the verdict' },
  },
  required: ['hit', 'line', 'quote', 'reason'],
  additionalProperties: false,
};

/**
 * @param {Trace} trace
 * @param {FailureMode} fm
 */
export function judgeMessages(trace, fm) {
  const examples = (fm.examples ?? [])
    .filter((e) => e.note)
    .map((e) => `- ${e.note}`)
    .join('\n');
  return [
    {
      role: 'user',
      content:
        `You are a narrow inspector for exactly one known failure mode of an AI agent. ` +
        `Check only for this failure mode — ignore every other kind of problem.\n\n` +
        `Failure mode ${fm.id} (${fm.name}):\n${fm.description}\n\n` +
        (fm.judgePrompt ? `Check: ${fm.judgePrompt}\n\n` : '') +
        (examples ? `Human notes from real occurrences of this failure:\n${examples}\n\n` : '') +
        `Transcript (numbered lines):\n${transcript(trace)}\n\n` +
        `Did failure mode ${fm.name} occur in this transcript? Be strict: report a hit only ` +
        `when the transcript clearly shows this specific failure.`,
    },
  ];
}

/**
 * @param {Trace} trace
 * @param {FailureMode} fm
 * @param {{models: {judge: string}}} config
 * @param {{calls: number, usd: number} | null} [usage]
 * @returns {Promise<CheckResult>}
 */
export async function runJudge(trace, fm, config, usage) {
  const model = fm.checker?.model ?? config.models.judge;
  /** @type {any} */
  let response;
  try {
    response = await client().messages.create({
      model,
      max_tokens: 1024,
      messages: judgeMessages(trace, fm),
      output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { hit: null, error: `judge request failed: ${message}` };
  }
  if (usage) {
    usage.calls += 1;
    const catalog = /** @type {Record<string, {input: number, output: number}>} */ (PRICES);
    const price = catalog[model] ?? catalog['claude-haiku-4-5'];
    const u = response.usage ?? {};
    const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    usage.usd += (inputTokens * price.input + (u.output_tokens ?? 0) * price.output) / 1e6;
  }
  if (response.stop_reason === 'refusal') {
    return { hit: null, error: 'judge request was declined by safety classifiers' };
  }
  const text = Array.isArray(response.content) ? (response.content.find((/** @type {any} */ b) => b.type === 'text')?.text ?? '') : '';
  try {
    const v = JSON.parse(text);
    if (typeof v?.hit !== 'boolean') {
      return { hit: null, error: 'judge verdict is missing a boolean hit' };
    }
    return { hit: v.hit, line: v.line || 0, quote: v.quote || '', reason: v.reason || '' };
  } catch {
    return { hit: null, error: `judge returned unparseable output: ${text.slice(0, 120)}` };
  }
}

/**
 * @param {Trace} trace
 * @param {FailureMode} fm
 * @param {{models: {judge: string}}} [config]
 * @param {{calls: number, usd: number} | null} [usage]
 * @returns {Promise<CheckResult>}
 */
export async function check(trace, fm, config, usage) {
  if (fm.checker?.type === 'rule') return runRule(trace, fm);
  if (fm.checker?.type === 'judge') return runJudge(trace, fm, config ?? { models: { judge: 'claude-haiku-4-5' } }, usage);
  throw new Error(`${fm.id}: unknown checker type "${fm.checker?.type}" (expected "rule" or "judge")`);
}

// Minimal concurrency pool — run tasks() with at most `limit` in flight.
/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function pool(items, limit, worker) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
