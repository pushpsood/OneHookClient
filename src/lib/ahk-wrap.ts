import { fromBase64, toBase64 } from './chat-wire-v2';

/**
 * Wrapping and unwrapping the account-history PRIVATE key.
 *
 * A wrap is one encrypted copy of that key, openable by exactly one unlock method. Storing several
 * removes the single point of failure the original design had: the key existed on one device, so
 * losing that device destroyed older history permanently (see OneHookBackend/docs/account-key-recovery.md).
 *
 * Two shapes, because the two kinds of unlock material are different:
 *
 *  - **Asymmetric** (`DEVICE`) — the wrap is sealed to a device's PUBLIC key, so the wrap can be
 *    created by a device that does not hold the target's private key. A fresh ephemeral key pair per
 *    wrap means the sender needs no long-term secret either.
 *  - **Symmetric** (`PRF`) — the wrap is sealed to key material the user can reproduce, namely the
 *    32 bytes a passkey returns from the WebAuthn PRF extension.
 *
 * Both bind the wrap's IDENTITY into the AEAD's additional data: userId, epoch, method and wrapId. A
 * wrap therefore cannot be replayed into a different slot — moved to another epoch, relabelled as a
 * different method, or presented as another device's wrap — because the tag fails. This is the same
 * discipline wire v2 applies to message wraps, and it is what stops a server that can reorder rows
 * from tricking a client into unwrapping the wrong thing.
 *
 * Nothing here ever degrades: every failure throws.
 */

const WRAP_VERSION = 0x01;
const IV_BYTES = 12;
/** Domain separator, so these keys can never collide with a message wrap key. */
const WRAP_INFO_PREFIX = 'onehook-ahk-wrap-v1\0';

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'History-key recovery is unavailable: this environment has no Web Crypto API (a secure HTTPS context is required).'
    );
  }
  return api;
}

/** Identity of a wrap slot. Bound into the AEAD so a wrap cannot be moved between slots. */
export interface WrapContext {
  userId: string;
  epoch: number;
  method: 'DEVICE' | 'PRF';
  wrapId: string;
}

function additionalData(context: WrapContext): Uint8Array {
  return new TextEncoder().encode(
    `${WRAP_INFO_PREFIX}${context.userId}|${context.epoch}|${context.method}|${context.wrapId}`
  );
}

function requireContext(context: WrapContext): void {
  if (!context.userId) throw new Error('A userId is required to wrap the history key.');
  if (!Number.isInteger(context.epoch) || context.epoch < 1) {
    throw new Error('A wrap requires an epoch of at least 1.');
  }
  if (!context.wrapId) throw new Error('A wrapId is required to wrap the history key.');
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

async function deriveFromAgreement(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  context: WrapContext
): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdf = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(context.userId),
      info: additionalData(context),
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveFromSecret(secret: Uint8Array, context: WrapContext): Promise<CryptoKey> {
  if (!secret || secret.length < 16) {
    // Anything shorter is not plausible unlock material and would make an offline attack cheap.
    throw new Error('Unlock material is too short to wrap the history key.');
  }
  const hkdf = await subtle().importKey('raw', secret as unknown as ArrayBuffer, 'HKDF', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(context.userId),
      info: additionalData(context),
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Envelope layout, parsed literally by every platform — bump {@link WRAP_VERSION} to change it:
 *
 *   base64( version(1) || ephemeralLen(2, big endian) || ephemeralSpki(ephemeralLen)
 *           || nonce(12) || ciphertext(rest, GCM tag included) )
 *
 * `ephemeralLen` is 0 for symmetric wraps, which carry no ephemeral key.
 */
function encodeEnvelope(ephemeralSpki: Uint8Array | null, iv: Uint8Array, ciphertext: Uint8Array): string {
  const ephemeral = ephemeralSpki ?? new Uint8Array(0);
  const out = new Uint8Array(1 + 2 + ephemeral.length + iv.length + ciphertext.length);
  let offset = 0;
  out[offset++] = WRAP_VERSION;
  out[offset++] = (ephemeral.length >> 8) & 0xff;
  out[offset++] = ephemeral.length & 0xff;
  out.set(ephemeral, offset);
  offset += ephemeral.length;
  out.set(iv, offset);
  offset += iv.length;
  out.set(ciphertext, offset);
  return toBase64(out);
}

function decodeEnvelope(envelope: string): {
  ephemeralSpki: Uint8Array | null;
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  const raw = fromBase64(envelope);
  if (raw.length < 1 + 2 + IV_BYTES + 1) {
    throw new Error('This recovery key copy is malformed.');
  }
  if (raw[0] !== WRAP_VERSION) {
    throw new Error(`Unsupported recovery key format (version ${raw[0]}).`);
  }
  const ephemeralLen = (raw[1] << 8) | raw[2];
  const ephemeralEnd = 3 + ephemeralLen;
  const ivEnd = ephemeralEnd + IV_BYTES;
  if (raw.length <= ivEnd) {
    throw new Error('This recovery key copy is malformed.');
  }
  return {
    ephemeralSpki: ephemeralLen > 0 ? raw.subarray(3, ephemeralEnd) : null,
    iv: raw.subarray(ephemeralEnd, ivEnd),
    ciphertext: raw.subarray(ivEnd),
  };
}

/**
 * Seals the history private key to a device's PUBLIC key.
 *
 * Used when an already-unlocked device approves another one: the approving device needs only the
 * target's published public key, never its private half.
 *
 * @param historyPrivateKeyPkcs8 the raw PKCS#8 history private key
 * @param targetPublicKeySpki    base64 SPKI P-256 public key of the device being granted access
 */
export async function wrapToDeviceKey(
  historyPrivateKeyPkcs8: Uint8Array,
  targetPublicKeySpki: string,
  context: WrapContext
): Promise<string> {
  requireContext(context);
  if (context.method !== 'DEVICE') {
    throw new Error('wrapToDeviceKey requires a DEVICE wrap context.');
  }
  const target = await importEcdhPublicKey(targetPublicKeySpki);
  const ephemeral = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const key = await deriveFromAgreement(ephemeral.privateKey, target, context);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    key,
    historyPrivateKeyPkcs8 as unknown as ArrayBuffer
  );
  const ephemeralSpki = new Uint8Array(await subtle().exportKey('spki', ephemeral.publicKey));
  return encodeEnvelope(ephemeralSpki, iv, new Uint8Array(ciphertext));
}

/**
 * Opens a wrap sealed to this device's key.
 *
 * @param devicePrivateKey this device's registered (non-extractable) ECDH private key
 */
export async function unwrapWithDeviceKey(
  envelope: string,
  devicePrivateKey: CryptoKey,
  context: WrapContext
): Promise<Uint8Array> {
  requireContext(context);
  const { ephemeralSpki, iv, ciphertext } = decodeEnvelope(envelope);
  if (!ephemeralSpki) {
    throw new Error('This recovery key copy was not sealed to a device key.');
  }
  const ephemeralPublic = await subtle().importKey(
    'spki',
    ephemeralSpki as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const key = await deriveFromAgreement(devicePrivateKey, ephemeralPublic, context);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    key,
    ciphertext as unknown as ArrayBuffer
  );
  return new Uint8Array(plaintext);
}

/**
 * Seals the history private key to reproducible secret material — the 32 bytes a passkey returns from
 * the WebAuthn PRF extension.
 *
 * The secret never leaves the device and is never stored: it is re-derived from the passkey on each
 * unlock, which is what lets this work on a brand-new device with no other device online.
 */
export async function wrapToSecret(
  historyPrivateKeyPkcs8: Uint8Array,
  secret: Uint8Array,
  context: WrapContext
): Promise<string> {
  requireContext(context);
  const key = await deriveFromSecret(secret, context);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    key,
    historyPrivateKeyPkcs8 as unknown as ArrayBuffer
  );
  return encodeEnvelope(null, iv, new Uint8Array(ciphertext));
}

/** Opens a wrap sealed to reproducible secret material. */
export async function unwrapWithSecret(
  envelope: string,
  secret: Uint8Array,
  context: WrapContext
): Promise<Uint8Array> {
  requireContext(context);
  const { ephemeralSpki, iv, ciphertext } = decodeEnvelope(envelope);
  if (ephemeralSpki) {
    throw new Error('This recovery key copy expects a device key, not a derived secret.');
  }
  const key = await deriveFromSecret(secret, context);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    key,
    ciphertext as unknown as ArrayBuffer
  );
  return new Uint8Array(plaintext);
}
