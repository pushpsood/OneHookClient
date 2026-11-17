import { describe, expect, it, vi } from 'vitest';
import { MAX_CONTACT_THUMBNAIL_BASE64, decodeStructuredFrame, frameStructuredContent } from '../lib/chat-structured';
import {
  EMPTY_CONTACT_FORM,
  MAX_CONTACT_FIELDS,
  buildSelectedContactPayload,
  contactPickerProperties,
  contactsManager,
  draftFromForm,
  draftFromPicked,
  fitThumbnail,
  isPlausibleEmail,
  isPlausiblePhone,
  normalizeRows,
  pickContact,
  selectAll,
  validateContactForm,
  type ContactDraft,
  type ContactsManagerLike,
} from '../lib/contact-share';

/**
 * Sending a contact card from the web (lib/contact-share.ts): the manual form's validation and rows,
 * the Contact Picker answer, choosing which phones and emails go out, and the 24-KB thumbnail cap.
 */

const DRAFT: ContactDraft = {
  displayName: 'Asha Rao',
  organization: 'Acme',
  phones: [{ label: 'mobile', value: '+91 98450 12345' }, { value: '080 2222 3333' }],
  emails: [{ label: 'home', value: 'asha@example.com' }, { value: 'asha@work.example' }],
};

describe('the manual form', () => {
  it('requires a name and ignores empty rows', () => {
    const empty = validateContactForm(EMPTY_CONTACT_FORM);
    expect(empty.valid).toBe(false);
    expect(empty.errors.name).toBe('Enter a name');
    expect(empty.errors.phones).toEqual([undefined]);

    const named = validateContactForm({ ...EMPTY_CONTACT_FORM, name: '  Asha  ' });
    expect(named.valid).toBe(true);
  });

  it('flags an implausible phone or email on its own row', () => {
    const result = validateContactForm({
      name: 'Asha',
      organization: '',
      phones: ['+91 98450 12345', 'call me', ''],
      emails: ['asha@example', 'asha@example.com', ''],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.phones).toEqual([undefined, 'Enter a valid phone number', undefined]);
    expect(result.errors.emails).toEqual(['Enter a valid email address', undefined, undefined]);
  });

  it('accepts the usual phone formats and rejects too few or too many digits', () => {
    expect(isPlausiblePhone('+1 (415) 555-0100')).toBe(true);
    expect(isPlausiblePhone('080.2222.3333')).toBe(true);
    expect(isPlausiblePhone('12')).toBe(false);
    expect(isPlausiblePhone('1'.repeat(18))).toBe(false);
    expect(isPlausiblePhone('555-CALL')).toBe(false);
    expect(isPlausibleEmail('a@b.co')).toBe(true);
    expect(isPlausibleEmail('a b@c.co')).toBe(false);
  });

  it('rejects a name over the display cap', () => {
    expect(validateContactForm({ ...EMPTY_CONTACT_FORM, name: 'x'.repeat(257) }).errors.name).toBe('That name is too long');
  });

  it('keeps exactly one empty row to type into, drops empty rows in the middle, caps the list', () => {
    expect(normalizeRows([''])).toEqual(['']);
    expect(normalizeRows(['123'])).toEqual(['123', '']);
    expect(normalizeRows(['123', '', '456', ''])).toEqual(['123', '456', '']);
    expect(normalizeRows([' '])).toEqual([' ', '']);
    const full = Array.from({ length: MAX_CONTACT_FIELDS + 3 }, (_, i) => `${i}00`);
    expect(normalizeRows(full)).toHaveLength(MAX_CONTACT_FIELDS);
  });

  it('turns a valid form into a draft with trimmed values and no empty entries', () => {
    const draft = draftFromForm({
      name: ' Asha Rao ',
      organization: '  ',
      phones: [' +91 98450 12345 ', ''],
      emails: ['', 'asha@example.com'],
    });
    expect(draft).toEqual({
      displayName: 'Asha Rao',
      phones: [{ value: '+91 98450 12345' }],
      emails: [{ value: 'asha@example.com' }],
    });
  });
});

describe('choosing what to share', () => {
  it('includes everything by default', () => {
    const payload = buildSelectedContactPayload(DRAFT, selectAll(DRAFT));
    expect(payload).toEqual({
      v: 1,
      type: 'contact',
      displayName: 'Asha Rao',
      organization: 'Acme',
      phones: DRAFT.phones,
      emails: DRAFT.emails,
    });
  });

  it('sends only the ticked phones and emails', () => {
    const payload = buildSelectedContactPayload(DRAFT, { phones: [false, true], emails: [true, false] });
    expect(payload.phones).toEqual([{ value: '080 2222 3333' }]);
    expect(payload.emails).toEqual([{ label: 'home', value: 'asha@example.com' }]);
  });

  it('can send a name with no phone or email at all', () => {
    const payload = buildSelectedContactPayload(DRAFT, { phones: [false, false], emails: [false, false] });
    expect(payload).toMatchObject({ displayName: 'Asha Rao', phones: [], emails: [] });
  });

  it('round-trips through the 0x03 frame to the card the receiver renders', () => {
    const framed = frameStructuredContent(buildSelectedContactPayload(DRAFT, selectAll(DRAFT)));
    expect(framed.charCodeAt(0)).toBe(0x03);
    expect(decodeStructuredFrame(framed)).toMatchObject({ type: 'contact', displayName: 'Asha Rao', organization: 'Acme' });
  });

  it('drops a thumbnail over 24 KB instead of sending it', () => {
    const big = { ...DRAFT, thumbnailBase64: 'A'.repeat(MAX_CONTACT_THUMBNAIL_BASE64 + 4) };
    expect(buildSelectedContactPayload(big, selectAll(big)).thumbnailBase64).toBeUndefined();
    const ok = { ...DRAFT, thumbnailBase64: 'QUJD' };
    expect(buildSelectedContactPayload(ok, selectAll(ok)).thumbnailBase64).toBe('QUJD');
  });
});

describe('the Contact Picker API', () => {
  it('is used only where navigator.contacts.select exists', () => {
    expect(contactsManager({})).toBeNull();
    expect(contactsManager({ contacts: {} })).toBeNull();
    const manager = { select: async () => [] };
    expect(contactsManager({ contacts: manager })).toBe(manager);
  });

  it('asks for the photo only where the browser supports it', () => {
    expect(contactPickerProperties(null)).toEqual(['name', 'tel', 'email']);
    expect(contactPickerProperties(['name', 'email', 'tel', 'icon'])).toEqual(['name', 'tel', 'email', 'icon']);
  });

  it('turns a picked contact into a draft without duplicates', () => {
    expect(
      draftFromPicked({ name: ['  Asha Rao '], tel: ['+91 98450 12345', '+9198450 12345', ''], email: ['A@x.co', 'a@x.co'] })
    ).toEqual({ displayName: 'Asha Rao', phones: [{ value: '+91 98450 12345' }], emails: [{ value: 'A@x.co' }] });
    expect(draftFromPicked({ tel: ['123 456'] })?.displayName).toBe('123 456');
    expect(draftFromPicked({})).toBeNull();
    expect(draftFromPicked(undefined)).toBeNull();
  });

  it('reports a cancelled picker, a refused picker, and a picked contact', async () => {
    const cancelled: ContactsManagerLike = { select: async () => [] };
    expect(await pickContact(cancelled, ['name'])).toEqual({ kind: 'cancelled' });
    const refused: ContactsManagerLike = {
      select: async () => {
        throw new Error('NotAllowedError');
      },
    };
    expect(await pickContact(refused, ['name'])).toEqual({ kind: 'failed' });
    const picker: ContactsManagerLike = { select: vi.fn(async () => [{ name: ['Asha'], tel: ['12345'] }]) };
    expect(await pickContact(picker, ['name', 'tel', 'email'])).toEqual({
      kind: 'picked',
      draft: { displayName: 'Asha', phones: [{ value: '12345' }], emails: [] },
    });
    expect(picker.select).toHaveBeenCalledWith(['name', 'tel', 'email'], { multiple: false });
  });

  it('attaches the photo when it can be shrunk under the cap', async () => {
    const icon = new Blob(['x']);
    const picker: ContactsManagerLike = { select: async () => [{ name: ['Asha'], icon: [icon] }] };
    const encode = vi.fn(async (_blob: Blob, size: number) => (size <= 96 ? 'QUJD' : 'A'.repeat(MAX_CONTACT_THUMBNAIL_BASE64 + 1)));
    const result = await pickContact(picker, ['name', 'icon'], encode);
    expect(result).toMatchObject({ kind: 'picked', draft: { thumbnailBase64: 'QUJD' } });
    expect(encode.mock.calls[0][0]).toBe(icon);
  });
});

describe('fitThumbnail', () => {
  it('returns the first size that fits 24 KB, largest first', async () => {
    const sizes: number[] = [];
    const out = await fitThumbnail(async (size) => {
      sizes.push(size);
      return size === 128 ? 'B'.repeat(1000) : 'A'.repeat(MAX_CONTACT_THUMBNAIL_BASE64 + 1);
    });
    expect(out).toBe('B'.repeat(1000));
    expect(sizes).toEqual([160, 128]);
  });

  it('gives up (no photo) when nothing fits or encoding fails', async () => {
    expect(await fitThumbnail(async () => 'A'.repeat(MAX_CONTACT_THUMBNAIL_BASE64 + 1))).toBeUndefined();
    expect(
      await fitThumbnail(async () => {
        throw new Error('no canvas');
      })
    ).toBeUndefined();
    expect(await fitThumbnail(async () => null)).toBeUndefined();
  });
});
