/**
 * Builds a vCard 3.0 (RFC 2426) from a decrypted contact card, entirely on device, for "Download .vcf".
 *
 * Text values are escaped per RFC 2426 §4 (backslash, comma, semicolon, newline), lines end in CRLF and
 * are folded at 75 octets without splitting a UTF-8 sequence. Known phone/email labels become TYPE
 * parameters; any other label is kept as an Apple-style `itemN.X-ABLabel`, which Apple Contacts, Google
 * Contacts and Outlook all read.
 */
import type { ContactContent, ContactEntry } from './chat-structured';

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

/** Escapes a TEXT value: `\` → `\\`, `,` → `\,`, `;` → `\;`, any newline → `\n`. */
export function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

const encoder = new TextEncoder();

/** Folds one content line to at most 75 octets per physical line (RFC 2425 §5.8.1). */
export function foldVCardLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  // The first physical line holds 75 octets; continuations start with a space, leaving 74.
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** iOS can send raw CNLabel constants like `_$!<Mobile>!$_`; unwrap them to `Mobile`. */
function normalizeLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const unwrapped = label.replace(/^_\$!<(.*)>!\$_$/, '$1').trim();
  return unwrapped || undefined;
}

const PHONE_TYPES: Record<string, string> = {
  mobile: 'CELL',
  cell: 'CELL',
  iphone: 'CELL',
  home: 'HOME',
  work: 'WORK',
  main: 'VOICE',
  pager: 'PAGER',
  fax: 'FAX',
  'home fax': 'HOME,FAX',
  homefax: 'HOME,FAX',
  'work fax': 'WORK,FAX',
  workfax: 'WORK,FAX',
};

const EMAIL_TYPES: Record<string, string> = {
  home: 'HOME',
  work: 'WORK',
};

interface PropertyLines {
  lines: string[];
  nextGroup: number;
}

function entryLines(
  property: 'TEL' | 'EMAIL',
  entry: ContactEntry,
  types: Record<string, string>,
  baseType: string | undefined,
  state: PropertyLines
): void {
  const label = normalizeLabel(entry.label);
  const known = label ? types[label.toLowerCase()] : undefined;
  const typeParam = [baseType, known].filter(Boolean).join(',');
  const params = typeParam ? `;TYPE=${typeParam}` : '';
  const value = escapeVCardText(entry.value);
  if (label && !known && label.toLowerCase() !== 'other') {
    const group = `item${state.nextGroup++}`;
    state.lines.push(`${group}.${property}${params}:${value}`);
    state.lines.push(`${group}.X-ABLabel:${escapeVCardText(label)}`);
  } else {
    state.lines.push(`${property}${params}:${value}`);
  }
}

/** Builds the vCard text (CRLF line endings, folded). */
export function buildVCard(contact: ContactContent): string {
  const state: PropertyLines = { lines: ['BEGIN:VCARD', 'VERSION:3.0'], nextGroup: 1 };
  const { lines } = state;
  // N is required in 3.0: family;given;additional;prefix;suffix, each component escaped on its own.
  lines.push(
    `N:${escapeVCardText(contact.familyName ?? '')};${escapeVCardText(contact.givenName ?? '')};;;`
  );
  lines.push(`FN:${escapeVCardText(contact.displayName)}`);
  if (contact.organization) lines.push(`ORG:${escapeVCardText(contact.organization)}`);
  for (const phone of contact.phones) entryLines('TEL', phone, PHONE_TYPES, undefined, state);
  for (const email of contact.emails) entryLines('EMAIL', email, EMAIL_TYPES, 'INTERNET', state);
  if (contact.thumbnailBase64) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${contact.thumbnailBase64}`);
  lines.push('END:VCARD');
  return lines.map(foldVCardLine).join(CRLF) + CRLF;
}

/** A safe download filename: `Asha Rao.vcf`, or `contact.vcf` when nothing usable is left. */
export function vCardFileName(displayName: string): string {
  const base = displayName
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 64)
    .trim();
  return `${base || 'contact'}.vcf`;
}
