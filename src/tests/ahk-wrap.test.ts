import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  unwrapWithDeviceKey,
  unwrapWithSecret,
  wrapToDeviceKey,
  wrapToSecret,
  type WrapContext,
} from '../lib/ahk-wrap';

/**
 * Wrapping the account-history private key.
 *
 * These run the REAL primitives — Node exposes the same Web Crypto API the browser does, so ECDH,
 * HKDF and AES-GCM are exercised rather than mocked.
 *
 * The cases that matter are the negative ones. Every wrap binds its slot identity (userId, epoch,
 * method, wrapId) into the AEAD, so a wrap cannot be replayed into a different slot. Without that, a
 * server able to reorder or relabel rows could hand a client the wrong wrap and have it succeed.
 */

if (!globalThis.crypto?.subtle) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

const HISTORY_KEY = new Uint8Array(64).map((_, i) => (i * 7 + 3) & 0xff);

function context(overrides: Partial<WrapContext> = {}): WrapContext {
  return { userId: 'user-1', epoch: 1, method: 'DEVICE', wrapId: 'device-1', ...overrides };
}

async function deviceKeyPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
    'deriveKey',
  ])) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  let binary = '';
  for (const byte of new Uint8Array(spki)) binary += String.fromCharCode(byte);
  return { pair, spki: btoa(binary) };
}

describe('device-key wraps', () => {
  it('round-trips the history key through a device public key', async () => {
    const { pair, spki } = await deviceKeyPair();

    const envelope = await wrapToDeviceKey(HISTORY_KEY, spki, context());
    const opened = await unwrapWithDeviceKey(envelope, pair.privateKey, context());

    expect(Array.from(opened)).toEqual(Array.from(HISTORY_KEY));
  });

  it('needs only the target public key to seal, never its private half', async () => {
    // This is what lets one device grant another access without the two ever sharing a secret.
    const { pair, spki } = await deviceKeyPair();
    const envelope = await wrapToDeviceKey(HISTORY_KEY, spki, context());
    expect(envelope.length).toBeGreaterThan(0);
    await expect(unwrapWithDeviceKey(envelope, pair.privateKey, context())).resolves.toBeDefined();
  });

  it('cannot be opened by a different device', async () => {
    const target = await deviceKeyPair();
    const attacker = await deviceKeyPair();

    const envelope = await wrapToDeviceKey(HISTORY_KEY, target.spki, context());

    await expect(unwrapWithDeviceKey(envelope, attacker.pair.privateKey, context())).rejects.toThrow();
  });

  it.each([
    ['a different epoch', { epoch: 2 }],
    ['a different wrapId', { wrapId: 'device-2' }],
    ['a different user', { userId: 'user-2' }],
  ])('refuses a wrap replayed into %s', async (_label, overrides) => {
    const { pair, spki } = await deviceKeyPair();
    const envelope = await wrapToDeviceKey(HISTORY_KEY, spki, context());

    await expect(
      unwrapWithDeviceKey(envelope, pair.privateKey, context(overrides))
    ).rejects.toThrow();
  });

  it('rejects a symmetric envelope presented as a device wrap', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const envelope = await wrapToSecret(HISTORY_KEY, secret, context({ method: 'PRF' }));
    const { pair } = await deviceKeyPair();

    await expect(
      unwrapWithDeviceKey(envelope, pair.privateKey, context({ method: 'PRF' }))
    ).rejects.toThrow(/not sealed to a device key/i);
  });

  it('refuses to build a device wrap from a PRF context', async () => {
    const { spki } = await deviceKeyPair();
    await expect(wrapToDeviceKey(HISTORY_KEY, spki, context({ method: 'PRF' }))).rejects.toThrow(
      /DEVICE wrap context/i
    );
  });
});

describe('secret (PRF) wraps', () => {
  const prfContext = () => context({ method: 'PRF', wrapId: 'credential-1' });

  it('round-trips the history key through reproducible secret material', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));

    const envelope = await wrapToSecret(HISTORY_KEY, secret, prfContext());
    const opened = await unwrapWithSecret(envelope, secret, prfContext());

    expect(Array.from(opened)).toEqual(Array.from(HISTORY_KEY));
  });

  it('opens with the same secret derived again, which is what makes a new device work alone', async () => {
    // A passkey returns the same PRF output for the same salt, so a fresh device reproduces the key
    // with no other device online. Simulated here by re-using the identical bytes.
    const secret = new Uint8Array(32).fill(9);
    const envelope = await wrapToSecret(HISTORY_KEY, secret, prfContext());
    const opened = await unwrapWithSecret(envelope, new Uint8Array(32).fill(9), prfContext());

    expect(Array.from(opened)).toEqual(Array.from(HISTORY_KEY));
  });

  it('cannot be opened with different secret material', async () => {
    const envelope = await wrapToSecret(HISTORY_KEY, new Uint8Array(32).fill(1), prfContext());

    await expect(
      unwrapWithSecret(envelope, new Uint8Array(32).fill(2), prfContext())
    ).rejects.toThrow();
  });

  it('refuses secret material too short to be plausible', async () => {
    // A short secret would make an offline attack on a leaked wrap cheap.
    await expect(
      wrapToSecret(HISTORY_KEY, new Uint8Array(8), prfContext())
    ).rejects.toThrow(/too short/i);
  });

  it('refuses a wrap replayed into a different slot', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const envelope = await wrapToSecret(HISTORY_KEY, secret, prfContext());

    await expect(
      unwrapWithSecret(envelope, secret, context({ method: 'PRF', wrapId: 'credential-2' }))
    ).rejects.toThrow();
  });

  it('rejects a device envelope presented as a secret wrap', async () => {
    const { spki } = await deviceKeyPair();
    const envelope = await wrapToDeviceKey(HISTORY_KEY, spki, context());

    await expect(
      unwrapWithSecret(envelope, new Uint8Array(32).fill(3), context())
    ).rejects.toThrow(/expects a device key/i);
  });
});

describe('envelope validation', () => {
  it('rejects malformed and truncated envelopes rather than guessing', async () => {
    const secret = new Uint8Array(32).fill(4);
    for (const bad of ['', 'AAAA', btoa('short')]) {
      await expect(unwrapWithSecret(bad, secret, context({ method: 'PRF' }))).rejects.toThrow();
    }
  });

  it('rejects an unknown version byte', async () => {
    const raw = new Uint8Array(1 + 2 + 12 + 16);
    raw[0] = 0x7f;
    let binary = '';
    for (const byte of raw) binary += String.fromCharCode(byte);

    await expect(
      unwrapWithSecret(btoa(binary), new Uint8Array(32).fill(5), context({ method: 'PRF' }))
    ).rejects.toThrow(/version/i);
  });

  it('requires a usable slot identity', async () => {
    const secret = new Uint8Array(32).fill(6);
    await expect(wrapToSecret(HISTORY_KEY, secret, context({ userId: '' }))).rejects.toThrow(/userId/i);
    await expect(wrapToSecret(HISTORY_KEY, secret, context({ epoch: 0 }))).rejects.toThrow(/epoch/i);
    await expect(wrapToSecret(HISTORY_KEY, secret, context({ wrapId: '' }))).rejects.toThrow(/wrapId/i);
  });
});
