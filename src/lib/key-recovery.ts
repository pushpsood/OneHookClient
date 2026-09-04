/**
 * OneHook history-key recovery, protocol version 1 (device-to-device, optical transfer).
 *
 * WHY THIS EXISTS
 * ---------------
 * Wire v2 (see chat-wire-v2.ts) wraps every message to each member's long-lived "account-history"
 * key as well as to each registered device. A device can read anything sent during its own lifetime
 * with its own key, but messages sent BEFORE it existed could not be wrapped to it, so opening those
 * requires the history PRIVATE key. This module moves that key from an existing device (SOURCE) to a
 * new one (TARGET) without the backend ever being able to read it.
 *
 * WHERE THIS SITS IN THE LADDER
 * -----------------------------
 * This is the MANUAL FALLBACK, not the primary mechanism. The history key is versioned as an epoch
 * carrying several independently encrypted copies ("wraps"), and `unlockHistoryKey` in
 * chat-encryption.ts tries the cheaper rungs first: platform escrow (already present after an OS
 * restore), a passkey via WebAuthn PRF (one biometric prompt, no second device), then a device wrap
 * written by a device that already has access. QR is what remains when none of those is available —
 * notably on platforms with no PRF support — and `resetHistoryKey` is the floor below it.
 *
 * It earns its place by working everywhere and needing nothing but two screens and a camera. What it
 * costs is both devices present and awake, which is why it is tried last rather than first.
 *
 * THE FLOW (backend is a dumb router; see api/key-recovery.ts + the AppSync resolvers)
 * -----------------------------------------------------------------------------------
 *   1. TARGET generates a single-use ephemeral P-256 key pair (private key stays in memory only,
 *      never persisted) and a 32-byte random challenge, then calls `requestKeyRecovery`. Only the
 *      ephemeral PUBLIC key and the challenge cross the network.
 *   2. SOURCE receives the session over an AppSync subscription (or a cold-start query), asks the
 *      human to confirm — comparing a 6-digit code shown on both devices — and seals the bundle
 *      with `sealRecoveryBundle`.
 *   3. SOURCE renders the sealed bundle as a QR code. The bundle NEVER travels through the backend.
 *   4. TARGET scans the QR with the camera and calls `openRecoveryBundle`, then imports the keys.
 *
 * CRYPTOGRAPHY
 * ------------
 *   Three ECDH agreements are concatenated into the HKDF input keying material:
 *
 *     z_auth = ECDH(source device static private, target EPHEMERAL public)
 *     z_bind = ECDH(source device static private, target DEVICE static public)
 *     z_fs   = ECDH(source EPHEMERAL private,     target EPHEMERAL public)
 *     ikm    = z_auth || z_bind || z_fs
 *
 *   - z_auth AUTHENTICATES the source: only the holder of the device private key registered under
 *     `sourceDeviceId` can produce it, and the target checks that registered public key from its
 *     own registry read.
 *   - z_bind BINDS the transfer to the target's REGISTERED device key, which is the defence against a
 *     backend that swaps the ephemeral public key in the request. Such a backend can substitute the
 *     ephemeral half, but it cannot compute z_bind without the target device's long-term private key,
 *     which never leaves that device. Substitution therefore fails the GCM tag check rather than
 *     relying on a human noticing a mismatched code. (A backend that ALSO rewrites the target's
 *     registered public key makes the bundle undecryptable by the real target — a denial of service,
 *     not a compromise.)
 *   - z_fs adds forward secrecy for the transfer itself: the source's ephemeral private key is
 *     discarded when the QR is dismissed, so a later compromise of either device's long-term keys
 *     does not retroactively decrypt a photographed QR.
 *
 *     salt = the session challenge (32 random bytes minted by the target)
 *     info = "onehook-recovery-v1\0" || sessionId || "|" || sourceFp || "|" || targetFp || "|" || expiresAt
 *     key  = HKDF-SHA256(ikm, salt, info) -> AES-256-GCM
 *     aad  = info || header   (header = magic || version || source ephemeral public key)
 *
 *   Binding sessionId, both device fingerprints and `expiresAt` into `info` (and the AAD) makes the
 *   ciphertext undecryptable outside the exact session it was minted for: a replayed or re-scanned
 *   QR from an earlier session, a session pointed at a different device, or a session whose expiry
 *   was rewritten in transit all fail the GCM tag check rather than degrading to a partial success.
 *
 * WHAT THIS DOES NOT DEFEND AGAINST
 * ---------------------------------
 *   Both devices read each other's long-term public keys from the server-held device registry, so a
 *   backend that substitutes a REGISTERED key it holds the private half of could seal a bundle the
 *   target accepts — but only if it can also get that QR in front of the target's camera. The 6-digit
 *   code compared by the user (see `deriveVerificationCode`) and the registry check in
 *   `importRecoveryBundle` are the mitigations; genuine protection would need out-of-band key
 *   verification (safety numbers), which this client does not offer yet.
 *
 * WIRE FORMAT (bump the version byte if any of this changes — peers parse it literally)
 * ------------------------------------------------------------------------------------
 *   envelope = magic(3) "OHR" || version(1) 0x01 || sourceEphemeralPublicKey(65, raw P-256 point)
 *              || nonce(12) || ciphertext(rest, AES-GCM tag included)
 *
 *   plaintext = TLV items, each: type(1) || length(2, big endian) || value(length)
 *               0x01 historyKeyId   (UTF-8, exactly once)
 *               0x02 history private key   (PKCS#8, exactly once)
 *               0x03 retired (was the wire-v1 identity key, removed with wire v1)
 *
 *   The envelope is transported as Base45 text so the QR encoder can use alphanumeric mode
 *   (2 characters per 11 bits) instead of byte mode (8 bits per character). Base45 is longer as a
 *   string than Base64 but produces a ~23% smaller QR code, which is what keeps it scannable by an
 *   ordinary phone camera.
 *
 * Every failure path throws. Nothing here degrades to an unauthenticated or partial import.
 */

export const RECOVERY_PROTOCOL_VERSION = 0x01;

/** "OHR" — OneHook Recovery. Lets a scanner reject unrelated QR codes before any crypto runs. */
const MAGIC = Uint8Array.from([0x4f, 0x48, 0x52]);
const RAW_PUBLIC_KEY_BYTES = 65; // Uncompressed P-256 point: 0x04 || X(32) || Y(32).
const NONCE_BYTES = 12;
const CHALLENGE_BYTES = 32;
const HEADER_BYTES = MAGIC.length + 1 + RAW_PUBLIC_KEY_BYTES;
const KDF_INFO_PREFIX = 'onehook-recovery-v1\0';
const CODE_INFO_PREFIX = 'onehook-recovery-code\0';
const VERIFICATION_CODE_DIGITS = 6;

const TLV_HISTORY_KEY_ID = 0x01;
const TLV_HISTORY_PRIVATE_KEY = 0x02;
// 0x03 was the wire-v1 identity key, removed with v1 itself. The id stays retired rather than reused,
// so a code minted by an older build cannot be misread: unknown types are skipped by `decodeTlv`.

/** Keys handed from the source device to the target device. */
export interface RecoveryBundle {
  /** Logical id of the account-history key, as published in the device registry. */
  historyKeyId: string;
  /** PKCS#8 encoding of the account-history ECDH private key. */
  historyPrivateKey: Uint8Array;
}

/** Session facts both devices know, all of which are cryptographically bound into the envelope. */
export interface RecoverySessionBinding {
  sessionId: string;
  /** Base64 of the 32 random bytes minted by the target device. */
  challenge: string;
  /** Epoch milliseconds after which the session — and any QR minted for it — is refused. */
  expiresAt: number;
  /** SHA-256 fingerprint (hex) of the source device's registered public key. */
  sourceFingerprint: string;
  /** SHA-256 fingerprint (hex) of the target device's registered public key. */
  targetFingerprint: string;
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'Key recovery is unavailable: this environment has no Web Crypto API (a secure HTTPS context is required).'
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

// ── Base45 (RFC 9285) ───────────────────────────────────────────────────────────────────────────
// The alphabet is exactly the QR "alphanumeric" character set, so a QR encoder can pack 2 characters
// into 11 bits instead of spending 8 bits per character in byte mode. Base45 emits MORE characters
// than Base64 (1.5 vs 1.33 per byte) yet needs ~23% FEWER QR modules for the same payload — and QR
// size, not string length, is what decides whether an ordinary phone camera locks on quickly.

const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 1 < bytes.length; i += 2) {
    let value = bytes[i] * 256 + bytes[i + 1];
    const c = value % 45;
    value = (value - c) / 45;
    const b = value % 45;
    const a = (value - b) / 45;
    out += BASE45_ALPHABET[c] + BASE45_ALPHABET[b] + BASE45_ALPHABET[a];
  }
  if (i < bytes.length) {
    let value = bytes[i];
    const b = value % 45;
    value = (value - b) / 45;
    out += BASE45_ALPHABET[b] + BASE45_ALPHABET[value];
  }
  return out;
}

export function base45Decode(text: string): Uint8Array {
  const digits: number[] = [];
  for (const char of text) {
    const index = BASE45_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('This is not a OneHook recovery code.');
    digits.push(index);
  }
  if (digits.length % 3 === 1) throw new Error('This recovery code is truncated.');

  const bytes: number[] = [];
  let i = 0;
  for (; i + 2 < digits.length; i += 3) {
    const value = digits[i] + digits[i + 1] * 45 + digits[i + 2] * 45 * 45;
    if (value > 0xffff) throw new Error('This recovery code is corrupt.');
    bytes.push(value >> 8, value & 0xff);
  }
  if (i < digits.length) {
    const value = digits[i] + digits[i + 1] * 45;
    if (value > 0xff) throw new Error('This recovery code is corrupt.');
    bytes.push(value);
  }
  return Uint8Array.from(bytes);
}

// ── Session material ────────────────────────────────────────────────────────────────────────────

/** Mints the 32-byte session challenge (base64) used as the HKDF salt. */
export function generateChallenge(): string {
  return toBase64(globalThis.crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES)));
}

/**
 * Generates the target device's single-use transfer key pair. The private key is NOT persisted and
 * NOT extractable — it lives only in the memory of the tab running the recovery, so a photographed
 * QR is useless to anyone else.
 */
export async function generateEphemeralKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKeySpki: string;
}> {
  const pair = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    privateKey: pair.privateKey,
    publicKeySpki: toBase64(await subtle().exportKey('spki', pair.publicKey)),
  };
}

/** SHA-256 fingerprint (lowercase hex) of a base64 SPKI public key, as published in the registry. */
export async function fingerprintPublicKey(spkiBase64: string): Promise<string> {
  if (!spkiBase64) throw new Error('A public key is required to compute a fingerprint.');
  const digest = await subtle().digest('SHA-256', fromBase64(spkiBase64) as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derives the 6-digit code shown on BOTH devices.
 *
 * This is the human's MITM detector. The target device computes it from the ephemeral public key it
 * generated; the source device computes it from the ephemeral public key it RECEIVED over AppSync.
 * A backend that swapped that key to mount a man-in-the-middle produces a different code on the two
 * screens, so the user aborts before any QR is displayed.
 */
export async function deriveVerificationCode(
  binding: RecoverySessionBinding,
  targetEphemeralPublicKeySpki: string
): Promise<string> {
  const digest = await subtle().digest(
    'SHA-256',
    concat(
      new TextEncoder().encode(CODE_INFO_PREFIX + binding.sessionId + '|'),
      fromBase64(binding.challenge),
      fromBase64(targetEphemeralPublicKeySpki),
      new TextEncoder().encode(`|${binding.sourceFingerprint}|${binding.targetFingerprint}`)
    ) as unknown as ArrayBuffer
  );
  const view = new DataView(digest);
  const modulus = 10 ** VERIFICATION_CODE_DIGITS;
  return String(view.getUint32(0) % modulus).padStart(VERIFICATION_CODE_DIGITS, '0');
}

/**
 * Derives the base64 SPKI PUBLIC key from a PKCS#8 ECDH PRIVATE key.
 *
 * WebCrypto has no "private key -> public key" operation, so the key is imported as extractable and
 * exported as a JWK, whose `x`/`y` members ARE the public point; that point is re-imported and
 * exported as SPKI.
 *
 * This is what lets the receiving device VERIFY a transferred key against the account-history public
 * key published in its own registry, before storing it. Without the check, a backend (or anyone able
 * to influence what gets scanned) could install a key that decrypts nothing and leave the user with a
 * transfer that reported success and fixed nothing.
 */
export async function derivePublicKeySpki(pkcs8: Uint8Array): Promise<string> {
  const privateKey = await subtle().importKey(
    'pkcs8',
    pkcs8 as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const jwk = (await subtle().exportKey('jwk', privateKey)) as JsonWebKey;
  if (!jwk.x || !jwk.y) throw new Error('The transferred key is not a valid P-256 key.');
  const publicKey = await subtle().importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  return toBase64(await subtle().exportKey('spki', publicKey));
}

// ── Envelope ────────────────────────────────────────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function kdfInfo(binding: RecoverySessionBinding): Uint8Array {
  return new TextEncoder().encode(
    `${KDF_INFO_PREFIX}${binding.sessionId}|${binding.sourceFingerprint}|${binding.targetFingerprint}|${binding.expiresAt}`
  );
}

function encodeTlv(bundle: RecoveryBundle): Uint8Array {
  const encoder = new TextEncoder();
  const items: Array<[number, Uint8Array]> = [
    [TLV_HISTORY_KEY_ID, encoder.encode(bundle.historyKeyId)],
    [TLV_HISTORY_PRIVATE_KEY, bundle.historyPrivateKey],
  ];
  return concat(
    ...items.map(([type, value]) => {
      if (value.length > 0xffff) throw new Error('A recovery key is too large to transfer.');
      const head = new Uint8Array(3);
      head[0] = type;
      head[1] = value.length >> 8;
      head[2] = value.length & 0xff;
      return concat(head, value);
    })
  );
}

function decodeTlv(bytes: Uint8Array): RecoveryBundle {
  let historyKeyId: string | undefined;
  let historyPrivateKey: Uint8Array | undefined;

  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 3 > bytes.length) throw new Error('The recovery payload is malformed.');
    const type = bytes[offset];
    const length = (bytes[offset + 1] << 8) | bytes[offset + 2];
    offset += 3;
    if (offset + length > bytes.length) throw new Error('The recovery payload is malformed.');
    const value = bytes.subarray(offset, offset + length);
    offset += length;

    switch (type) {
      case TLV_HISTORY_KEY_ID:
        historyKeyId = new TextDecoder().decode(value);
        break;
      case TLV_HISTORY_PRIVATE_KEY:
        historyPrivateKey = new Uint8Array(value);
        break;
      default:
        // Forward compatibility: a newer source device may add item types this build predates.
        // Unknown items are skipped rather than failing the whole transfer.
        break;
    }
  }

  if (!historyKeyId || !historyPrivateKey) {
    throw new Error('The recovery payload is missing the history key.');
  }
  return { historyKeyId, historyPrivateKey };
}

async function deriveTransferKey(
  binding: RecoverySessionBinding,
  secrets: ArrayBuffer[]
): Promise<CryptoKey> {
  const ikm = concat(...secrets.map((secret) => new Uint8Array(secret)));
  const hkdfKey = await subtle().importKey('raw', ikm as unknown as ArrayBuffer, 'HKDF', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: fromBase64(binding.challenge),
      info: kdfInfo(binding),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** ECDH shared secret (the X coordinate) between a local private key and a peer public key. */
async function agree(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
  return subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
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

/**
 * Verifies a scanned bundle against the account-history key published in the receiving device's own
 * registry, BEFORE any key is persisted.
 *
 * Both halves matter. The key id catches a bundle from a different account or a rotated key; the
 * derived public key catches a private key that simply is not the one the account's messages were
 * wrapped to. Skipping this would let a successful-looking transfer install a key that decrypts
 * nothing, which is worse than refusing: the user would believe recovery had happened.
 *
 * @throws with a user-facing message when the bundle does not match.
 */
export async function assertBundleMatchesRegistry(
  bundle: RecoveryBundle,
  canonical: { keyId?: string; publicKey?: string } | undefined
): Promise<void> {
  if (!bundle?.historyKeyId || !bundle.historyPrivateKey?.length) {
    throw new Error('The scanned code did not contain a history key.');
  }
  if (!canonical?.keyId || !canonical.publicKey) {
    throw new Error('Your account has no history key registered, so there is nothing to restore.');
  }
  if (canonical.keyId !== bundle.historyKeyId) {
    throw new Error('The scanned code is for a different history key. Try the transfer again.');
  }
  if ((await derivePublicKeySpki(bundle.historyPrivateKey)) !== canonical.publicKey) {
    throw new Error('The scanned key does not match your account’s history key.');
  }
}

function assertBinding(binding: RecoverySessionBinding): void {
  if (!binding.sessionId) throw new Error('A sessionId is required for key recovery.');
  if (!binding.challenge) throw new Error('A session challenge is required for key recovery.');
  if (fromBase64(binding.challenge).length !== CHALLENGE_BYTES) {
    throw new Error('The session challenge is the wrong size.');
  }
  if (!binding.expiresAt) throw new Error('A session expiry is required for key recovery.');
  if (!binding.sourceFingerprint || !binding.targetFingerprint) {
    throw new Error('Both device fingerprints are required for key recovery.');
  }
}

/**
 * Seals the bundle on the SOURCE device and returns the Base45 text to render as a QR code.
 *
 * @param sourceDevicePrivateKey the source device's long-term ECDH private key — authenticates the
 *        transfer, and never leaves the device.
 * @param targetEphemeralPublicKeySpki the base64 SPKI key the target minted for this session only.
 * @param targetDevicePublicKeySpki the target's REGISTERED device public key, read from the caller's
 *        own registry. Binding to it is what makes a swapped ephemeral key fail cryptographically.
 */
export async function sealRecoveryBundle(params: {
  bundle: RecoveryBundle;
  binding: RecoverySessionBinding;
  sourceDevicePrivateKey: CryptoKey;
  targetEphemeralPublicKeySpki: string;
  targetDevicePublicKeySpki: string;
  /** Epoch millis; defaults to now. Injectable so tests can prove expiry is enforced. */
  now?: number;
}): Promise<string> {
  const {
    bundle,
    binding,
    sourceDevicePrivateKey,
    targetEphemeralPublicKeySpki,
    targetDevicePublicKeySpki,
  } = params;
  assertBinding(binding);
  if (!bundle?.historyKeyId || !bundle?.historyPrivateKey?.length) {
    throw new Error('This device does not hold the history key, so it cannot transfer it.');
  }
  if (!targetDevicePublicKeySpki) {
    throw new Error('The receiving device’s registered key is required to seal a transfer.');
  }
  const now = params.now ?? Date.now();
  if (now >= binding.expiresAt) {
    throw new Error('This recovery request has expired. Ask the new device to try again.');
  }

  const targetEphemeralPublic = await importEcdhPublicKey(targetEphemeralPublicKeySpki);
  const targetDevicePublic = await importEcdhPublicKey(targetDevicePublicKeySpki);

  const sourceEphemeral = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;

  const zAuth = await agree(sourceDevicePrivateKey, targetEphemeralPublic);
  const zBind = await agree(sourceDevicePrivateKey, targetDevicePublic);
  const zFs = await agree(sourceEphemeral.privateKey, targetEphemeralPublic);

  const rawEphemeralPublic = new Uint8Array(
    await subtle().exportKey('raw', sourceEphemeral.publicKey)
  );
  if (rawEphemeralPublic.length !== RAW_PUBLIC_KEY_BYTES) {
    throw new Error('Unexpected ephemeral key encoding.');
  }

  const header = concat(
    MAGIC,
    Uint8Array.from([RECOVERY_PROTOCOL_VERSION]),
    rawEphemeralPublic
  );
  const info = kdfInfo(binding);
  const key = await deriveTransferKey(binding, [zAuth, zBind, zFs]);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: concat(info, header) },
    key,
    encodeTlv(bundle) as unknown as ArrayBuffer
  );

  return base45Encode(concat(header, nonce, new Uint8Array(ciphertext)));
}

/**
 * Opens a scanned QR on the TARGET device.
 *
 * @param sourceDevicePublicKeySpki the source device's public key as read from the caller's OWN
 *        device registry. This is what authenticates the sender: a bundle minted by anything other
 *        than that device fails the GCM tag check.
 * @param targetDevicePrivateKey this device's long-term registered private key. Required because the
 *        sender bound the transfer to it; without it, a bundle sealed to a substituted ephemeral key
 *        cannot be opened.
 */
export async function openRecoveryBundle(params: {
  scanned: string;
  binding: RecoverySessionBinding;
  targetEphemeralPrivateKey: CryptoKey;
  targetDevicePrivateKey: CryptoKey;
  sourceDevicePublicKeySpki: string;
  /** Epoch millis; defaults to now. Expired sessions are refused before any key is imported. */
  now?: number;
}): Promise<RecoveryBundle> {
  const {
    scanned,
    binding,
    targetEphemeralPrivateKey,
    targetDevicePrivateKey,
    sourceDevicePublicKeySpki,
  } = params;
  assertBinding(binding);
  const now = params.now ?? Date.now();
  if (now >= binding.expiresAt) {
    throw new Error('This recovery code has expired. Start the transfer again.');
  }

  const raw = base45Decode(scanned.trim());
  if (raw.length <= HEADER_BYTES + NONCE_BYTES) {
    throw new Error('This is not a OneHook recovery code.');
  }
  if (raw[0] !== MAGIC[0] || raw[1] !== MAGIC[1] || raw[2] !== MAGIC[2]) {
    throw new Error('This is not a OneHook recovery code.');
  }
  if (raw[MAGIC.length] !== RECOVERY_PROTOCOL_VERSION) {
    throw new Error(
      `This recovery code uses version ${raw[MAGIC.length]}, which this app cannot read. Update both devices.`
    );
  }

  const header = raw.subarray(0, HEADER_BYTES);
  const rawEphemeralPublic = raw.subarray(MAGIC.length + 1, HEADER_BYTES);
  const nonce = raw.subarray(HEADER_BYTES, HEADER_BYTES + NONCE_BYTES);
  const ciphertext = raw.subarray(HEADER_BYTES + NONCE_BYTES);

  const sourceStaticPublic = await importEcdhPublicKey(sourceDevicePublicKeySpki);
  const sourceEphemeralPublic = await subtle().importKey(
    'raw',
    rawEphemeralPublic as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Mirrors the sender's three agreements: ephemeral×sourceStatic, deviceStatic×sourceStatic,
  // ephemeral×sourceEphemeral.
  const zAuth = await agree(targetEphemeralPrivateKey, sourceStaticPublic);
  const zBind = await agree(targetDevicePrivateKey, sourceStaticPublic);
  const zFs = await agree(targetEphemeralPrivateKey, sourceEphemeralPublic);

  const key = await deriveTransferKey(binding, [zAuth, zBind, zFs]);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: concat(kdfInfo(binding), header),
      },
      key,
      ciphertext as unknown as ArrayBuffer
    );
  } catch {
    // Authentication failure: wrong session, wrong device, tampered payload, or a photographed QR
    // from a different transfer. There is no partial-success path.
    throw new Error(
      'This code could not be verified. Make sure you scanned the code shown on the device you selected, and try again.'
    );
  }

  return decodeTlv(new Uint8Array(plaintext));
}
