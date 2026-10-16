#!/usr/bin/env node
/**
 * Telemetry contract gate for the web build (wired as npm `prebuild*` hooks; also run by CI).
 *
 *  1. Prints TELEMETRY_CONTRACT.txt (backend-owned, synced by OneHookBackend `npm run telemetry:sync`).
 *  2. Verifies the generated catalog was not hand-edited (integrity stamp written by the backend).
 *  3. Runs the telemetry coverage / guard / SDK tests: every press is tracked, every id is a backend id.
 * Any failure exits non-zero and stops the build. `--banner-only` just prints the contract (dev server).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(root, 'src/lib/analytics/generated/telemetryCatalog.ts');
const MARKER = '// telemetry-integrity: sha256 ';
const RED = '\x1b[1;31m';
const YELLOW = '\x1b[1;33m';
const RESET = '\x1b[0m';

function fail(msg) {
  console.error(`\n${RED}[telemetry-contract] BUILD BLOCKED: ${msg}${RESET}\n`);
  process.exit(1);
}

let contract;
try {
  contract = readFileSync(join(root, 'TELEMETRY_CONTRACT.txt'), 'utf8');
} catch {
  fail('TELEMETRY_CONTRACT.txt is missing. Restore it with (OneHookBackend) npm run telemetry:sync.');
}
console.log(`${YELLOW}${contract}${RESET}`);
// Make sure the pre-push hook is active on this machine (no-op in CI / non-git checkouts).
spawnSync(process.execPath, [join(root, 'scripts/install-git-hooks.mjs')], { stdio: 'inherit' });
if (process.argv.includes('--banner-only')) process.exit(0);

// 2. Backend-controlled ids: the generated catalog must be byte-for-byte what the backend produced.
const text = readFileSync(CATALOG, 'utf8');
const lines = text.split('\n');
const stampLine = lines.find((l) => l.startsWith(MARKER));
if (!stampLine) fail(`${CATALOG} has no integrity stamp. Regenerate it from the backend; never edit it.`);
const body = lines.filter((l) => l !== stampLine).join('\n');
const actual = createHash('sha256').update(body, 'utf8').digest('hex');
if (actual !== stampLine.slice(MARKER.length).trim()) {
  fail(
    `${CATALOG} was modified by hand. UI element ids are controlled by the backend:\n` +
      '  edit OneHookBackend/packages/telemetry/src/catalog.ts, then npm run telemetry:generate && npm run telemetry:sync'
  );
}
console.log('[telemetry-contract] generated catalog integrity: OK');

// 3. Every press tracked, only catalog ids, parity scope respected.
const tests = ['telemetry-coverage', 'telemetry-guard', 'telemetry-sdk', 'telemetry-standard'].map((t) => `src/tests/${t}.test.ts`);
const r = spawnSync('npx', ['vitest', 'run', ...tests], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0) {
  fail('telemetry coverage/guard tests failed: a press is not reported, or an id is not from the backend catalog. See output above.');
}
console.log('[telemetry-contract] every interaction is reported with a backend-controlled id: OK\n');
