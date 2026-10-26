/**
 * Canonical evidence-bundle encoder — golden-vector parity (OneHook moderation Phase 2).
 *
 * The web encoder MUST reproduce the portal reference's `canonical`, `canonicalBytesHex`,
 * `sha256Hex` and `sha256Base64` byte-for-byte for every contract fixture, or the SHA-256 the
 * client declares at presign won't match what the server and admin viewer recompute.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalString,
  canonicalByteLength,
  canonicalBytes,
  bundleSha256Hex,
  bundleSha256Base64,
  hexToBase64,
  escapeCanonicalString,
  type BundleInput,
} from '../features/moderation/report/evidence-bundle';

const FIXTURE_DIR = new URL('./fixtures/moderation/', import.meta.url).pathname;

interface Fixture {
  input: BundleInput;
  canonical: string;
  canonicalByteLength: number;
  canonicalBytesHex: string;
  sha256Hex: string;
  sha256Base64: string;
}

function loadFixtures(): { name: string; fx: Fixture }[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.startsWith('bundle-') && f.endsWith('.json'))
    .sort()
    .map((name) => ({ name, fx: JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as Fixture }));
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

describe('canonical evidence bundle — golden fixtures', () => {
  const fixtures = loadFixtures();

  it('finds all four contract fixtures', () => {
    expect(fixtures.map((f) => f.name)).toEqual([
      'bundle-basic.json',
      'bundle-empty.json',
      'bundle-escaping.json',
      'bundle-tiebreak-media.json',
    ]);
  });

  for (const { name, fx } of fixtures) {
    describe(name, () => {
      it('reproduces the canonical string', () => {
        expect(canonicalString(fx.input)).toBe(fx.canonical);
      });
      it('reproduces the canonical byte length', () => {
        expect(canonicalByteLength(fx.input)).toBe(fx.canonicalByteLength);
      });
      it('reproduces the canonical bytes (hex)', () => {
        expect(toHex(canonicalBytes(fx.input))).toBe(fx.canonicalBytesHex);
      });
      it('reproduces sha256Hex', async () => {
        expect(await bundleSha256Hex(fx.input)).toBe(fx.sha256Hex);
      });
      it('reproduces sha256Base64', async () => {
        expect(await bundleSha256Base64(fx.input)).toBe(fx.sha256Base64);
      });
      it('hexToBase64(sha256Hex) === sha256Base64', () => {
        expect(hexToBase64(fx.sha256Hex)).toBe(fx.sha256Base64);
      });
    });
  }
});

describe('canonical string escaping', () => {
  it('escapes only " and \\\\ and control chars; leaves /, DEL and non-ASCII raw', () => {
    expect(escapeCanonicalString('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(escapeCanonicalString('tab\tnl\ncr\rbs\bff\f')).toBe('"tab\\tnl\\ncr\\rbs\\bff\\f"');
    expect(escapeCanonicalString('\u0000\u001f')).toBe('"\\u0000\\u001f"');
    // slash, DEL (0x7f) and non-ASCII are NOT escaped
    expect(escapeCanonicalString('/\u007f😀café')).toBe('"/\u007f😀café"');
  });
});
