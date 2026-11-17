/**
 * Structured chat content: current location, live location and contact cards.
 *
 * The contract is OneHookBackend/docs/chat-location-contact.md. Like attachments
 * (`chat-attachments.ts`, frame byte 0x01) and call signals (`call-signal.ts`, 0x02), structured content
 * rides inside the existing E2EE message plaintext:
 *
 *   plaintext = 0x03 || UTF8( JSON(payload) )
 *
 * Coordinates, place names, addresses and contact details exist only here, inside the sealed payload.
 * The backend never sees them: these messages are sent with `contentType: TEXT`.
 *
 * Decoding rules (the doc's, byte for byte):
 *  - an unknown `type`, or `v` greater than 1, decodes to `unsupported` ("Update OneHook to view this");
 *  - malformed JSON or a payload missing a required field also decodes to `unsupported`, never to text;
 *  - unknown fields are ignored: only known fields are copied out.
 *
 * Pure and DOM-free so it is unit-testable under Node.
 */

/** Discriminator byte for structured content. 0x02 belongs to call signals, so this is its own byte. */
export const STRUCTURED_FRAME_BYTE = 0x03;

/** The only payload version this build reads. A higher one means "update the app". */
export const STRUCTURED_CONTENT_VERSION = 1;

/** Contact thumbnails ride inside the message item, so senders cap them at 24 KB of base64. */
export const MAX_CONTACT_THUMBNAIL_BASE64 = 24 * 1024;

/** Coordinates carry at most 6 decimals (about 11 cm); anything finer is noise. */
const COORDINATE_DECIMALS = 6;

/** Same shape the backend enforces for `sessionId` (a UUID in practice). */
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Display caps. A peer controls these strings, so a pathological payload must not blow up a bubble. */
const MAX_TEXT_FIELD = 256;
const MAX_ADDRESS_FIELD = 512;
const MAX_CONTACT_ENTRIES = 20;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export interface LocationContent {
  type: 'location';
  lat: number;
  lon: number;
  /** Horizontal accuracy in metres. */
  accuracyM?: number;
  /** Present when the sender picked a place instead of the raw pin. */
  name?: string;
  address?: string;
  capturedAt?: number;
}

export interface LiveLocationContent {
  type: 'live_location';
  sessionId: string;
  startedAt: number;
  expiresAt: number;
  lat: number;
  lon: number;
  accuracyM?: number;
}

export interface ContactEntry {
  label?: string;
  value: string;
}

export interface ContactContent {
  type: 'contact';
  displayName: string;
  givenName?: string;
  familyName?: string;
  organization?: string;
  phones: ContactEntry[];
  emails: ContactEntry[];
  /** Base64 JPEG, at most {@link MAX_CONTACT_THUMBNAIL_BASE64} characters. Dropped when invalid. */
  thumbnailBase64?: string;
}

/** A frame this build cannot render: unknown type, newer version, or malformed. */
export interface UnsupportedContent {
  type: 'unsupported';
}

/** What a 0x03 chat message decodes to. */
export type StructuredContent =
  | LocationContent
  | LiveLocationContent
  | ContactContent
  | UnsupportedContent;

/** The decrypted `ciphertext` of a `publishLiveLocation` update. Never a chat message. */
export interface LiveLocationUpdateContent {
  type: 'live_location_update';
  sessionId: string;
  lat: number;
  lon: number;
  accuracyM?: number;
  headingDeg?: number;
  speedMps?: number;
  at: number;
}

const UNSUPPORTED: UnsupportedContent = { type: 'unsupported' };

/** True when a decrypted plaintext is a structured-content frame. */
export function isStructuredFrame(plaintext: string): boolean {
  // U+0003 encodes to the single byte 0x03 under UTF-8, so the first UTF-16 code unit is enough.
  return plaintext.charCodeAt(0) === STRUCTURED_FRAME_BYTE;
}

/** Produces a framed plaintext: `0x03 || JSON(payload)`. Sealed afterwards like any message body. */
export function frameStructuredContent(payload: Record<string, unknown>): string {
  return String.fromCharCode(STRUCTURED_FRAME_BYTE) + JSON.stringify(payload);
}

/** Rounds to the contract's 6 decimals. */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

// ── Senders ──────────────────────────────────────────────────────────────────
//
// The builders below produce exactly the contract's JSON (chat-location-contact.md, "Payloads"):
// coordinates rounded to 6 decimals, optional fields omitted rather than null, `v: 1`. They throw on
// a coordinate out of range: sending a pin nobody can open is a bug, not something to round away.

/** One position fix from the device, in the units the payloads carry. `at` is epoch ms. */
export interface LocationFix {
  lat: number;
  lon: number;
  accuracyM?: number;
  headingDeg?: number;
  speedMps?: number;
  at: number;
}

function requireCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  const la = latitude(lat);
  const lo = longitude(lon);
  if (la === null || lo === null) throw new Error('A location needs a valid latitude and longitude.');
  return { lat: la, lon: lo };
}

/** Accuracy is whole-ish metres on the wire; a negative or NaN value means "unknown" and is omitted. */
function wireAccuracy(value: number | undefined): number | undefined {
  const v = nonNegative(value);
  return v === undefined ? undefined : Math.round(v * 10) / 10;
}

/** The `location` message for the device's current position (web never sends a named place). */
export function buildLocationPayload(fix: LocationFix): Record<string, unknown> {
  const { lat, lon } = requireCoordinates(fix.lat, fix.lon);
  const out: Record<string, unknown> = { v: STRUCTURED_CONTENT_VERSION, type: 'location', lat, lon };
  const accuracyM = wireAccuracy(fix.accuracyM);
  if (accuracyM !== undefined) out.accuracyM = accuracyM;
  out.capturedAt = Math.round(fix.at);
  return out;
}

/** The `live_location` message that starts a share (its bubble; later positions move its pin). */
export function buildLiveLocationStartPayload(start: {
  sessionId: string;
  startedAt: number;
  expiresAt: number;
  fix: LocationFix;
}): Record<string, unknown> {
  if (!sessionId(start.sessionId)) throw new Error('A live share needs a valid sessionId.');
  if (!(start.expiresAt > start.startedAt)) throw new Error('A live share must end after it starts.');
  const { lat, lon } = requireCoordinates(start.fix.lat, start.fix.lon);
  const out: Record<string, unknown> = {
    v: STRUCTURED_CONTENT_VERSION,
    type: 'live_location',
    sessionId: start.sessionId,
    startedAt: Math.round(start.startedAt),
    expiresAt: Math.round(start.expiresAt),
    lat,
    lon,
  };
  const accuracyM = wireAccuracy(start.fix.accuracyM);
  if (accuracyM !== undefined) out.accuracyM = accuracyM;
  return out;
}

/** The `live_location_update` sealed into `publishLiveLocation`'s ciphertext. Never a chat message. */
export function buildLiveLocationUpdatePayload(sessionIdValue: string, fix: LocationFix): Record<string, unknown> {
  if (!sessionId(sessionIdValue)) throw new Error('A live update needs a valid sessionId.');
  const { lat, lon } = requireCoordinates(fix.lat, fix.lon);
  const out: Record<string, unknown> = {
    v: STRUCTURED_CONTENT_VERSION,
    type: 'live_location_update',
    sessionId: sessionIdValue,
    lat,
    lon,
  };
  const accuracyM = wireAccuracy(fix.accuracyM);
  if (accuracyM !== undefined) out.accuracyM = accuracyM;
  if (finite(fix.headingDeg) && fix.headingDeg >= 0 && fix.headingDeg < 360) {
    // 359.6 rounds to 360, which the decoder rejects: wrap it to 0 (north) instead.
    out.headingDeg = Math.round(fix.headingDeg) % 360;
  }
  const speedMps = nonNegative(fix.speedMps);
  if (speedMps !== undefined) out.speedMps = Math.round(speedMps * 10) / 10;
  out.at = Math.round(fix.at);
  return out;
}

/**
 * The `contact` message. Only the phones and emails passed in are sent (the caller applies the
 * member's selection first). Blank entries are dropped, strings are cleaned the same way the decoder
 * cleans them, and a thumbnail over 24 KB of base64 (or not base64) is dropped rather than sent.
 * Throws when nothing identifies the contact (no name, phone or email).
 */
export function buildContactPayload(contact: {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  organization?: string;
  phones: ContactEntry[];
  emails: ContactEntry[];
  thumbnailBase64?: string;
}): Record<string, unknown> {
  const givenName = text(contact.givenName);
  const familyName = text(contact.familyName);
  const organization = text(contact.organization);
  const phones = contactEntries(contact.phones);
  const emails = contactEntries(contact.emails);
  const displayName =
    text(contact.displayName) ||
    text([givenName, familyName].filter(Boolean).join(' ')) ||
    organization ||
    phones[0]?.value ||
    emails[0]?.value;
  if (!displayName) throw new Error('A contact needs a name, a phone number or an email address.');
  const out: Record<string, unknown> = { v: STRUCTURED_CONTENT_VERSION, type: 'contact', displayName };
  if (givenName) out.givenName = givenName;
  if (familyName) out.familyName = familyName;
  if (organization) out.organization = organization;
  out.phones = phones;
  out.emails = emails;
  const thumb = thumbnail(contact.thumbnailBase64);
  if (thumb) out.thumbnailBase64 = thumb;
  return out;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function latitude(value: unknown): number | null {
  return finite(value) && value >= -90 && value <= 90 ? roundCoordinate(value) : null;
}

function longitude(value: unknown): number | null {
  return finite(value) && value >= -180 && value <= 180 ? roundCoordinate(value) : null;
}

function nonNegative(value: unknown): number | undefined {
  return finite(value) && value >= 0 ? value : undefined;
}

function timestamp(value: unknown): number | null {
  return finite(value) && value > 0 ? value : null;
}

/** Strips control characters (a peer could embed them to garble the UI) and trims; empty → undefined. */
function text(value: unknown, max = MAX_TEXT_FIELD): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

function sessionId(value: unknown): string | null {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value) ? value : null;
}

function contactEntries(value: unknown): ContactEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ContactEntry[] = [];
  for (const raw of value) {
    if (out.length >= MAX_CONTACT_ENTRIES) break;
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const v = text(entry.value);
    if (!v) continue;
    const label = text(entry.label, 64);
    out.push(label ? { label, value: v } : { value: v });
  }
  return out;
}

function thumbnail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (value.length > MAX_CONTACT_THUMBNAIL_BASE64) return undefined;
  return BASE64_PATTERN.test(value) ? value : undefined;
}

/** Parses the JSON body of a frame into a plain object, or null when it is not one. */
function parseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** `v` must be a positive integer this build knows. Missing or newer both mean "cannot render". */
function supportedVersion(raw: Record<string, unknown>): boolean {
  return raw.v === STRUCTURED_CONTENT_VERSION;
}

function parseLocation(raw: Record<string, unknown>): LocationContent | null {
  const lat = latitude(raw.lat);
  const lon = longitude(raw.lon);
  if (lat === null || lon === null) return null;
  const out: LocationContent = { type: 'location', lat, lon };
  const accuracyM = nonNegative(raw.accuracyM);
  if (accuracyM !== undefined) out.accuracyM = accuracyM;
  const name = text(raw.name);
  if (name) out.name = name;
  const address = text(raw.address, MAX_ADDRESS_FIELD);
  if (address) out.address = address;
  const capturedAt = timestamp(raw.capturedAt);
  if (capturedAt !== null) out.capturedAt = capturedAt;
  return out;
}

function parseLiveLocation(raw: Record<string, unknown>): LiveLocationContent | null {
  const id = sessionId(raw.sessionId);
  const startedAt = timestamp(raw.startedAt);
  const expiresAt = timestamp(raw.expiresAt);
  const lat = latitude(raw.lat);
  const lon = longitude(raw.lon);
  if (!id || startedAt === null || expiresAt === null || lat === null || lon === null) return null;
  const out: LiveLocationContent = { type: 'live_location', sessionId: id, startedAt, expiresAt, lat, lon };
  const accuracyM = nonNegative(raw.accuracyM);
  if (accuracyM !== undefined) out.accuracyM = accuracyM;
  return out;
}

function parseContact(raw: Record<string, unknown>): ContactContent | null {
  const givenName = text(raw.givenName);
  const familyName = text(raw.familyName);
  const organization = text(raw.organization);
  const displayName =
    text(raw.displayName) ||
    text([givenName, familyName].filter(Boolean).join(' ')) ||
    organization;
  const phones = contactEntries(raw.phones);
  const emails = contactEntries(raw.emails);
  // A card with no name and nothing to reach is not a contact.
  if (!displayName && phones.length === 0 && emails.length === 0) return null;
  const out: ContactContent = {
    type: 'contact',
    displayName: displayName || phones[0]?.value || emails[0]?.value || '',
    phones,
    emails,
  };
  if (givenName) out.givenName = givenName;
  if (familyName) out.familyName = familyName;
  if (organization) out.organization = organization;
  const thumb = thumbnail(raw.thumbnailBase64);
  if (thumb) out.thumbnailBase64 = thumb;
  return out;
}

/**
 * Decodes a structured-content frame (the plaintext INCLUDING its 0x03 byte). Returns null when the
 * plaintext is not a 0x03 frame at all, so callers can fall through to attachments or text.
 */
export function decodeStructuredFrame(plaintext: string): StructuredContent | null {
  if (!isStructuredFrame(plaintext)) return null;
  const raw = parseObject(plaintext.slice(1));
  if (!raw || !supportedVersion(raw)) return UNSUPPORTED;
  switch (raw.type) {
    case 'location':
      return parseLocation(raw) ?? UNSUPPORTED;
    case 'live_location':
      return parseLiveLocation(raw) ?? UNSUPPORTED;
    case 'contact':
      return parseContact(raw) ?? UNSUPPORTED;
    default:
      // Includes `live_location_update`: that payload is only valid as a publishLiveLocation body.
      return UNSUPPORTED;
  }
}

/**
 * Parses the decrypted `ciphertext` of a live-location update. Returns null unless it is a valid
 * v1 `live_location_update` for `expectedSessionId`: a sealed payload claiming a different session than
 * the row it arrived on is ignored, so it can never move another share's pin.
 */
export function parseLiveLocationUpdate(
  plaintext: string,
  expectedSessionId: string
): LiveLocationUpdateContent | null {
  if (!isStructuredFrame(plaintext)) return null;
  const raw = parseObject(plaintext.slice(1));
  if (!raw || !supportedVersion(raw) || raw.type !== 'live_location_update') return null;
  const id = sessionId(raw.sessionId);
  const lat = latitude(raw.lat);
  const lon = longitude(raw.lon);
  const at = timestamp(raw.at);
  if (!id || id !== expectedSessionId || lat === null || lon === null || at === null) return null;
  const out: LiveLocationUpdateContent = { type: 'live_location_update', sessionId: id, lat, lon, at };
  const accuracyM = nonNegative(raw.accuracyM);
  if (accuracyM !== undefined) out.accuracyM = accuracyM;
  if (finite(raw.headingDeg) && raw.headingDeg >= 0 && raw.headingDeg < 360) out.headingDeg = raw.headingDeg;
  const speedMps = nonNegative(raw.speedMps);
  if (speedMps !== undefined) out.speedMps = speedMps;
  return out;
}
