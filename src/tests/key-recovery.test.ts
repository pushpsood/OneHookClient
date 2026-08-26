import { describe, expect, it } from 'vitest';
import {
  RECOVERY_PROTOCOL_VERSION,
  assertBundleMatchesRegistry,
  base45Decode,
  base45Encode,
  derivePublicKeySpki,
  deriveVerificationCode,
  fingerprintPublicKey,
  generateChallenge,
  generateEphemeralKeyPair,
  openRecoveryBundle,
  sealRecoveryBundle,
  toBase64,
  type RecoveryBundle,
  type RecoverySessionBinding,
} from '../lib/key-recovery';

/**
 * History-key recovery crypto guard rails.
 *
 * Node ships Web Crypto with P-256 ECDH, AES-GCM and HKDF, so these run the real primitives — no
 * mocks. The module is pure (it takes CryptoKeys and plain data), so nothing here needs IndexedDB,
 * a camera or a network.
 *
 * What matters most is the NEGATIVE space: every one of the bindings the protocol claims to enforce
 * (session, device pair, expiry, sender authenticity) is asserted to actually break decryption when
 * violated. A transfer that "mostly works" would silently install the wrong key.
 */

async function deviceKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveKey',
    'deriveBits',
  ]) as Promise<CryptoKeyPair>;
}

async function exportSpki(key: CryptoKey): Promise<string> {
  return toBase64(await globalThis.crypto.subtle.exportKey('spki', key));
}

/** A history/identity private key as PKCS#8 — what actually travels in the bundle. */
async function extractablePkcs8(): Promise<Uint8Array> {
  const pair = (await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )) as CryptoKeyPair;
  return new Uint8Array(await globalThis.crypto.subtle.exportKey('pkcs8', pair.privateKey));
}

async function scenario() {
  const source = await deviceKeyPair();
  const target = await generateEphemeralKeyPair();
  const sourcePublicKey = await exportSpki(source.publicKey);
  // The target's LONG-TERM registered device key. The transfer is bound to it, which is what makes a
  // swapped ephemeral key fail cryptographically rather than only via the human code.
  const targetDevice = await deviceKeyPair();
  const targetDevicePublicKey = await exportSpki(targetDevice.publicKey);

  const binding: RecoverySessionBinding = {
    sessionId: 'session-1',
    challenge: generateChallenge(),
    expiresAt: 1_000_000,
    sourceFingerprint: await fingerprintPublicKey(sourcePublicKey),
    targetFingerprint: await fingerprintPublicKey(targetDevicePublicKey),
  };

  const bundle: RecoveryBundle = {
    historyKeyId: 'history-key-42',
    historyPrivateKey: await extractablePkcs8(),
  };

  const now = 500_000;

  /** Seals with the scenario's honest parameters, allowing targeted overrides. */
  const seal = (overrides: Record<string, unknown> = {}) =>
    sealRecoveryBundle({
      bundle,
      binding,
      sourceDevicePrivateKey: source.privateKey,
      targetEphemeralPublicKeySpki: target.publicKeySpki,
      targetDevicePublicKeySpki: targetDevicePublicKey,
      now,
      ...overrides,
    } as Parameters<typeof sealRecoveryBundle>[0]);

  /** Opens with the scenario's honest parameters, allowing targeted overrides. */
  const open = (scanned: string, overrides: Record<string, unknown> = {}) =>
    openRecoveryBundle({
      scanned,
      binding,
      targetEphemeralPrivateKey: target.privateKey,
      targetDevicePrivateKey: targetDevice.privateKey,
      sourceDevicePublicKeySpki: sourcePublicKey,
      now,
      ...overrides,
    } as Parameters<typeof openRecoveryBundle>[0]);

  return {
    source,
    target,
    targetDevice,
    sourcePublicKey,
    targetDevicePublicKey,
    binding,
    bundle,
    now,
    seal,
    open,
  };
}

describe('base45', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(257));
    expect(base45Decode(base45Encode(bytes))).toEqual(bytes);
  });

  it('emits only QR alphanumeric-mode characters, which is what keeps the code scannable', () => {
    const encoded = base45Encode(globalThis.crypto.getRandomValues(new Uint8Array(200)));
    expect(encoded).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
  });

  it('costs fewer QR bits than base64 — more characters, but a smaller code', () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(400));
    // QR alphanumeric mode packs 2 characters into 11 bits (5.5 bits each); byte mode spends a full
    // 8 bits per character. Base45 emits MORE characters than Base64 yet needs fewer QR modules,
    // which is the property that matters for scannability.
    const base45Bits = Math.ceil(base45Encode(bytes).length * 5.5);
    const base64ByteModeBits = toBase64(bytes).length * 8;
    expect(base45Bits).toBeLessThan(base64ByteModeBits);
  });

  it('rejects foreign characters and truncated input rather than returning junk', () => {
    expect(() => base45Decode('abc')).toThrow(/not a OneHook recovery code/i);
    expect(() => base45Decode('0000')).toThrow(/truncated/i);
  });
});

describe('derivePublicKeySpki (registry verification of a transferred key)', () => {
  it('recovers the exact public key of the private key that was transferred', async () => {
    const pair = (await globalThis.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    )) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(
      await globalThis.crypto.subtle.exportKey('pkcs8', pair.privateKey)
    );

    // This equality is what the receiving device asserts against the account-history key published in
    // its own registry before it stores anything.
    expect(await derivePublicKeySpki(pkcs8)).toBe(await exportSpki(pair.publicKey));
  });

  it('yields a different public key for a different private key, so a wrong key is detected', async () => {
    const a = await extractablePkcs8();
    const b = await extractablePkcs8();
    expect(await derivePublicKeySpki(a)).not.toBe(await derivePublicKeySpki(b));
  });

  it('rejects bytes that are not a P-256 private key', async () => {
    await expect(derivePublicKeySpki(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe('assertBundleMatchesRegistry (fails closed before anything is stored)', () => {
  async function pair() {
    const keys = (await globalThis.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    )) as CryptoKeyPair;
    return {
      pkcs8: new Uint8Array(await globalThis.crypto.subtle.exportKey('pkcs8', keys.privateKey)),
      spki: await exportSpki(keys.publicKey),
    };
  }

  it('accepts a bundle whose key id and derived public key both match the registry', async () => {
    const key = await pair();
    await expect(
      assertBundleMatchesRegistry(
        { historyKeyId: 'k1', historyPrivateKey: key.pkcs8 },
        { keyId: 'k1', publicKey: key.spki }
      )
    ).resolves.toBeUndefined();
  });

  it('rejects a bundle for a different key id', async () => {
    const key = await pair();
    await expect(
      assertBundleMatchesRegistry(
        { historyKeyId: 'k1', historyPrivateKey: key.pkcs8 },
        { keyId: 'k2', publicKey: key.spki }
      )
    ).rejects.toThrow(/different history key/i);
  });

  it('rejects a private key that is not the account’s history key, even with the right id', async () => {
    // The case a compromised backend would try: hand over a key it controls under the real key id.
    const real = await pair();
    const impostor = await pair();
    await expect(
      assertBundleMatchesRegistry(
        { historyKeyId: 'k1', historyPrivateKey: impostor.pkcs8 },
        { keyId: 'k1', publicKey: real.spki }
      )
    ).rejects.toThrow(/does not match your account/i);
  });

  it('rejects an empty bundle and a registry with no history key', async () => {
    const key = await pair();
    await expect(
      assertBundleMatchesRegistry(
        { historyKeyId: '', historyPrivateKey: new Uint8Array() },
        { keyId: 'k1', publicKey: key.spki }
      )
    ).rejects.toThrow(/did not contain a history key/i);
    await expect(
      assertBundleMatchesRegistry(
        { historyKeyId: 'k1', historyPrivateKey: key.pkcs8 },
        undefined
      )
    ).rejects.toThrow(/no history key registered/i);
  });
});

describe('verification code', () => {  it('is six digits and stable for the same session', async () => {
    const { binding, target } = await scenario();
    const first = await deriveVerificationCode(binding, target.publicKeySpki);
    const second = await deriveVerificationCode(binding, target.publicKeySpki);
    expect(first).toMatch(/^\d{6}$/);
    expect(second).toBe(first);
  });

  it('changes when the ephemeral key is swapped — the whole point of showing it to the user', async () => {
    const { binding, target } = await scenario();
    const attacker = await generateEphemeralKeyPair();
    const honest = await deriveVerificationCode(binding, target.publicKeySpki);
    const tampered = await deriveVerificationCode(binding, attacker.publicKeySpki);
    expect(tampered).not.toBe(honest);
  });

  it('changes when the session or either device changes', async () => {
    const { binding, target } = await scenario();
    const base = await deriveVerificationCode(binding, target.publicKeySpki);
    await expect(
      deriveVerificationCode({ ...binding, sessionId: 'other' }, target.publicKeySpki)
    ).resolves.not.toBe(base);
    await expect(
      deriveVerificationCode({ ...binding, sourceFingerprint: 'ff' }, target.publicKeySpki)
    ).resolves.not.toBe(base);
    await expect(
      deriveVerificationCode({ ...binding, targetFingerprint: 'ff' }, target.publicKeySpki)
    ).resolves.not.toBe(base);
  });
});

describe('sealRecoveryBundle / openRecoveryBundle', () => {
  it('round-trips the history key', async () => {
    const { seal, open, bundle } = await scenario();
    const opened = await open(await seal());

    expect(opened.historyKeyId).toBe(bundle.historyKeyId);
    expect(opened.historyPrivateKey).toEqual(bundle.historyPrivateKey);
  });

  it('produces a magic-prefixed, versioned envelope in QR alphanumeric characters', async () => {
    const { seal } = await scenario();
    const sealed = await seal();

    expect(sealed).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
    const raw = base45Decode(sealed);
    expect(Array.from(raw.subarray(0, 3))).toEqual([0x4f, 0x48, 0x52]);
    expect(raw[3]).toBe(RECOVERY_PROTOCOL_VERSION);
  });

  it('is fresh per call: two seals of the same bundle differ (new ephemeral key and nonce)', async () => {
    const { seal } = await scenario();
    expect(await seal()).not.toBe(await seal());
  });

  it('stays scannable: a realistic payload fits well inside QR capacity', async () => {
    const { seal } = await scenario();
    // QR version 20-M holds 1249 alphanumeric characters; anything under ~900 acquires quickly on an
    // ordinary phone camera. This is the guard against the payload quietly growing until it does not.
    expect((await seal()).length).toBeLessThan(900);
  });

  it('refuses to seal without the history key', async () => {
    const { seal } = await scenario();
    await expect(
      seal({
        bundle: { historyKeyId: '', historyPrivateKey: new Uint8Array() },
      })
    ).rejects.toThrow(/does not hold the history key/i);
  });

  it('refuses to seal without the receiving device’s registered key', async () => {
    const { seal } = await scenario();
    await expect(seal({ targetDevicePublicKeySpki: '' })).rejects.toThrow(
      /registered key is required/i
    );
  });

  it('refuses to seal or open an expired session', async () => {
    const { seal, open, binding } = await scenario();
    await expect(seal({ now: binding.expiresAt + 1 })).rejects.toThrow(/expired/i);
    await expect(open(await seal(), { now: binding.expiresAt + 1 })).rejects.toThrow(/expired/i);
  });

  it('rejects a code minted for a DIFFERENT session (anti-replay)', async () => {
    const { seal, open, binding } = await scenario();
    const sealed = await seal();

    for (const mutated of [
      { ...binding, sessionId: 'session-2' },
      { ...binding, challenge: generateChallenge() },
      { ...binding, expiresAt: binding.expiresAt + 1 },
      { ...binding, sourceFingerprint: 'deadbeef' },
      { ...binding, targetFingerprint: 'deadbeef' },
    ]) {
      await expect(open(sealed, { binding: mutated })).rejects.toThrow(/could not be verified/i);
    }
  });

  it('rejects a code sealed by a device other than the one the user picked', async () => {
    const { open, seal } = await scenario();
    const impostor = await deviceKeyPair();
    const sealed = await seal({ sourceDevicePrivateKey: impostor.privateKey });

    // The target authenticates against the public key it read from its OWN registry.
    await expect(open(sealed)).rejects.toThrow(/could not be verified/i);
  });

  it('is useless to anyone but the intended device — a photographed code cannot be opened', async () => {
    const { seal, open } = await scenario();
    const eavesdropper = await generateEphemeralKeyPair();
    await expect(
      open(await seal(), { targetEphemeralPrivateKey: eavesdropper.privateKey })
    ).rejects.toThrow(/could not be verified/i);
  });

  it('defeats a swapped ephemeral key WITHOUT relying on the user checking the code', async () => {
    // The scenario a malicious backend would attempt: replace the ephemeral public key in the request
    // with one it controls, then photograph the QR. Because the transfer is ALSO bound to the target's
    // REGISTERED device key — whose private half never leaves that device — the attacker cannot derive
    // the transfer key even holding the ephemeral private key and the code.
    const { seal, binding, sourcePublicKey, targetDevicePublicKey, now } = await scenario();
    const attacker = await generateEphemeralKeyPair();
    const attackerDevice = await deviceKeyPair();

    const sealed = await seal({
      targetEphemeralPublicKeySpki: attacker.publicKeySpki,
      targetDevicePublicKeySpki: targetDevicePublicKey,
    });

    await expect(
      openRecoveryBundle({
        scanned: sealed,
        binding,
        targetEphemeralPrivateKey: attacker.privateKey,
        // The attacker has no access to the target's registered device private key.
        targetDevicePrivateKey: attackerDevice.privateKey,
        sourceDevicePublicKeySpki: sourcePublicKey,
        now,
      })
    ).rejects.toThrow(/could not be verified/i);
  });

  it('rejects a code opened with the wrong registered device key', async () => {
    const { seal, open } = await scenario();
    const otherDevice = await deviceKeyPair();
    await expect(
      open(await seal(), { targetDevicePrivateKey: otherDevice.privateKey })
    ).rejects.toThrow(/could not be verified/i);
  });

  it('rejects a tampered envelope byte for byte', async () => {
    const { seal, open } = await scenario();
    const raw = base45Decode(await seal());
    raw[raw.length - 1] ^= 0xff;
    await expect(open(base45Encode(raw))).rejects.toThrow(/could not be verified/i);
  });

  it('rejects a non-OneHook QR code and an unknown protocol version distinctly', async () => {
    const { seal, open } = await scenario();

    await expect(
      open(base45Encode(globalThis.crypto.getRandomValues(new Uint8Array(120))))
    ).rejects.toThrow(/not a OneHook recovery code/i);

    const sealed = base45Decode(await seal());
    sealed[3] = 0x09;
    await expect(open(base45Encode(sealed))).rejects.toThrow(/version 9/i);
  });

  it('requires a complete session binding', async () => {
    const { seal, binding } = await scenario();
    await expect(seal({ binding: { ...binding, sessionId: '' } })).rejects.toThrow(
      /sessionId is required/i
    );
    await expect(
      seal({ binding: { ...binding, challenge: toBase64(new Uint8Array(8)) } })
    ).rejects.toThrow(/wrong size/i);
    await expect(seal({ binding: { ...binding, targetFingerprint: '' } })).rejects.toThrow(
      /fingerprints are required/i
    );
  });

  it('transfers a history key that still derives the same shared secret as the original', async () => {
    // The point of the whole feature: the imported key must be usable, not merely well-formed.
    const { seal, open } = await scenario();
    const original = (await globalThis.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    )) as CryptoKeyPair;
    const peer = await deviceKeyPair();

    const expected = new Uint8Array(
      await globalThis.crypto.subtle.deriveBits(
        { name: 'ECDH', public: peer.publicKey },
        original.privateKey,
        256
      )
    );

    const opened = await open(
      await seal({
        bundle: {
          historyKeyId: 'k',
          historyPrivateKey: new Uint8Array(
            await globalThis.crypto.subtle.exportKey('pkcs8', original.privateKey)
          ),
        },
      })
    );

    const reimported = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      opened.historyPrivateKey as unknown as ArrayBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const actual = new Uint8Array(
      await globalThis.crypto.subtle.deriveBits(
        { name: 'ECDH', public: peer.publicKey },
        reimported,
        256
      )
    );

    expect(actual).toEqual(expected);
  });
});
