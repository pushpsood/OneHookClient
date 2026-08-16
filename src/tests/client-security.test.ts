import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ChatEncryptionManager } from '../lib/chat-encryption';

/**
 * Guard rails for the shipped client.
 *
 * These lock in two properties that were previously violated:
 *  1. No branch may fake security — no placeholder crypto, no always-true auth check, no code path
 *     that returns unprotected content as if it had been encrypted or verified.
 *  2. No secret material (auth sessions, tokens, passwords, OTPs) may be written to the console.
 *
 * The source scan deliberately walks the runtime tree only; `src/tests` is never bundled.
 */

const SRC_ROOT = new URL('../', import.meta.url).pathname;

function runtimeSourceFiles(dir = SRC_ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return path.endsWith('/tests') ? [] : runtimeSourceFiles(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const sources = runtimeSourceFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('client security guard rails', () => {
  it('ships no runtime source files outside the expected tree', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it('contains no placeholder cryptography', () => {
    for (const { path, text } of sources) {
      expect(text, `${path} must not base64-encode a message and call it ciphertext`).not.toMatch(
        /btoa\(`enc\(/
      );
      expect(text, `${path} must not derive key material from Math.random`).not.toMatch(
        /(pub|priv)_\$\{|Math\.random\(\)\.toString\(36\)/
      );
      expect(text, `${path} must not persist private keys in web storage`).not.toMatch(
        /localStorage\.setItem\(\s*`?e2e_priv/
      );
    }
  });

  it('contains no always-true authentication or entitlement checks', () => {
    for (const { path, text } of sources) {
      expect(text, `${path} must not short-circuit a boolean check to true`).not.toMatch(
        /(isAuthenticated|isVerified|isPremium|hasAccess)\s*\([^)]*\)\s*:\s*boolean\s*\{\s*return true;/
      );
    }
  });

  it('never logs auth sessions, tokens, passwords or OTPs', () => {
    for (const { path, text } of sources) {
      expect(text, `${path} must not log secret material`).not.toMatch(
        /console\.(log|info|debug)\([^)]*\b(session|idToken|accessToken|refreshToken|password|otp)\b/i
      );
    }
  });

  it('carries no mock, simulated or dev-only runtime branches', () => {
    for (const { path, text } of sources) {
      expect(text, `${path} must not reference a mock or simulated mode`).not.toMatch(
        /\b(mock mode|is mocked|mocked but|simulated so|useMockApi)\b/i
      );
    }
  });
});

describe('ChatEncryptionManager', () => {
  it('requires a user id', () => {
    expect(() => new ChatEncryptionManager('')).toThrow(/userId is required/i);
  });

  it('fails loudly instead of returning plaintext when no key store is available', async () => {
    // Node has Web Crypto but no IndexedDB, so the identity key cannot be persisted. The manager
    // must reject rather than fall back to an unencrypted payload.
    const manager = new ChatEncryptionManager('user-1');
    await expect(manager.encryptMessage('peer-1', 'match-1', 'hello')).rejects.toThrow();
  });

  it('rejects a malformed or wrong-version envelope', async () => {
    const manager = new ChatEncryptionManager('user-1');
    await expect(manager.decryptMessage('peer-1', 'match-1', btoa('short'))).rejects.toThrow(
      /malformed/i
    );
    const wrongVersion = new Uint8Array(1 + 12 + 4);
    wrongVersion[0] = 99;
    await expect(
      manager.decryptMessage('peer-1', 'match-1', Buffer.from(wrongVersion).toString('base64'))
    ).rejects.toThrow(/Unsupported message encryption version/i);
  });

  it('requires a peer and a match to derive a conversation key', async () => {
    const manager = new ChatEncryptionManager('user-1');
    await expect(manager.encryptMessage('', 'match-1', 'hello')).rejects.toThrow(/peer id/i);
    await expect(manager.encryptMessage('peer-1', '', 'hello')).rejects.toThrow(/matchId/i);
  });
});
