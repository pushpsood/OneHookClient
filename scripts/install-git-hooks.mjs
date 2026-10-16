#!/usr/bin/env node
/**
 * Activates .githooks (telemetry-contract pre-push) for this checkout: `git config core.hooksPath .githooks`.
 * Runs from `npm install` (prepare) and from the build gate. No-op outside a git checkout (CI tarballs,
 * CodeBuild) and when another hooks path is already configured (warns instead of overriding it).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
try {
  const root = git('rev-parse', '--show-toplevel');
  if (!existsSync(join(root, '.githooks', 'pre-push'))) process.exit(0);
  let current = '';
  try {
    current = git('-C', root, 'config', '--get', 'core.hooksPath');
  } catch {
    /* unset */
  }
  if (!current) {
    git('-C', root, 'config', 'core.hooksPath', '.githooks');
    console.log('[telemetry-contract] installed git pre-push hook (core.hooksPath=.githooks)');
  } else if (current !== '.githooks') {
    console.warn(`[telemetry-contract] core.hooksPath is '${current}'; the telemetry pre-push hook in .githooks is NOT active.`);
  }
} catch {
  // not a git checkout: nothing to install
}
