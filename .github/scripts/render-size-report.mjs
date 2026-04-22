#!/usr/bin/env node
/**
 * Renders a markdown table from `size-limit --json` output, suitable for
 * posting as a sticky PR comment via `marocchino/sticky-pull-request-comment`.
 *
 * Usage: node .github/scripts/render-size-report.mjs <path-to-size-report.json>
 *
 * Reads stdin if no path is supplied. Always exits 0 — the gate itself is the
 * non-zero exit from `pnpm size` in the previous step. This script only
 * renders; it does not enforce.
 */
import { readFileSync } from 'node:fs';
import process, { argv } from 'node:process';

const path = argv[2];
const raw = path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');

/** @type {Array<{name: string, passed: boolean, size: number, sizeLimit: number}>} */
const entries = JSON.parse(raw);

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} kB`;
}

/** @param {number} size @param {number} limit */
function pct(size, limit) {
  if (!limit) return '—';
  return `${((size / limit) * 100).toFixed(1)}%`;
}

const allPass = entries.every((e) => e.passed);
const heading = allPass
  ? '## size-limit report — all budgets green'
  : '## size-limit report — BUDGET EXCEEDED';

const rows = entries.map((e) => {
  const status = e.passed ? 'pass' : 'FAIL';
  return `| ${e.name} | ${formatBytes(e.size)} | ${formatBytes(e.sizeLimit)} | ${pct(e.size, e.sizeLimit)} | ${status} |`;
});

const table = [
  '| entry | size (gzip) | budget | used | status |',
  '| --- | ---: | ---: | ---: | :---: |',
  ...rows,
].join('\n');

process.stdout.write(`${heading}\n\n${table}\n`);
