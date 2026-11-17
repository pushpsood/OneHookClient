/**
 * Sending a contact card from the web (OneHookBackend/docs/chat-location-contact.md, "Contact").
 *
 * Two sources feed the same review step:
 *  - the Contact Picker API (`navigator.contacts.select`), where the browser has it (Chrome on Android);
 *  - a small form (name required, any number of phones and emails) everywhere else.
 *
 * The member then chooses which phones and emails to include (all by default) and the card is sent as
 * an ordinary E2EE message (`buildContactPayload` + `frameStructuredContent`). Nothing here talks to a
 * network or touches the DOM, so it is unit-testable under Node.
 */
import { MAX_CONTACT_THUMBNAIL_BASE64, buildContactPayload, type ContactEntry } from './chat-structured';

/** The decoder keeps at most this many phones / emails, so the sender never offers more. */
export const MAX_CONTACT_FIELDS = 20;
/** Same display cap the decoder applies to every string. */
export const MAX_CONTACT_TEXT = 256;

/** A contact as the member is about to share it, before field selection. */
export interface ContactDraft {
  displayName: string;
  givenName?: string;
  familyName?: string;
  organization?: string;
  phones: ContactEntry[];
  emails: ContactEntry[];
  thumbnailBase64?: string;
}

/** Which of the draft's phones and emails go out, by index. */
export interface ContactSelection {
  phones: boolean[];
  emails: boolean[];
}

/** Everything is included until the member unticks it. */
export function selectAll(draft: ContactDraft): ContactSelection {
  return { phones: draft.phones.map(() => true), emails: draft.emails.map(() => true) };
}

/** The payload for the draft with only the selected phones and emails. */
export function buildSelectedContactPayload(draft: ContactDraft, selection: ContactSelection): Record<string, unknown> {
  return buildContactPayload({
    displayName: draft.displayName,
    givenName: draft.givenName,
    familyName: draft.familyName,
    organization: draft.organization,
    phones: draft.phones.filter((_, i) => selection.phones[i] !== false),
    emails: draft.emails.filter((_, i) => selection.emails[i] !== false),
    thumbnailBase64: draft.thumbnailBase64,
  });
}

// ── The manual form ──────────────────────────────────────────────────────────

/** Raw form state: the phone and email lists always end with one empty row to type into. */
export interface ContactFormValues {
  name: string;
  organization: string;
  phones: string[];
  emails: string[];
}

export const EMPTY_CONTACT_FORM: ContactFormValues = { name: '', organization: '', phones: [''], emails: [''] };

export interface ContactFormErrors {
  name?: string;
  /** Per row, aligned with `values.phones`. */
  phones: (string | undefined)[];
  emails: (string | undefined)[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits plus the usual separators, an optional leading +, and a sane digit count. */
const PHONE_CHARS = /^\+?[0-9 ()./-]+$/;

export function isPlausiblePhone(value: string): boolean {
  const v = value.trim();
  if (!PHONE_CHARS.test(v)) return false;
  const digits = v.replace(/\D/g, '').length;
  return digits >= 3 && digits <= 17;
}

export function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= MAX_CONTACT_TEXT && EMAIL_PATTERN.test(v);
}

/**
 * Keeps exactly one trailing empty row (so a new row appears as soon as the last one is filled, with
 * no "add" button), drops empty rows in the middle, and caps the list at {@link MAX_CONTACT_FIELDS}.
 */
export function normalizeRows(rows: string[]): string[] {
  // Only truly empty rows go: a row holding just a space is one the member is still typing in.
  const filled = rows.filter((r) => r !== '').slice(0, MAX_CONTACT_FIELDS);
  return filled.length < MAX_CONTACT_FIELDS ? [...filled, ''] : filled;
}

/** Validates the form. Empty rows are ignored; the name is required. */
export function validateContactForm(values: ContactFormValues): { valid: boolean; errors: ContactFormErrors } {
  const errors: ContactFormErrors = { phones: values.phones.map(() => undefined), emails: values.emails.map(() => undefined) };
  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name';
  else if (name.length > MAX_CONTACT_TEXT) errors.name = 'That name is too long';
  values.phones.forEach((p, i) => {
    if (p.trim() && !isPlausiblePhone(p)) errors.phones[i] = 'Enter a valid phone number';
  });
  values.emails.forEach((e, i) => {
    if (e.trim() && !isPlausibleEmail(e)) errors.emails[i] = 'Enter a valid email address';
  });
  const valid = !errors.name && errors.phones.every((e) => !e) && errors.emails.every((e) => !e);
  return { valid, errors };
}

/** A valid form as a draft (call {@link validateContactForm} first). */
export function draftFromForm(values: ContactFormValues): ContactDraft {
  const name = values.name.trim();
  const organization = values.organization.trim();
  const draft: ContactDraft = {
    displayName: name,
    phones: values.phones.map((p) => p.trim()).filter(Boolean).map((value) => ({ value })),
    emails: values.emails.map((e) => e.trim()).filter(Boolean).map((value) => ({ value })),
  };
  if (organization) draft.organization = organization;
  return draft;
}

// ── The Contact Picker API ───────────────────────────────────────────────────

/** What `navigator.contacts.select` resolves to per contact (every property is an array). */
export interface PickedContact {
  name?: string[];
  tel?: string[];
  email?: string[];
  icon?: Blob[];
}

export interface ContactsManagerLike {
  select(properties: string[], options?: { multiple?: boolean }): Promise<PickedContact[]>;
  getProperties?(): Promise<string[]>;
}

/** The browser's contacts manager, when the Contact Picker API exists and the page is a secure context. */
export function contactsManager(nav: unknown = typeof navigator !== 'undefined' ? navigator : undefined): ContactsManagerLike | null {
  const contacts = (nav as { contacts?: Partial<ContactsManagerLike> } | undefined)?.contacts;
  return contacts && typeof contacts.select === 'function' ? (contacts as ContactsManagerLike) : null;
}

/** What the picker is asked for. `icon` only where the browser said it supports it. */
export function contactPickerProperties(supported: readonly string[] | null | undefined): string[] {
  const base = ['name', 'tel', 'email'];
  return supported?.includes('icon') ? [...base, 'icon'] : base;
}

export type PickContactResult =
  | { kind: 'picked'; draft: ContactDraft }
  /** The member closed the picker without choosing anyone. */
  | { kind: 'cancelled' }
  /** The picker refused (no user activation, not allowed here) or returned nothing usable. */
  | { kind: 'failed' };

/**
 * Opens the device's contact picker for one contact and turns the answer into a draft. Must be called
 * from a click handler (the browser requires a user gesture). `encodeIcon(blob, sizePx, quality)`
 * shrinks the contact's photo to a square JPEG (base64), see {@link fitThumbnail}; without it, or when
 * no size fits 24 KB, the card goes without a photo.
 */
export async function pickContact(
  manager: ContactsManagerLike,
  properties: string[],
  encodeIcon?: (blob: Blob, sizePx: number, quality: number) => Promise<string | null>
): Promise<PickContactResult> {
  let picked: PickedContact[];
  try {
    picked = await manager.select(properties, { multiple: false });
  } catch {
    return { kind: 'failed' };
  }
  if (!Array.isArray(picked) || picked.length === 0) return { kind: 'cancelled' };
  const draft = draftFromPicked(picked[0]);
  if (!draft) return { kind: 'failed' };
  const icon = picked[0].icon?.[0];
  if (icon && encodeIcon) {
    const thumb = await fitThumbnail((size, quality) => encodeIcon(icon, size, quality));
    if (thumb) draft.thumbnailBase64 = thumb;
  }
  return { kind: 'picked', draft };
}

/**
 * A picked contact as a draft, or null when the picker returned nothing usable. Duplicate numbers and
 * addresses (the picker often repeats them) are removed. The icon is handled separately (it needs a
 * canvas to shrink), see {@link fitThumbnail}.
 */
export function draftFromPicked(picked: PickedContact | undefined): ContactDraft | null {
  if (!picked) return null;
  const unique = (values: string[] | undefined) => {
    const seen = new Set<string>();
    const out: ContactEntry[] = [];
    for (const raw of values ?? []) {
      const value = typeof raw === 'string' ? raw.trim() : '';
      const key = value.replace(/\s+/g, '').toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push({ value });
      if (out.length >= MAX_CONTACT_FIELDS) break;
    }
    return out;
  };
  const name = (picked.name ?? []).map((n) => (typeof n === 'string' ? n.trim() : '')).find(Boolean) ?? '';
  const phones = unique(picked.tel);
  const emails = unique(picked.email);
  if (!name && phones.length === 0 && emails.length === 0) return null;
  return { displayName: name || phones[0]?.value || emails[0]?.value || '', phones, emails };
}

/**
 * Finds the largest thumbnail that fits the 24 KB cap. `encode(sizePx, quality)` renders the image as
 * a square JPEG and returns its base64 (no data: prefix), or null when it cannot. Tries the sizes and
 * qualities in order and returns the first that fits; undefined when none does (the card is sent
 * without a photo rather than failing).
 */
export async function fitThumbnail(
  encode: (sizePx: number, quality: number) => Promise<string | null>,
  cap = MAX_CONTACT_THUMBNAIL_BASE64
): Promise<string | undefined> {
  const attempts: [number, number][] = [
    [160, 0.8],
    [128, 0.7],
    [96, 0.7],
    [96, 0.5],
    [64, 0.5],
  ];
  for (const [size, quality] of attempts) {
    let encoded: string | null = null;
    try {
      encoded = await encode(size, quality);
    } catch {
      encoded = null;
    }
    if (encoded && encoded.length <= cap) return encoded;
  }
  return undefined;
}
