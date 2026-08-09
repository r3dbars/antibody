#!/usr/bin/env node
// antibody — an immune system for your AI agent.
// Seven commands, plain files, no daemon. `antibody help` for usage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWorkspace, saveTrace, appendVerdict, ROOT_DIR } from './store.js';
import { tracesFromFile } from './normalize.js';
import { scan, renderScanReport } from './scan.js';
import { calibrate, renderCalibration } from './calibrate.js';
import { distill, renderDistill } from './distill.js';
import { startServer } from './serve.js';

const HELP = `antibody — an immune system for your AI agent
Flag a failure once. Catch it forever.

usage: antibody <command> [args]

  demo                       watch antibody catch a mistake in sample traces
                             (throwaway folder, no API key, nothing to clean up)
  init                       create .antibody/ (config, registry, verdicts, scans)
  import <files...>          normalize + fingerprint traces into the workspace
  review [--port N]          open the human review queue on localhost
  verdict <trace> <bad|ok>   record a verdict from the terminal or an agent
          [--note "..."] [--fm FM-001]
  distill                    draft failure modes from unprocessed flags (LLM)
  scan [files...] [--json]   check traces against every active failure mode;
       [--only FM] [--sample N]   exit 1 if a "watching" mode has hits
  calibrate [--fm FM] [--write]   judge-vs-human agreement, TPR/TNR, suggestions

Every command accepts --json for agent/script consumption.
Docs and file formats: spec/ in the antibody repository.`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args.flags[key] = next;
        i++;
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function expandFiles(paths) {
  const files = [];
  for (const p of paths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) {
        if (f.endsWith('.json') || f.endsWith('.jsonl')) files.push(path.join(p, f));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function importTraces(paths) {
  const files = expandFiles(paths);
  let added = 0;
  let seen = 0;
  const ids = [];
  for (const file of files) {
    for (const trace of tracesFromFile(file)) {
      saveTrace(trace) ? added++ : seen++;
      ids.push(trace.id);
    }
  }
  return { files: files.length, added, seen, ids };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const asJson = Boolean(args.flags.json);

  switch (cmd) {
    case 'demo': {
      // The whole loop in one command: throwaway workspace, bundled sample
      // traces, one real catch. FM-001 is a rule checker, so no API key.
      const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibody-demo-'));
      process.chdir(dir);
      initWorkspace();
      const imported = importTraces([path.join(pkgRoot, 'examples', 'traces')]);
      const registrySrc = path.join(pkgRoot, 'examples', 'registry');
      const fms = fs.readdirSync(registrySrc).sort();
      for (const f of fms) fs.copyFileSync(path.join(registrySrc, f), path.join(ROOT_DIR, 'registry', f));
      const summary = await scan({});
      process.exitCode = summary.exitCode;
      if (asJson) return console.log(JSON.stringify({ playground: dir, ...summary }));
      console.log('antibody demo — sample conversations from a fictional support agent,');
      console.log('scanned against a registry of two flagged failure modes\n');
      console.log(`  ✓ imported ${imported.added} sample conversations`);
      console.log(`  ✓ loaded ${fms.length} failure modes (playground: ${dir})\n`);
      console.log(renderScanReport(summary));
      console.log('\nThat exit 1 is the point: once a mistake is flagged, its return blocks the');
      console.log('build. Try it on your own agent:\n');
      console.log('  cd your-agent-project && npx antibody init');
      return;
    }
    case 'init': {
      const created = initWorkspace();
      if (asJson) return console.log(JSON.stringify({ created }));
      if (!created.length) return console.log(`${ROOT_DIR}/ already initialized`);
      console.log(`initialized ${ROOT_DIR}/\n` + created.map((c) => `  + ${c}`).join('\n'));
      console.log('\nnext: antibody import <your trace files>');
      return;
    }
    case 'import': {
      if (args.flags.annotations) {
        // interop: error-discovery-skill annotations.json → verdicts
        const raw = JSON.parse(fs.readFileSync(args.flags.annotations, 'utf8'));
        const items = Array.isArray(raw) ? raw : raw.annotations ?? [];
        let n = 0;
        for (const a of items) {
          const trace = a.trace ?? a.trace_id ?? a.id;
          if (!/^tr-[0-9a-f]{12}$/.test(trace ?? '')) continue;
          appendVerdict({ trace, verdict: a.verdict ?? (a.label === 'ok' ? 'ok' : 'bad'), note: a.note ?? a.annotation ?? '' });
          n++;
        }
        return console.log(asJson ? JSON.stringify({ imported: n }) : `imported ${n} annotations as verdicts`);
      }
      if (!args._.length) throw new Error('usage: antibody import <files or directories...>');
      const r = importTraces(args._);
      if (asJson) return console.log(JSON.stringify(r));
      return console.log(`✓ ${r.added} new trace${r.added === 1 ? '' : 's'} imported${r.seen ? `, ${r.seen} already known` : ''} (${r.files} file${r.files === 1 ? '' : 's'})`);
    }
    case 'review': {
      const port = Number(args.flags.port ?? 4400);
      await startServer({ port });
      console.log(`review queue: http://localhost:${port}`);
      console.log('keys: f flag · o looks fine · n note · j/k next/prev · ctrl-c to stop');
      return new Promise(() => {}); // stay alive until interrupted
    }
    case 'verdict': {
      const [trace, verdict] = args._;
      if (!trace || !['bad', 'ok'].includes(verdict)) throw new Error('usage: antibody verdict <trace-id> <bad|ok> [--note "..."] [--fm FM-001]');
      const record = appendVerdict({ trace, verdict, note: args.flags.note ?? '', fm: args.flags.fm ?? null });
      return console.log(asJson ? JSON.stringify(record) : `recorded: ${record.trace} ${record.verdict}${record.note ? ` — ${record.note}` : ''} (by ${record.by})`);
    }
    case 'distill': {
      const result = await distill();
      return console.log(asJson ? JSON.stringify(result) : renderDistill(result));
    }
    case 'scan': {
      let traceIds = null;
      if (args._.length) traceIds = importTraces(args._).ids;
      const summary = await scan({
        traceIds,
        only: args.flags.only ?? null,
        sample: args.flags.sample ? Number(args.flags.sample) : null,
      });
      console.log(asJson ? JSON.stringify(summary) : renderScanReport(summary));
      process.exitCode = summary.exitCode;
      return;
    }
    case 'calibrate': {
      const rows = await calibrate({ only: args.flags.fm ?? null, write: Boolean(args.flags.write) });
      return console.log(asJson ? JSON.stringify(rows) : renderCalibration(rows, Boolean(args.flags.write)));
    }
    case 'version': {
      const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
      return console.log(pkg.version);
    }
    case 'help':
    case undefined:
      return console.log(HELP);
    default:
      throw new Error(`unknown command "${cmd}" — antibody help`);
  }
}

main().catch((err) => {
  console.error(`antibody: ${err.message ?? err}`);
  process.exit(2);
});
