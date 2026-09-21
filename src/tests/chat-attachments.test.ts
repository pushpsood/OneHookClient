import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_FRAME_BYTE,
  AttachmentDecodeError,
  MAX_CIPHERTEXT_BYTES,
  assertCiphertextWithinLimit,
  decodeMessagePlaintext,
  decryptAttachmentBytes,
  encodeKeyMaterial,
  encryptAttachment,
  frameAttachment,
  generateContentKey,
  generateNonce,
  isAttachmentFrame,
  parseAttachmentEnvelope,
  type AttachmentEnvelope,
} from '../lib/chat-attachments';
import { fromBase64, toBase64 } from '../lib/chat-wire-v2';

/**
 * Attachment framing + crypto guard rails. Node ships Web Crypto (globalThis.crypto.subtle) with
 * AES-GCM and global btoa/atob, so these exercise the real primitives with no mocks — the same
 * primitives the browser client uses at runtime.
 */

function sampleEnvelope(overrides: Partial<AttachmentEnvelope> = {}): AttachmentEnvelope {
  const { contentKey, nonce } = encodeKeyMaterial(generateContentKey(), generateNonce());
  return {
    v: 1,
    kind: 'image',
    objectKey: 'match-123/9f8e7d6c',
    contentKey,
    nonce,
    mime: 'image/jpeg',
    name: 'IMG_1234.jpg',
    size: 182734,
    width: 1080,
    height: 1920,
    caption: 'a caption',
    ...overrides,
  };
}

describe('attachment framing', () => {
  it('frames an envelope with the 0x01 discriminator byte followed by JSON', () => {
    const framed = frameAttachment(sampleEnvelope());
    expect(framed.charCodeAt(0)).toBe(ATTACHMENT_FRAME_BYTE);
    expect(isAttachmentFrame(framed)).toBe(true);
    // The remainder must be the envelope JSON.
    expect(() => JSON.parse(framed.slice(1))).not.toThrow();
  });

  it('round-trips an envelope through frame → decode unchanged', () => {
    const envelope = sampleEnvelope({ kind: 'audio', waveform: [0, 15, 31, 7], durationMs: 4200 });
    const decoded = decodeMessagePlaintext(frameAttachment(envelope));
    expect(decoded.type).toBe('attachment');
    if (decoded.type === 'attachment') {
      expect(decoded.envelope).toEqual(envelope);
    }
  });

  it('treats any non-0x01 first byte as legacy plain text, verbatim', () => {
    // A message that merely LOOKS like JSON must not be misread as an attachment.
    const looksLikeJson = '{"v":1,"kind":"image"}';
    const decoded = decodeMessagePlaintext(looksLikeJson);
    expect(decoded.type).toBe('text');
    if (decoded.type === 'text') {
      expect(decoded.text).toBe(looksLikeJson);
    }
    expect(isAttachmentFrame('hello world')).toBe(false);
    expect(isAttachmentFrame('')).toBe(false);
  });

  it('ignores unknown future fields so the envelope can grow without a lock-step release', () => {
    const json = JSON.stringify({
      ...sampleEnvelope({ kind: 'file' }),
      futureField: { nested: true },
      anotherNewOne: 42,
    });
    const envelope = parseAttachmentEnvelope(json);
    expect(envelope.kind).toBe('file');
    expect(envelope).not.toHaveProperty('futureField');
    expect(envelope).not.toHaveProperty('anotherNewOne');
  });

  it('rejects a newer envelope version with an "update the app" signal', () => {
    const json = JSON.stringify(sampleEnvelope({ v: 2 }));
    try {
      parseAttachmentEnvelope(json);
      expect.unreachable('a v2 envelope must not parse');
    } catch (err) {
      expect(err).toBeInstanceOf(AttachmentDecodeError);
      expect((err as AttachmentDecodeError).unsupportedVersion).toBe(true);
    }
  });

  it('throws for a missing required field', () => {
    const { objectKey: _omit, ...withoutKey } = sampleEnvelope();
    expect(() => parseAttachmentEnvelope(JSON.stringify(withoutKey))).toThrow(AttachmentDecodeError);
  });

  it('clamps an over-long / out-of-range waveform on decode', () => {
    const waveform = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 99 : -5));
    const envelope = parseAttachmentEnvelope(
      JSON.stringify(sampleEnvelope({ kind: 'audio', waveform }))
    );
    expect(envelope.waveform!.length).toBe(64);
    for (const bucket of envelope.waveform!) {
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(31);
    }
  });
});

describe('attachment AES-256-GCM file crypto', () => {
  it('round-trips file bytes through encrypt → decrypt', async () => {
    const plaintext = globalThis.crypto.getRandomValues(new Uint8Array(5000));
    const { ciphertext, contentKey, nonce } = await encryptAttachment(plaintext);
    // Ciphertext includes the 16-byte GCM tag, so it is longer than the plaintext.
    expect(ciphertext.byteLength).toBe(plaintext.byteLength + 16);
    const decrypted = await decryptAttachmentBytes(ciphertext, contentKey, nonce);
    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it('fails authentication (rather than yielding garbage) when a ciphertext byte is flipped', async () => {
    const plaintext = new TextEncoder().encode('a secret photo');
    const { ciphertext, contentKey, nonce } = await encryptAttachment(plaintext);
    const tampered = ciphertext.slice();
    tampered[0] ^= 0xff;
    await expect(decryptAttachmentBytes(tampered, contentKey, nonce)).rejects.toThrow();
  });

  it('base64 key material survives an encode → decode cycle', async () => {
    const contentKey = generateContentKey();
    const nonce = generateNonce();
    const encoded = encodeKeyMaterial(contentKey, nonce);
    expect(fromBase64(encoded.contentKey)).toEqual(contentKey);
    expect(fromBase64(encoded.nonce)).toEqual(nonce);
    // Sanity: a re-encode is stable.
    expect(toBase64(fromBase64(encoded.contentKey))).toBe(encoded.contentKey);
  });
});

describe('attachment size limit', () => {
  it('accepts a ciphertext at exactly the limit', () => {
    expect(() => assertCiphertextWithinLimit(MAX_CIPHERTEXT_BYTES)).not.toThrow();
  });

  it('rejects a ciphertext one byte over the limit before any upload', () => {
    expect(() => assertCiphertextWithinLimit(MAX_CIPHERTEXT_BYTES + 1)).toThrow(/too large/i);
  });
});

/**
 * Cross-platform golden vector.
 *
 * Web, iOS and Android each implement the envelope independently, so a round-trip test proves only
 * self-consistency — it would still pass if this client disagreed with the others about whether the
 * nonce is prepended to the uploaded object or carried in the envelope. That mismatch would surface
 * only as "attachments from mobile never open", in production. These exact bytes are asserted in all
 * three test suites and are what actually pins the wire format.
 */
describe('cross-platform golden vector', () => {
  const GOLDEN_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
  const GOLDEN_NONCE = 'AAECAwQFBgcICQoL';
  const GOLDEN_CIPHERTEXT = 'CGyzU6qKqTvsNePq0oEVCO2ip12eDzoOVxfF83gKdN1zMNjN4yzGvOvhMfDJz9xEi/jb3w==';
  const EXPECTED = 'OneHook attachment interop vector v1';

  const fromBase64 = (value: string): Uint8Array =>
    Uint8Array.from(Buffer.from(value, 'base64'));

  it('decrypts a ciphertext produced outside this codebase', async () => {
    const plaintext = await decryptAttachmentBytes(
      fromBase64(GOLDEN_CIPHERTEXT),
      fromBase64(GOLDEN_KEY),
      fromBase64(GOLDEN_NONCE),
    );

    expect(new TextDecoder().decode(plaintext)).toBe(EXPECTED);
    // 36 plaintext + 16 tag: proves the tag is appended and not carried elsewhere.
    expect(fromBase64(GOLDEN_CIPHERTEXT).length).toBe(plaintext.length + 16);
  });
});

