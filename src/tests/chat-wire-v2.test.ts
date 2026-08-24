import { describe, expect, it } from 'vitest';
import {
  WIRE_VERSION_V2,
  canonicalJson,
  decryptV2,
  deviceTargetId,
  encryptV2,
  fromBase64,
  historyTargetId,
  isV2Envelope,
  toBase64,
  type WireRecipient,
  type WireTarget,
} from '../lib/chat-wire-v2';

/**
 * Wire v2 crypto guard rails. Node ships Web Crypto (globalThis.crypto.subtle) with P-256 ECDH,
 * AES-GCM and HKDF, so these exercise the real primitives — no mocks. IndexedDB is not required
 * here because the wire module is pure: it takes CryptoKeys as arguments.
 */

async function newDeviceKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveKey',
    'deriveBits',
  ]) as Promise<CryptoKeyPair>;
}

async function exportSpki(key: CryptoKey): Promise<string> {
  return toBase64(await globalThis.crypto.subtle.exportKey('spki', key));
}

async function makeDevice(id: string): Promise<{ target: WireTarget; recipient: WireRecipient }> {
  const pair = await newDeviceKeyPair();
  return {
    target: { id, publicKey: await exportSpki(pair.publicKey) },
    recipient: { id, privateKey: pair.privateKey },
  };
}

describe('canonicalJson', () => {
  it('sorts object keys lexicographically and recursively, with no whitespace', () => {
    const value = { w: [{ n: '2', i: '1', k: '3' }], e: 'E', n: 'N', c: 'C' };
    expect(canonicalJson(value)).toBe('{"c":"C","e":"E","n":"N","w":[{"i":"1","k":"3","n":"2"}]}');
  });

  it('is independent of insertion order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalJson({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });
});

describe('target ids', () => {
  it('formats device and history ids exactly', () => {
    expect(deviceTargetId('abc')).toBe('d:abc');
    expect(historyTargetId('user-1', 'key-9')).toBe('h:user-1:key-9');
  });
});

describe('encryptV2 / decryptV2', () => {
  it('produces a v2 envelope: base64 with a 0x02 first byte and canonical JSON payload', async () => {
    const { target } = await makeDevice(deviceTargetId('dev-1'));
    const envelope = await encryptV2('hello', 'match-1', [target]);

    expect(isV2Envelope(envelope)).toBe(true);
    const raw = fromBase64(envelope);
    expect(raw[0]).toBe(WIRE_VERSION_V2);

    const payload = JSON.parse(new TextDecoder().decode(raw.subarray(1)));
    expect(Object.keys(payload).sort()).toEqual(['c', 'e', 'n', 'w']);
    expect(payload.w).toHaveLength(1);
    expect(Object.keys(payload.w[0]).sort()).toEqual(['i', 'k', 'n']);
    expect(payload.w[0].i).toBe('d:dev-1');

    // Byte layout is exactly the canonical JSON of the parsed payload.
    expect(new TextDecoder().decode(raw.subarray(1))).toBe(canonicalJson(payload));
  });

  it('round-trips for every registered device and the history key', async () => {
    const selfDevice = await makeDevice(deviceTargetId('self-dev'));
    const peerDevice = await makeDevice(deviceTargetId('peer-dev'));
    const selfHistory = await makeDevice(historyTargetId('me', 'hk1'));
    const peerHistory = await makeDevice(historyTargetId('peer', 'hk2'));

    const envelope = await encryptV2('the quick brown fox', 'match-42', [
      selfDevice.target,
      peerDevice.target,
      selfHistory.target,
      peerHistory.target,
    ]);

    // Each recipient independently recovers the same plaintext.
    for (const recipient of [
      selfDevice.recipient,
      peerDevice.recipient,
      selfHistory.recipient,
      peerHistory.recipient,
    ]) {
      await expect(decryptV2(envelope, 'match-42', [recipient])).resolves.toBe(
        'the quick brown fox'
      );
    }
  });

  it('prefers the device key but falls back to the history key (device-preferred order)', async () => {
    const device = await makeDevice(deviceTargetId('dev-x'));
    const history = await makeDevice(historyTargetId('me', 'hk'));
    const envelope = await encryptV2('secret', 'm1', [device.target, history.target]);

    // A device holding only the history key still decrypts.
    await expect(decryptV2(envelope, 'm1', [history.recipient])).resolves.toBe('secret');
    // Ordering device-first-then-history works too.
    await expect(
      decryptV2(envelope, 'm1', [device.recipient, history.recipient])
    ).resolves.toBe('secret');
  });

  it('rejects a recipient that was not a target', async () => {
    const target = await makeDevice(deviceTargetId('dev-1'));
    const stranger = await makeDevice(deviceTargetId('dev-stranger'));
    const envelope = await encryptV2('hi', 'm1', [target.target]);
    await expect(decryptV2(envelope, 'm1', [stranger.recipient])).rejects.toThrow();
  });

  it('binds ciphertext to its matchId via AAD — a wrong matchId fails to decrypt', async () => {
    const device = await makeDevice(deviceTargetId('dev-1'));
    const envelope = await encryptV2('hi', 'match-A', [device.target]);
    await expect(decryptV2(envelope, 'match-B', [device.recipient])).rejects.toThrow();
  });

  it('fails authentication when the ciphertext is tampered with', async () => {
    const device = await makeDevice(deviceTargetId('dev-1'));
    const envelope = await encryptV2('hi', 'm1', [device.target]);

    const raw = fromBase64(envelope);
    const payload = JSON.parse(new TextDecoder().decode(raw.subarray(1)));
    const c = fromBase64(payload.c);
    c[0] ^= 0xff; // flip a ciphertext byte
    payload.c = toBase64(c);
    const tampered = new Uint8Array(1 + new TextEncoder().encode(canonicalJson(payload)).length);
    tampered[0] = WIRE_VERSION_V2;
    tampered.set(new TextEncoder().encode(canonicalJson(payload)), 1);

    await expect(decryptV2(toBase64(tampered), 'm1', [device.recipient])).rejects.toThrow();
  });

  it('requires at least one target', async () => {
    await expect(encryptV2('hi', 'm1', [])).rejects.toThrow(/at least one target/i);
  });

  it('requires a matchId', async () => {
    const device = await makeDevice(deviceTargetId('dev-1'));
    await expect(encryptV2('hi', '', [device.target])).rejects.toThrow(/matchId/i);
  });

  it('deduplicates targets that appear more than once', async () => {
    const device = await makeDevice(deviceTargetId('dev-dup'));
    const envelope = await encryptV2('hi', 'm1', [device.target, device.target]);
    const raw = fromBase64(envelope);
    const payload = JSON.parse(new TextDecoder().decode(raw.subarray(1)));
    expect(payload.w).toHaveLength(1);
  });

  it('rejects a non-v2 envelope in decryptV2', async () => {
    const notV2 = toBase64(new Uint8Array([0x01, 0x02, 0x03]));
    await expect(decryptV2(notV2, 'm1', [])).rejects.toThrow(/version|malformed/i);
    expect(isV2Envelope(notV2)).toBe(false);
  });
});


describe('cross-platform wire-v2 vector', () => {
  it('decrypts onehook-wire-v2-interop-1 shared with Swift and Kotlin', async () => {
    const recipientPrivatePkcs8 =
      'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh+hRANCAAR6WTGAhgxAN8g8EnSYRcjuFCTdKX+ty4leNYJV0sfSsqjKJVgPJib+V5Bi/xuZ/5HCSg2gb7MrW+IBSMkkn1ZQ';
    const envelope =
      'AnsiYyI6IkNHeXpVNnFLcVR2NktPWHVuSjlLVGVxNDgxR0NGQzljeVBoeEZSL3pxL3ZsREkwZ2dtZ1UxS1NzM1h3PSIsImUiOiJNRmt3RXdZSEtvWkl6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVtRUlsV0YwaWhjRTRBejFoUU9QTytMa1lXWEJPVThNVCtMWTJ1aytXZGttWE5CUlBSdjBacDJlbFJTaDhRNWE1ZTJuZE9QcXVxSmdhM0JwUDdadEFIZz09IiwibiI6IkFBRUNBd1FGQmdjSUNRb0wiLCJ3IjpbeyJpIjoiZDppbnRlcm9wLWRldmljZSIsImsiOiJycjZBb083WmJqVUNhUGR5UFBsakcvMDhTSGRMSWlYOWExVnY1b2pHM1FsNGgrbDU0TzVsNHFMeXlFemVqbG1MIiwibiI6IkRBME9EeEFSRWhNVUZSWVgifV19';
    const privateKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      fromBase64(recipientPrivatePkcs8) as unknown as ArrayBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    );

    await expect(
      decryptV2(envelope, 'interop-match-2026', [
        { id: 'd:interop-device', privateKey },
      ])
    ).resolves.toBe('OneHook wire-v2 interop 🔐');
  });
});
