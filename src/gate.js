// @ts-nocheck
import fs from 'node:fs';

function escapeAnnotation(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export function renderGateSummary(summary) {
  const lines = [
    '## Antibody gate',
    '',
    `**${summary.passed}/${summary.quizzes} blocking quizzes passed**`,
    '',
    '| Quiz | Outcome |',
    '|---|---|',
  ];
  for (const result of summary.results) lines.push(`| ${result.id} — ${result.name} | ${result.outcome} |`);
  if (summary.errors) lines.push('', '> Unable to evaluate is a blocking result, not a pass.');
  return lines.join('\n') + '\n';
}

export function emitCiReport(summary) {
  for (const result of summary.results.filter((item) => item.outcome !== 'pass')) {
    const message = result.error || `${result.name} failed its behavioral contract`;
    console.log(`::error title=${escapeAnnotation(`Antibody ${result.id}`)}::${escapeAnnotation(message)}`);
  }
  const markdown = renderGateSummary(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  return markdown;
}
