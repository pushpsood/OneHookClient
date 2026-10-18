import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_TIERS } from 'onehook-api-client/membership';

/**
 * Single source of truth for membership tiers.
 *
 * Tier wire values, display names (Must / Super / Infinity) and connection ceilings are owned by the
 * backend Smithy model and consumed ONLY from onehook-api-client. This guard fails the build if web
 * code re-declares a tier (as a string literal, an enum, or a union type).
 */

const SRC = join(__dirname, '..');

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!['tests', 'generated', 'node_modules'].includes(name)) walk(p);
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(p);
    }
  }
})(SRC);

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('membership — onehook-api-client is the only source of tier names', () => {
  it('scans the web sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no source spells a tier wire value or display name as a string literal', () => {
    const names = SUBSCRIPTION_TIERS.flatMap((t) => [t.wire, t.displayName]);
    const literal = new RegExp(`(["'\`])(${names.join('|')})\\1`, 'g');
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(literal)) {
        offenders.push(`${relative(SRC, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no source declares its own tier enum / union type', () => {
    const decl = /\b(enum\s+\w*Tier\w*|type\s+\w*Tier\w*\s*=\s*['"|])/;
    const offenders = files.filter((f) => decl.test(stripComments(readFileSync(f, 'utf8')))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('SubscriptionTier is only ever imported from onehook-api-client', () => {
    const offenders = files
      .filter((f) => /import[^;]*\bSubscriptionTier\b[^;]*from\s+['"](?!onehook-api-client['"]|(?:\.\.?\/)+types['"])/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

});
