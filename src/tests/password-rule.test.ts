import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { passwordError, PASSWORD_MIN_LENGTH } from '../lib/account-setup';

/**
 * The user pool requires 12+ characters with a symbol (OneHookBackend infra/stacks/shared-stack.ts
 * `passwordPolicy`). `passwordError` in lib/account-setup.ts is the one copy of that rule; a screen
 * with its own weaker check (the sign-in "set password" form once accepted 8 characters) lets a member
 * submit a password Cognito then rejects.
 */
const ROOT = new URL('../', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('password rule', () => {
  it('matches the user pool: 12+ characters with a symbol', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordError('short!', 'short!')).not.toBeNull();
    expect(passwordError('twelvechars1', 'twelvechars1')).not.toBeNull();
    expect(passwordError('twelve-chars', 'twelve-chars')).toBeNull();
  });

  it('is checked only by lib/account-setup.ts (no screen has its own length check)', () => {
    const offenders = sources(ROOT)
      .filter((file) => !file.endsWith('lib/account-setup.ts'))
      .filter((file) => /\b(password|newPassword)\.length\s*[<>]=?\s*\d/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
