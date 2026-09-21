/**
 * OneHook chat attachments — plaintext framing, envelope, and per-attachment file crypto.
 *
 * Attachments reuse the EXISTING E2EE message channel: an attachment is nothing more than a
 * particular kind of message plaintext. The bytes that go through `ChatEncryptionManager.encrypt`
 * (and come back out of `decrypt`) are framed so the same channel can carry both legacy text and
 * attachments without a schema change and without a coordinated three-platform cut-over:
 *
 *   frame = 0x01 || UTF8( JSON(envelope) )     -> an attachment
 *   frame = <anything else>                     -> a plain-text message (the whole string is the body)
 *
 * 0x01 is the discriminator because it cannot be typed, so a user who writes a message that merely
 * *looks* like JSON is never misread as an attachment, and every pre-attachment message still decodes
 * as text. This is the byte-for-byte contract that iOS, Android and web all implement — see
 * OneHookBackend/docs/chat-attachments.md, which is frozen. Do not rename a field or change the frame
 * byte here without changing it there, or a message sent from one platform becomes undecodable on
 * another.
 *
 * The FILE bytes themselves are encrypted separately from the message envelope: each attachment gets a
 * fresh random AES-256-GCM key + nonce, the ciphertext (tag included) is what gets uploaded to S3, and
 * the key rides ONLY inside this envelope — never to the backend, never to a log. The server therefore
 * stores bytes it cannot read, exactly as it already does for message text.
 *
 * This module is intentionally free of DOM/network dependencies (only Web Crypto + base64) so it is
 * unit-testable under Node and safe to import from anywhere. Upload/download transport lives in
 * `attachment-transport.ts`; browser-only probing (dimensions, thumbnails, waveforms) in
 * `attachment-media.ts`.
 */

import { fromBase64, toBase64 } from './chat-wire-v2';

/** Discriminator byte: a decoded message whose first byte is this is an attachment envelope. */
export const ATTACHMENT_FRAME_BYTE = 0x01;

/** The only envelope version this build produces and reads. A higher version means "update the app". */
export const ATTACHMENT_ENVELOPE_VERSION = 1;

/**
 * Maximum ciphertext size the upload endpoint will sign for. The presigned PUT URL is bound to an
 * exact Content-Length, so anything larger MUST be rejected on the client, before an upload URL is
 * even requested — otherwise the user waits through a doomed request. This is the ciphertext length
 * (plaintext + the 16-byte GCM tag), because that is what actually crosses the wire.
 */
export const MAX_CIPHERTEXT_BYTES = 104_882_176;

/** Waveform is capped so it fits inside the message DynamoDB item (shared 400 KB budget). */
export const MAX_WAVEFORM_BUCKETS = 64;

/** Waveform amplitudes are quantised to 0–31 so a bucket is a compact 5-bit value on every platform. */
export const WAVEFORM_MAX_AMPLITUDE = 31;

/** Thumbnail base64 is capped at 12 KB for the same DynamoDB-item reason. */
export const MAX_THUMBNAIL_BASE64_BYTES = 12 * 1024;

const CONTENT_KEY_BYTES = 32;
const NONCE_BYTES = 12;

/** Renders which bubble the receiver draws; also constrains which metadata fields are meaningful. */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

const ATTACHMENT_KINDS: readonly AttachmentKind[] = ['image', 'video', 'audio', 'file'];

/**
 * The attachment envelope, exactly as it is serialised into the framed plaintext.
 *
 * Optional fields are populated per kind (duration for audio/video, dimensions for image/video,
 * waveform for audio, thumbnail for image/video). Unknown fields seen on the wire are IGNORED on
 * decode so the envelope can grow a field without a lock-step release of all three clients.
 */
export interface AttachmentEnvelope {
  v: number;
  kind: AttachmentKind;
  /** S3 key, always "<matchId>/<uuid>" — the download endpoint rejects a key from another match. */
  objectKey: string;
  /** base64 of the 32-byte AES-256-GCM content key. NEVER logged, NEVER sent outside this envelope. */
  contentKey: string;
  /** base64 of the 12-byte AES-GCM nonce for the file ciphertext. */
  nonce: string;
  mime: string;
  /** Original filename, used for `file` bubbles and for the download filename. */
  name: string;
  /** Plaintext byte length, for the progress bar and a decode sanity check. */
  size: number;
  durationMs?: number;
  width?: number;
  height?: number;
  /** Audio only: at most 64 amplitude buckets, each 0–31. */
  waveform?: number[];
  /** Image + video only: base64 JPEG, ≤ 12 KB, so the bubble paints before the full download. */
  thumbnail?: string;
  /** Shown under the media; also the accessible-label fallback when no better text exists. */
  caption?: string;
}

/** A decoded message body: either legacy plain text or a parsed attachment envelope. */
export type DecodedMessage =
  | { type: 'text'; text: string }
  | { type: 'attachment'; envelope: AttachmentEnvelope };

/**
 * Raised when a frame IS an attachment (0x01) but the envelope cannot be understood — malformed JSON,
 * a missing required field, or a future version. Callers MUST surface this as a failed/unsupported
 * attachment bubble rather than letting it bubble up as a crash: the contract requires that a client
 * meeting an attachment it cannot render degrades gracefully instead of taking down the conversation.
 */
export class AttachmentDecodeError extends Error {
  readonly code = 'ATTACHMENT_DECODE_ERROR';
  /** True when the failure is specifically a too-new envelope version, which "update the app" fixes. */
  readonly unsupportedVersion: boolean;

  constructor(message: string, unsupportedVersion = false) {
    super(message);
    this.name = 'AttachmentDecodeError';
    this.unsupportedVersion = unsupportedVersion;
  }
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'Attachment encryption is unavailable: this environment has no Web Crypto API (a secure HTTPS context is required).'
    );
  }
  return api;
}

/** True when a decoded message plaintext is an attachment frame rather than legacy text. */
export function isAttachmentFrame(plaintext: string): boolean {
  // charCodeAt reads the first UTF-16 code unit; U+0001 encodes to the single byte 0x01 under UTF-8,
  // so this matches the byte-level contract without materialising the whole string as bytes.
  return plaintext.charCodeAt(0) === ATTACHMENT_FRAME_BYTE;
}

/**
 * Produces the framed plaintext for an attachment: the 0x01 byte followed by the envelope JSON.
 *
 * Plain `JSON.stringify` (not canonical JSON) is deliberate: unlike the wire-v2 envelope, this JSON is
 * never authenticated or compared byte-for-byte across platforms — the receiver parses it and reads
 * the fields it knows. Key order is therefore irrelevant, and forcing a canonical form here would only
 * invite the false belief that it matters.
 */
export function frameAttachment(envelope: AttachmentEnvelope): string {
  return String.fromCharCode(ATTACHMENT_FRAME_BYTE) + JSON.stringify(envelope);
}

/**
 * Decodes a message plaintext into either text or an attachment envelope.
 *
 * A non-attachment frame is returned verbatim as text — this is what keeps every pre-attachment
 * message (and any message a user typed that happens to start with other bytes) rendering unchanged.
 *
 * @throws {AttachmentDecodeError} when the frame is an attachment but the envelope is unreadable.
 */
export function decodeMessagePlaintext(plaintext: string): DecodedMessage {
  if (!isAttachmentFrame(plaintext)) {
    return { type: 'text', text: plaintext };
  }
  return { type: 'attachment', envelope: parseAttachmentEnvelope(plaintext.slice(1)) };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AttachmentDecodeError(`Attachment envelope is missing "${field}".`);
  }
  return value;
}

/**
 * Parses and validates the envelope JSON, copying ONLY known fields.
 *
 * Copying known fields (rather than spreading the parsed object) is how unknown future fields are
 * ignored: they simply never make it into the returned envelope, so this build neither trusts nor
 * echoes data it does not understand.
 *
 * @throws {AttachmentDecodeError} for malformed JSON, a missing required field, an unknown kind, or a
 *         version this build is too old to read.
 */
export function parseAttachmentEnvelope(json: string): AttachmentEnvelope {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new AttachmentDecodeError('Attachment envelope is not valid JSON.');
  }
  if (raw === null || typeof raw !== 'object') {
    throw new AttachmentDecodeError('Attachment envelope is not an object.');
  }

  const version = typeof raw.v === 'number' ? raw.v : NaN;
  if (version > ATTACHMENT_ENVELOPE_VERSION) {
    // A too-new envelope is the one failure "update the app" actually fixes, so it is flagged
    // distinctly rather than lumped in with genuinely corrupt data.
    throw new AttachmentDecodeError(
      'This attachment was sent from a newer version of the app. Update to view it.',
      true
    );
  }
  if (version !== ATTACHMENT_ENVELOPE_VERSION) {
    throw new AttachmentDecodeError(`Unsupported attachment envelope version ${raw.v}.`);
  }

  const kind = raw.kind;
  if (typeof kind !== 'string' || !ATTACHMENT_KINDS.includes(kind as AttachmentKind)) {
    throw new AttachmentDecodeError(`Unknown attachment kind "${String(kind)}".`);
  }

  const envelope: AttachmentEnvelope = {
    v: ATTACHMENT_ENVELOPE_VERSION,
    kind: kind as AttachmentKind,
    objectKey: requireString(raw.objectKey, 'objectKey'),
    contentKey: requireString(raw.contentKey, 'contentKey'),
    nonce: requireString(raw.nonce, 'nonce'),
    mime: requireString(raw.mime, 'mime'),
    name: requireString(raw.name, 'name'),
    size: typeof raw.size === 'number' && raw.size >= 0 ? raw.size : 0,
  };

  if (typeof raw.durationMs === 'number' && raw.durationMs >= 0) envelope.durationMs = raw.durationMs;
  if (typeof raw.width === 'number' && raw.width > 0) envelope.width = raw.width;
  if (typeof raw.height === 'number' && raw.height > 0) envelope.height = raw.height;
  if (typeof raw.thumbnail === 'string' && raw.thumbnail.length > 0) envelope.thumbnail = raw.thumbnail;
  if (typeof raw.caption === 'string' && raw.caption.length > 0) envelope.caption = raw.caption;
  if (Array.isArray(raw.waveform)) {
    // Defensive clamp: a peer (or a future/misbehaving client) could exceed the caps, and the renderer
    // must never be handed an over-long or out-of-range bucket set.
    envelope.waveform = raw.waveform
      .slice(0, MAX_WAVEFORM_BUCKETS)
      .map((n) => {
        const value = typeof n === 'number' ? Math.round(n) : 0;
        return Math.max(0, Math.min(WAVEFORM_MAX_AMPLITUDE, value));
      });
  }

  return envelope;
}

/**
 * Rejects an over-large attachment BEFORE any upload URL is requested.
 *
 * @throws a user-facing Error naming the limit in whole MB — this message is shown to the user, so it
 *         must read as a limit, not as an internal byte count.
 */
export function assertCiphertextWithinLimit(ciphertextByteLength: number): void {
  if (ciphertextByteLength > MAX_CIPHERTEXT_BYTES) {
    const limitMb = Math.floor(MAX_CIPHERTEXT_BYTES / (1024 * 1024));
    throw new Error(`That file is too large to send. The limit is ${limitMb} MB.`);
  }
}

/** A fresh, never-reused content key. Reuse under AES-GCM leaks the keystream — see the contract. */
export function generateContentKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(CONTENT_KEY_BYTES));
}

/** A fresh per-attachment nonce. */
export function generateNonce(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
}

/**
 * AES-256-GCM encrypts file bytes. The returned ciphertext INCLUDES the 16-byte GCM tag (WebCrypto's
 * default), which is exactly what gets uploaded — the receiver authenticates against that tag, so a
 * truncated or tampered object fails to open rather than decoding to garbage.
 */
export async function encryptAttachmentBytes(
  plaintext: Uint8Array,
  contentKey: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', contentKey as unknown as ArrayBuffer, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer },
    key,
    plaintext as unknown as ArrayBuffer
  );
  return new Uint8Array(ciphertext);
}

/**
 * AES-256-GCM decrypts file bytes. GCM authentication means a wrong key/nonce or any tampering rejects
 * with a thrown error; there is no "partial" or "garbage" success to guard against downstream.
 */
export async function decryptAttachmentBytes(
  ciphertext: Uint8Array,
  contentKey: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', contentKey as unknown as ArrayBuffer, 'AES-GCM', false, [
    'decrypt',
  ]);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer },
    key,
    ciphertext as unknown as ArrayBuffer
  );
  return new Uint8Array(plaintext);
}

/** The output of encrypting an attachment: what to upload, plus the key material for the envelope. */
export interface EncryptedAttachment {
  ciphertext: Uint8Array;
  contentKey: Uint8Array;
  nonce: Uint8Array;
}

/**
 * Convenience one-shot: generates a fresh key + nonce and encrypts the bytes. The caller uploads
 * `ciphertext` and base64-encodes `contentKey`/`nonce` into the envelope with {@link encodeKeyMaterial}.
 */
export async function encryptAttachment(plaintext: Uint8Array): Promise<EncryptedAttachment> {
  const contentKey = generateContentKey();
  const nonce = generateNonce();
  const ciphertext = await encryptAttachmentBytes(plaintext, contentKey, nonce);
  return { ciphertext, contentKey, nonce };
}

/** base64-encodes the key + nonce for placement in an envelope. */
export function encodeKeyMaterial(contentKey: Uint8Array, nonce: Uint8Array): {
  contentKey: string;
  nonce: string;
} {
  return { contentKey: toBase64(contentKey), nonce: toBase64(nonce) };
}

/** Decrypts an already-downloaded ciphertext using the base64 key material from an envelope. */
export async function decryptAttachmentFromEnvelope(
  ciphertext: Uint8Array,
  envelope: AttachmentEnvelope
): Promise<Uint8Array> {
  return decryptAttachmentBytes(ciphertext, fromBase64(envelope.contentKey), fromBase64(envelope.nonce));
}
