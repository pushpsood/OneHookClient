import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  derivePasskeySecret,
  derivePasskeySecretWithId,
  fromBase64Url,
  isPrfSupported,
  toBase64Url,
} from '../lib/passkey-prf';

/**
 * Passkey PRF, the unlock method that needs no other device.
 *
 * The cases that matter are the ones where PRF is NOT available. Coverage excludes Windows 10,
 * Firefox-on-Android and Chrome-profile authenticators, so every "no" path has to be an ordinary,
 * silent fall-through to the next rung of the ladder — never an error, and never a weak key derived
 * from whatever the authenticator happened to return.
 */

if (!globalThis.crypto?.subtle) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

const ORIGINAL_NAVIGATOR = globalThis.navigator;
const ORIGINAL_PKC = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;

/** Minimal stand-in for a PublicKeyCredential assertion. */
function assertion(prfFirst?: Uint8Array, rawId = new Uint8Array([1, 2, 3, 4])) {
  return {
    rawId,
    getClientExtensionResults: () =>
      prfFirst ? { prf: { results: { first: prfFirst } } } : {},
  };
}

function setNavigator(get: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { credentials: { get } },
    configurable: true,
    writable: true,
  });
}

function setCapabilities(capabilities: Record<string, boolean> | Error | undefined) {
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential =
    capabilities === undefined
      ? {}
      : {
          getClientCapabilities: () =>
            capabilities instanceof Error ? Promise.reject(capabilities) : Promise.resolve(capabilities),
        };
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: ORIGINAL_NAVIGATOR,
    configurable: true,
    writable: true,
  });
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = ORIGINAL_PKC;
  vi.restoreAllMocks();
});

describe('isPrfSupported', () => {
  it('reports support when the client advertises extension:prf', async () => {
    setCapabilities({ 'extension:prf': true });
    expect(await isPrfSupported()).toBe(true);
  });

  it('reports no support when the client advertises it as false', async () => {
    setCapabilities({ 'extension:prf': false });
    expect(await isPrfSupported()).toBe(false);
  });

  it('reports no support when the browser cannot be asked', async () => {
    // Rather than optimistically prompting for a biometric that yields nothing usable.
    setCapabilities(undefined);
    expect(await isPrfSupported()).toBe(false);
  });

  it('reports no support when WebAuthn is absent entirely', async () => {
    delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    expect(await isPrfSupported()).toBe(false);
  });

  it('treats a capability query failure as unsupported', async () => {
    setCapabilities(new Error('nope'));
    expect(await isPrfSupported()).toBe(false);
  });
});

describe('derivePasskeySecret', () => {
  const CREDENTIAL_ID = toBase64Url(new Uint8Array([9, 8, 7, 6]));

  it('returns the PRF output for the requested credential', async () => {
    const secret = new Uint8Array(32).fill(7);
    const get = vi.fn().mockResolvedValue(assertion(secret));
    setNavigator(get);

    const result = await derivePasskeySecret(CREDENTIAL_ID);

    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual(Array.from(secret));
  });

  it('targets exactly the requested credential and demands user verification', async () => {
    const get = vi.fn().mockResolvedValue(assertion(new Uint8Array(32).fill(1)));
    setNavigator(get);

    await derivePasskeySecret(CREDENTIAL_ID);

    const options = get.mock.calls[0][0].publicKey;
    expect(options.allowCredentials).toHaveLength(1);
    expect(options.userVerification).toBe('required');
    expect(options.extensions.prf.eval.first).toBeDefined();
  });

  it('returns null when the authenticator ignored the PRF extension', async () => {
    // The documented behaviour on unsupported platforms: fall through, do not throw.
    setNavigator(vi.fn().mockResolvedValue(assertion(undefined)));
    expect(await derivePasskeySecret(CREDENTIAL_ID)).toBeNull();
  });

  it('returns null when the user cancels or no credential matches', async () => {
    setNavigator(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    expect(await derivePasskeySecret(CREDENTIAL_ID)).toBeNull();
  });

  it('refuses output too short to be key material', async () => {
    // Better to fall through than to wrap the history key under a weak derived key.
    setNavigator(vi.fn().mockResolvedValue(assertion(new Uint8Array(16).fill(3))));
    expect(await derivePasskeySecret(CREDENTIAL_ID)).toBeNull();
  });

  it('returns null when WebAuthn is unavailable', async () => {
    setNavigator(undefined);
    expect(await derivePasskeySecret(CREDENTIAL_ID)).toBeNull();
  });
});

describe('derivePasskeySecretWithId', () => {
  it('reports the credential id actually used, so the wrap can be labelled', async () => {
    const rawId = new Uint8Array([5, 6, 7, 8, 9]);
    setNavigator(vi.fn().mockResolvedValue(assertion(new Uint8Array(32).fill(2), rawId)));

    const result = await derivePasskeySecretWithId();

    expect(result).not.toBeNull();
    expect(result!.credentialId).toBe(toBase64Url(rawId));
    expect(result!.secret).toHaveLength(32);
  });

  it('does not constrain which passkey the user picks', async () => {
    // The id is unknown when CREATING a wrap, so the user chooses and we record what they used.
    const get = vi.fn().mockResolvedValue(assertion(new Uint8Array(32).fill(4)));
    setNavigator(get);

    await derivePasskeySecretWithId();

    expect(get.mock.calls[0][0].publicKey.allowCredentials).toBeUndefined();
  });

  it('returns null when PRF produced nothing', async () => {
    setNavigator(vi.fn().mockResolvedValue(assertion(undefined)));
    expect(await derivePasskeySecretWithId()).toBeNull();
  });
});

describe('base64url', () => {
  it('round-trips credential ids without padding or URL-unsafe characters', () => {
    for (const length of [1, 2, 3, 4, 16, 32, 64]) {
      const bytes = webcrypto.getRandomValues(new Uint8Array(length));
      const encoded = toBase64Url(bytes);
      expect(encoded).not.toMatch(/[+/=]/);
      expect(Array.from(fromBase64Url(encoded))).toEqual(Array.from(bytes));
    }
  });
});
