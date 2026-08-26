// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { assertWorkspace } from './store.js';

export function loadProduct(cwd = process.cwd()) {
  const file = path.join(assertWorkspace(cwd), 'product.yml');
  if (!fs.existsSync(file)) {
    throw new Error(`no .antibody/product.yml found — run \`antibody quiz new\` after configuring a product adapter`);
  }
  const product = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  if (product.schema !== 'antibody.product.v1') throw new Error(`${file}: schema must be antibody.product.v1`);
  if (!product.runner?.command || typeof product.runner.command !== 'string') {
    throw new Error(`${file}: runner.command must be a command string`);
  }
  const timeout = Number(product.runner.timeout_ms ?? 5000);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error(`${file}: runner.timeout_ms must be a positive number`);
  product.runner.timeout_ms = timeout;
  product.file = file;
  return product;
}

export function runProduct(product, quiz, cwd = process.cwd()) {
  const payload = JSON.stringify({ case_id: quiz.id, input: quiz.input ?? {} }) + '\n';
  let stdout;
  try {
    stdout = execFileSync('/bin/sh', ['-c', product.runner.command], {
      cwd,
      input: payload,
      encoding: 'utf8',
      timeout: product.runner.timeout_ms,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const timedOut = err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM';
    return {
      ok: false,
      infrastructure: true,
      error: timedOut
        ? `runner timed out after ${product.runner.timeout_ms} ms`
        : `runner exited ${err.status ?? 'without a result'}${err.stderr ? `: ${String(err.stderr).trim()}` : ''}`,
    };
  }

  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    return { ok: false, infrastructure: true, error: 'runner stdout was not one JSON result' };
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, infrastructure: true, error: 'runner result must be a JSON object' };
  }
  if (result.status !== 'ok') {
    return { ok: false, infrastructure: true, error: result.error || `runner returned status ${String(result.status)}` };
  }
  return { ok: true, result };
}
