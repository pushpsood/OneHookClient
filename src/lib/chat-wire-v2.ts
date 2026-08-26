/**
 * OneHook chat wire format, version 2 (multi-device envelope).
 *
 * Version 1 (see chat-encryption.ts) bound a conversation to a single ECDH identity key per user,
 * so a member could only read a match from the one device that generated that key. Version 2 fans
 * a message out to EVERY registered device of both members (plus each member's account-history
 * key), so a person can read their conversations from any of their devices and recover history on
 * a new device — without the server ever seeing plaintext.
 *
 * Exact wire contract (do not change without bumping the version byte — peers parse this literally):
 *
 *   envelope = base64( 0x02 || UTF8( canonicalJson(payload) ) )
 *
 *   payload  = { "e": <ephemeral P-256 SPKI, base64>,
 *                "n": <message AES-GCM nonce, base64 (12 bytes)>,
 *                "c": <message ciphertext incl. GCM tag, base64>,
 *                "w": [ wrap, ... ] }
 *
 *   wrap     = { "i": <target id>,
 *                "n": <wrap AES-GCM nonce, base64 (12 bytes)>,
 *                "k": <wrapped 32-byte content key incl. GCM tag, base64> }
 *
 *   canonicalJson serialises compactly (no whitespace) with object keys sorted lexicographically,
 *   recursively — so the byte layout is deterministic and reproducible on every platform. The
 *   canonical top-level key order is therefore c, e, n, w and every wrap is i, k, n.
 *
 * Cryptography:
 *   - One fresh random AES-256 content key encrypts the message body.
 *       message: AES-GCM, random 12-byte nonce, AAD = "onehook-chat-v2-message\0" || matchId.
 *   - One fresh ephemeral P-256 key pair is generated per message; its public key (SPKI) is "e".
 *   - The content key is wrapped once per target. For a target with public key P and id T:
 *       shared   = ECDH(ephemeralPrivate, P)
 *       wrapKey  = HKDF-SHA256(shared, salt = matchId, info = "onehook-chat-v2-wrap\0" || T) -> AES-256
 *       "k"      = AES-GCM(wrapKey, nonce, contentKeyBytes, AAD = "onehook-chat-v2-wrap\0" || T)
 *   - Targets are device keys (id "d:<deviceId>") and account-history keys ("h:<userId>:<keyId>").
 *
 * Every failure path throws. Nothing here degrades to plaintext.
 */

export const WIRE_VERSION_V2 = 0x02;
const IV_BYTES = 12;
const CONTENT_KEY_BYTES = 32;
const MESSAGE_AAD_PREFIX = 'onehook-chat-v2-message\0';
const WRAP_INFO_PREFIX = 'onehook-chat-v2-wrap\0';

export interface WireTarget {
  /** Canonical target id: "d:<deviceId>" for a device, "h:<userId>:<keyId>" for a history key. */
  id: string;
  /** Target public key, base64-encoded SPKI (P-256 ECDH). */
  publicKey: string;
}

export interface WireRecipient {
  /** Canonical target id this private key can unwrap. */
  id: string;
  /** Non-extractable P-256 ECDH private key held by this device. */
  privateKey: CryptoKey;
}

interface WrapEntry {
  i: string;
  n: string;
  k: string;
}

interface WirePayload {
  e: string;
  n: string;
  c: string;
  w: WrapEntry[];
}

/** Canonical target id for a device key. */
export function deviceTargetId(deviceId: string): string {
  return `d:${deviceId}`;
}

/** Canonical target id for an account-history key. */
export function historyTargetId(userId: string, keyId: string): string {
  return `h:${userId}:${keyId}`;
}

/**
 * Raised when an envelope is well-formed and intact but was not encrypted to any key this device
 * holds — the signature of history written before this device was registered.
 *
 * Callers MUST distinguish this from transport or parse errors: it is the only failure that history
 * recovery can fix, and it is what makes the UI offer "restore from another device" instead of a
 * generic error.
 */
export class UndecryptableMessageError extends Error {
  /** Stable across bundling/minification, unlike `instanceof` across module duplication. */
  readonly code = 'UNDECRYPTABLE_MESSAGE';

  constructor(message = 'This message was not encrypted for any of this device’s keys.') {
    super(message);
    this.name = 'UndecryptableMessageError';
  }
}

/** True for the error above, whatever module instance produced it. */
export function isUndecryptableMessageError(error: unknown): boolean {
  return (
    error instanceof UndecryptableMessageError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'UNDECRYPTABLE_MESSAGE')
  );
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'Message encryption is unavailable: this environment has no Web Crypto API (a secure HTTPS context is required).'
    );
  }
  return api;
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Serialises a JSON value compactly with object keys sorted lexicographically, recursively. This
 * is the byte-for-byte canonical form both peers agree on; it must never depend on insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${members.join(',')}}`;
}

async function importEcdhPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    fromBase64(spkiBase64) as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function deriveWrapKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  matchId: string,
  targetId: string
): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(matchId),
      info: new TextEncoder().encode(WRAP_INFO_PREFIX + targetId),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext message for every target and produces the base64 v2 envelope.
 *
 * @throws if no targets are supplied — a message with no recipients would be silently unreadable.
 */
export async function encryptV2(
  plaintext: string,
  matchId: string,
  targets: WireTarget[]
): Promise<string> {
  if (!matchId) throw new Error('A matchId is required to encrypt a message.');
  if (!targets.length) throw new Error('At least one target device is required to encrypt.');

  // Deduplicate targets by id so a device that appears in both the self and peer registries (or a
  // history key listed twice) is wrapped exactly once.
  const uniqueTargets = new Map<string, WireTarget>();
  for (const target of targets) {
    if (!target.id || !target.publicKey) continue;
    if (!uniqueTargets.has(target.id)) uniqueTargets.set(target.id, target);
  }
  if (!uniqueTargets.size) throw new Error('No valid targets to encrypt to.');

  const contentKeyBytes = globalThis.crypto.getRandomValues(new Uint8Array(CONTENT_KEY_BYTES));
  const contentKey = await subtle().importKey('raw', contentKeyBytes, 'AES-GCM', false, [
    'encrypt',
  ]);

  const messageIv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle().encrypt(
    {
      name: 'AES-GCM',
      iv: messageIv,
      additionalData: new TextEncoder().encode(MESSAGE_AAD_PREFIX + matchId),
    },
    contentKey,
    new TextEncoder().encode(plaintext)
  );

  const ephemeral = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const ephemeralSpki = await subtle().exportKey('spki', ephemeral.publicKey);

  const wraps: WrapEntry[] = await Promise.all(
    [...uniqueTargets.values()].map(async (target) => {
      const targetPublic = await importEcdhPublicKey(target.publicKey);
      const wrapKey = await deriveWrapKey(ephemeral.privateKey, targetPublic, matchId, target.id);
      const wrapIv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const wrapped = await subtle().encrypt(
        {
          name: 'AES-GCM',
          iv: wrapIv,
          additionalData: new TextEncoder().encode(WRAP_INFO_PREFIX + target.id),
        },
        wrapKey,
        contentKeyBytes
      );
      return { i: target.id, n: toBase64(wrapIv), k: toBase64(wrapped) };
    })
  );

  const payload: WirePayload = {
    e: toBase64(ephemeralSpki),
    n: toBase64(messageIv),
    c: toBase64(ciphertext),
    w: wraps,
  };

  const json = new TextEncoder().encode(canonicalJson(payload));
  const envelope = new Uint8Array(1 + json.length);
  envelope[0] = WIRE_VERSION_V2;
  envelope.set(json, 1);
  return toBase64(envelope);
}

/** True when the base64 envelope carries the v2 version byte. */
export function isV2Envelope(envelope: string): boolean {
  try {
    return fromBase64(envelope)[0] === WIRE_VERSION_V2;
  } catch {
    return false;
  }
}

/**
 * Parses and structurally validates a v2 envelope.
 *
 * Exported so callers can reject junk BEFORE touching the key store: loading an identity means opening
 * IndexedDB, and a malformed envelope should be reported as malformed rather than as whatever failure
 * the key store happens to raise first.
 *
 * @throws for a wrong version byte or a payload missing any required member.
 */
export function parseV2Envelope(envelope: string): WirePayload {
  const raw = fromBase64(envelope);
  if (raw.length <= 1) throw new Error('Message is malformed.');
  if (raw[0] !== WIRE_VERSION_V2) {
    throw new Error(`Unsupported message encryption version ${raw[0]}.`);
  }

  let payload: WirePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw.subarray(1))) as WirePayload;
  } catch {
    throw new Error('Message is malformed.');
  }
  if (!payload?.e || !payload?.n || !payload?.c || !Array.isArray(payload?.w)) {
    throw new Error('Message is malformed.');
  }
  return payload;
}

/**
 * Decrypts a v2 envelope. Recipients are tried in the order supplied — callers pass the device key
 * first and the account-history key second, so a device decrypts with its own key when possible and
 * only falls back to shared history material otherwise.
 *
 * @throws if the envelope is malformed, the version byte is wrong, or no recipient can unwrap it.
 */
export async function decryptV2(
  envelope: string,
  matchId: string,
  recipients: WireRecipient[]
): Promise<string> {
  const payload = parseV2Envelope(envelope);

  const ephemeralPublic = await importEcdhPublicKey(payload.e);

  for (const recipient of recipients) {
    if (!recipient?.id || !recipient?.privateKey) continue;
    const wrap = payload.w.find((entry) => entry.i === recipient.id);
    if (!wrap) continue;

    // Derivation happens OUTSIDE the catch: a WebCrypto or environment failure here is not "this
    // device holds no key for the message", and callers key the history-recovery prompt off that
    // distinction. Only an authentication failure falls through to the next recipient.
    const wrapKey = await deriveWrapKey(recipient.privateKey, ephemeralPublic, matchId, wrap.i);
    try {
      const contentKeyBytes = await subtle().decrypt(
        {
          name: 'AES-GCM',
          iv: fromBase64(wrap.n),
          additionalData: new TextEncoder().encode(WRAP_INFO_PREFIX + wrap.i),
        },
        wrapKey,
        fromBase64(wrap.k)
      );
      const contentKey = await subtle().importKey('raw', contentKeyBytes, 'AES-GCM', false, [
        'decrypt',
      ]);
      const plaintext = await subtle().decrypt(
        {
          name: 'AES-GCM',
          iv: fromBase64(payload.n),
          additionalData: new TextEncoder().encode(MESSAGE_AAD_PREFIX + matchId),
        },
        contentKey,
        fromBase64(payload.c)
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      // Try the next recipient key (e.g. device key failed, fall back to history key).
    }
  }

  throw new UndecryptableMessageError();
}
