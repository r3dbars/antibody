// @ts-nocheck
// antibody distill — turn unattributed "bad" verdicts into proposed failure
// modes. This is agent-shaped work; the shipped skills prefer doing it in your
// coding agent. This command is the agentless fallback: one LLM call, drafts
// written with status "proposed", human approves via git diff (D4, D6).
import Anthropic from '@anthropic-ai/sdk';
import { listFms, loadTrace, loadConfig, loadVerdicts, latestVerdicts, saveFm, nextFmId, reviewerName } from './store.js';
import { transcript, hasApiKey } from './check.js';

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    failure_modes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'kebab-case name that states the mistake so plainly a stranger gets it without context — describe the observable behavior (invents-dates-not-in-sources, replies-instead-of-continuing), never theory jargon (role-confusion, context-leakage)' },
          description: { type: 'string', description: '1-3 sentences defining exactly when this failure occurs' },
          judge_prompt: { type: 'string', description: 'one precise yes/no question a narrow inspector should answer about a transcript' },
          example_traces: { type: 'array', items: { type: 'string' }, description: 'trace ids from the input that show this failure' },
        },
        required: ['name', 'description', 'judge_prompt', 'example_traces'],
        additionalProperties: false,
      },
    },
  },
  required: ['failure_modes'],
  additionalProperties: false,
};

export function unprocessedFlags(cwd = process.cwd()) {
  const fms = listFms(cwd);
  const covered = new Set(fms.flatMap((f) => (f.examples ?? []).map((e) => e.trace)));
  return latestVerdicts(loadVerdicts(cwd)).filter(
    (v) => v.verdict === 'bad' && v.fm == null && !covered.has(v.trace),
  );
}

export async function distill({ cwd = process.cwd() } = {}) {
  const flags = unprocessedFlags(cwd);
  if (!flags.length) return { proposed: [], note: 'no unprocessed flags — review some traces first (antibody review)' };
  if (!hasApiKey()) throw new Error('distill needs ANTHROPIC_API_KEY (or run the antibody-review skill in your coding agent instead)');

  const config = loadConfig(cwd);
  const excerpts = flags
    .map((v) => {
      let t;
      try {
        t = loadTrace(v.trace, cwd);
      } catch {
        return null;
      }
      const text = transcript(t);
      return `### ${v.trace}\nReviewer note: ${v.note || '(none)'}\n${text.length > 4000 ? text.slice(0, 4000) + '\n…(truncated)' : text}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const client = new Anthropic();
  const response = await client.messages.create({
    model: config.models.distill,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content:
          `A human reviewed AI-agent conversations and flagged these as bad, with free-text notes. ` +
          `Group the flags into distinct, narrowly-defined failure modes (axial coding). ` +
          `Fewer, sharper modes beat many vague ones; merge notes describing the same underlying failure. ` +
          `Each judge_prompt must be answerable yes/no from a transcript alone.\n\n${excerpts}`,
      },
    ],
    output_config: { format: { type: 'json_schema', schema: PROPOSAL_SCHEMA } },
  });
  if (response.stop_reason === 'refusal') throw new Error('distill request was declined by safety classifiers');
  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  const proposals = JSON.parse(text).failure_modes ?? [];

  const noteByTrace = new Map(flags.map((v) => [v.trace, v.note]));
  const existing = listFms(cwd);
  const by = reviewerName(cwd);
  const written = [];
  for (const p of proposals) {
    const fm = {
      id: nextFmId(existing.concat(written)),
      name: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      status: 'proposed',
      discovered: new Date().toISOString().slice(0, 10),
      discovered_by: by,
      examples: p.example_traces.map((t) => ({ trace: t, note: noteByTrace.get(t) ?? '' })),
      checker: { type: 'judge', model: config.models.judge },
      calibration: { agreement: null, tpr: null, tnr: null, n_labels: 0 },
      description: p.description,
      judgePrompt: p.judge_prompt,
    };
    fm.path = saveFm(fm, cwd);
    written.push(fm);
  }
  return { proposed: written.map((f) => ({ id: f.id, name: f.name, path: f.path, examples: f.examples.length })) };
}

export function renderDistill(result) {
  if (result.note) return result.note + '\n';
  const lines = [`Proposed ${result.proposed.length} failure mode${result.proposed.length === 1 ? '' : 's'} (status: proposed — they never gate until promoted):`];
  for (const p of result.proposed) lines.push(`- ${p.id} ${p.name} (${p.examples} example${p.examples === 1 ? '' : 's'}) → ${p.path}`);
  lines.push('', 'Review the drafts, edit freely, set status to "calibrating" to start scanning them, then commit.');
  return lines.join('\n') + '\n';
}
