/**
 * Canonical evidence-bundle format for the web client (OneHook moderation Phase 2).
 *
 * The reporter's device decrypts the last-N chat locally and uploads a copy (docs/MODERATION.md §2).
 * iOS, Android and web MUST all produce BYTE-IDENTICAL canonical JSON so the SHA-256 the client
 * declares at presign matches the hash the server recomputes on complete and the admin viewer
 * recomputes on read.
 *
 * This is the web port of the portal reference implementation
 * (OneHookAdminPortal/features/moderation/api/evidence-bundle.ts). The ONLY difference is hashing:
 * the browser has no `node:crypto`, so SHA-256 is computed with the Web Crypto API (SubtleCrypto)
 * and is therefore asynchronous. The canonical string / escaping / sort logic is identical, and the
 * golden fixtures (features/moderation/contract-fixtures/*.json) are reused verbatim as test vectors.
 *
 * CANONICAL RULES (identical across platforms):
 *  - UTF-8 JSON, NO whitespace anywhere.
 *  - Object keys appear in a FIXED order (never alphabetical, never insertion order):
 *      top level : v, reportId, conversationId, window, messages, attachments
 *      window    : maxMessages, maxDays
 *      message   : messageId, sentAt, senderSide, text
 *  - `v` is the number 1; window.maxMessages / window.maxDays are JSON numbers (no quotes).
 *  - messages are sorted by sentAt (ISO-8601 UTC ms; lexicographic == chronological) then messageId
 *    (lexicographic by UTF-16 code unit). Sorting is applied canonically regardless of input order.
 *  - String escaping (STANDARD JSON, specified exactly so every platform agrees):
 *      escape only  "  and  \
 *      control chars < 0x20: use the short escapes \b \f \n \r \t; any OTHER control char is
 *        \u00XX with LOWERCASE hex (e.g. \u0000, \u001f).
 *      do NOT escape '/'; do NOT escape non-ASCII (emoji, accents travel as raw UTF-8); do NOT
 *        escape DEL (0x7f) or anything >= 0x20.
 */

/** The evidence window (docs/MODERATION.md §9.3): last 200 messages OR 30 days, whichever is smaller. */
export const EVIDENCE_WINDOW = { maxMessages: 200, maxDays: 30 } as const;

/** Bundle format version. Bump only with a documented migration; clients pin on it. */
export const BUNDLE_VERSION = 1 as const;

export type SenderSide = 'reporter' | 'reported';

export interface BundleMessage {
  messageId: string;
  /** ISO-8601 UTC with millisecond precision, e.g. "2026-10-26T12:34:56.789Z". */
  sentAt: string;
  senderSide: SenderSide;
  text: string;
}

export interface EvidenceWindow {
  maxMessages: number;
  maxDays: number;
}

export interface EvidenceBundle {
  v: typeof BUNDLE_VERSION;
  reportId: string;
  conversationId: string;
  window: EvidenceWindow;
  messages: BundleMessage[];
  attachments: string[];
}

export interface BundleInput {
  reportId: string;
  conversationId: string;
  messages: BundleMessage[];
  /** Defaults to EVIDENCE_WINDOW. */
  window?: EvidenceWindow;
  /** Opaque attachment refs (empty unless the reporter opted into media). Default []. */
  attachments?: string[];
}

const HEX = '0123456789abcdef';

/**
 * Escape a string per the canonical rules and wrap it in double quotes. Deliberately hand-written
 * (not JSON.stringify) so the contract is explicit and does not depend on any engine's escaping
 * choices; iOS / Android / the portal implement the identical routine.
 */
export function escapeCanonicalString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const u = s.charCodeAt(i);
    if (c === '"') out += '\\"';
    else if (c === '\\') out += '\\\\';
    else if (u === 0x08) out += '\\b';
    else if (u === 0x09) out += '\\t';
    else if (u === 0x0a) out += '\\n';
    else if (u === 0x0c) out += '\\f';
    else if (u === 0x0d) out += '\\r';
    else if (u < 0x20) out += '\\u00' + HEX[(u >> 4) & 0xf] + HEX[u & 0xf];
    else out += c;
  }
  return out + '"';
}

/** Canonical message order: sentAt then messageId, both lexicographic (UTF-16 code unit). */
export function sortMessages(messages: readonly BundleMessage[]): BundleMessage[] {
  return [...messages].sort((a, b) => {
    if (a.sentAt < b.sentAt) return -1;
    if (a.sentAt > b.sentAt) return 1;
    if (a.messageId < b.messageId) return -1;
    if (a.messageId > b.messageId) return 1;
    return 0;
  });
}

/** Build the fully-formed, canonically-ordered bundle object from loose input. */
export function buildBundle(input: BundleInput): EvidenceBundle {
  return {
    v: BUNDLE_VERSION,
    reportId: input.reportId,
    conversationId: input.conversationId,
    window: input.window
      ? { maxMessages: input.window.maxMessages, maxDays: input.window.maxDays }
      : { ...EVIDENCE_WINDOW },
    messages: sortMessages(input.messages),
    attachments: input.attachments ? [...input.attachments] : [],
  };
}

function isBundle(x: BundleInput | EvidenceBundle): x is EvidenceBundle {
  return (x as EvidenceBundle).v === BUNDLE_VERSION && 'window' in x && !!(x as EvidenceBundle).window;
}

/** The canonical JSON string (what gets hashed and uploaded). */
export function canonicalString(input: BundleInput | EvidenceBundle): string {
  const b = isBundle(input) ? input : buildBundle(input);
  const esc = escapeCanonicalString;
  const window = `{"maxMessages":${b.window.maxMessages},"maxDays":${b.window.maxDays}}`;
  const messages = sortMessages(b.messages)
    .map(
      (m) =>
        `{"messageId":${esc(m.messageId)},"sentAt":${esc(m.sentAt)},"senderSide":${esc(
          m.senderSide
        )},"text":${esc(m.text)}}`
    )
    .join(',');
  const attachments = (b.attachments ?? []).map((a) => esc(a)).join(',');
  return (
    `{"v":${BUNDLE_VERSION}` +
    `,"reportId":${esc(b.reportId)}` +
    `,"conversationId":${esc(b.conversationId)}` +
    `,"window":${window}` +
    `,"messages":[${messages}]` +
    `,"attachments":[${attachments}]}`
  );
}

/** Canonical bytes (UTF-8). This is exactly what the client PUTs to S3. */
export function canonicalBytes(input: BundleInput | EvidenceBundle): Uint8Array {
  return new TextEncoder().encode(canonicalString(input));
}

/** Byte length of the canonical bundle (the sizeBytes a client declares at presign). */
export function canonicalByteLength(input: BundleInput | EvidenceBundle): number {
  return canonicalBytes(input).length;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Convert a 64-char lowercase hex SHA-256 to the base64 S3 checksum header value. */
export function hexToBase64(hex: string): string {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('sha256 must be 64 lowercase hex chars');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytesToBase64(bytes);
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'Evidence hashing is unavailable: this environment has no Web Crypto API (a secure HTTPS context is required).'
    );
  }
  return api;
}

/** Raw SHA-256 digest of the canonical bytes. */
export async function bundleSha256(input: BundleInput | EvidenceBundle): Promise<Uint8Array> {
  const bytes = canonicalBytes(input);
  const digest = await subtle().digest('SHA-256', bytes as unknown as ArrayBuffer);
  return new Uint8Array(digest);
}

/** SHA-256 of the canonical bytes, lowercase hex (the `sha256` field at presign). */
export async function bundleSha256Hex(input: BundleInput | EvidenceBundle): Promise<string> {
  return bytesToHex(await bundleSha256(input));
}

/** SHA-256 of the canonical bytes, base64 (the x-amz-checksum-sha256 header value S3 enforces). */
export async function bundleSha256Base64(input: BundleInput | EvidenceBundle): Promise<string> {
  return bytesToBase64(await bundleSha256(input));
}
