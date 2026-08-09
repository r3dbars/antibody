// check(trace, fm) → {hit, line, quote, reason} — the one function everything
// else loops over. Two checker types: "rule" (regex, free, deterministic) and
// "judge" (one narrow LLM call per trace, structured output).
import Anthropic from '@anthropic-ai/sdk';
import { PRICES } from './store.js';

let _client = null;
export function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function transcript(trace) {
  return trace.messages.map((m, i) => `${i + 1}. [${m.role}] ${m.content}`).join('\n');
}

export function runRule(trace, fm) {
  const re = new RegExp(fm.checker.pattern, fm.checker.flags ?? 'i');
  for (let i = 0; i < trace.messages.length; i++) {
    const m = trace.messages[i];
    if (fm.checker.role && m.role !== fm.checker.role) continue;
    const match = re.exec(m.content);
    if (match) {
      return { hit: true, line: i + 1, quote: match[0].slice(0, 200), reason: `matched /${fm.checker.pattern}/` };
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

export async function runJudge(trace, fm, config, usage) {
  const model = fm.checker.model ?? config.models.judge;
  const response = await client().messages.create({
    model,
    max_tokens: 1024,
    messages: judgeMessages(trace, fm),
    output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
  });
  if (usage) {
    usage.calls += 1;
    const price = PRICES[model] ?? PRICES['claude-haiku-4-5'];
    const u = response.usage;
    const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    usage.usd += (inputTokens * price.input + (u.output_tokens ?? 0) * price.output) / 1e6;
  }
  if (response.stop_reason === 'refusal') {
    return { hit: false, error: 'judge request was declined by safety classifiers' };
  }
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  try {
    const v = JSON.parse(text);
    return { hit: Boolean(v.hit), line: v.line || 0, quote: v.quote || '', reason: v.reason || '' };
  } catch {
    return { hit: false, error: `judge returned unparseable output: ${text.slice(0, 120)}` };
  }
}

export async function check(trace, fm, config, usage) {
  if (fm.checker?.type === 'rule') return runRule(trace, fm);
  if (fm.checker?.type === 'judge') return runJudge(trace, fm, config, usage);
  throw new Error(`${fm.id}: unknown checker type "${fm.checker?.type}" (expected "rule" or "judge")`);
}

// Minimal concurrency pool — run tasks() with at most `limit` in flight.
export async function pool(items, limit, worker) {
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
