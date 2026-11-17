import { describe, expect, it } from 'vitest';
import {
  STRUCTURED_FRAME_BYTE,
  decodeStructuredFrame,
  frameStructuredContent,
  isStructuredFrame,
  parseLiveLocationUpdate,
  MAX_CONTACT_THUMBNAIL_BASE64,
} from '../lib/chat-structured';
import { ATTACHMENT_FRAME_BYTE, decodeMessagePlaintext } from '../lib/chat-attachments';
import { CALL_SIGNAL_FRAME_BYTE } from '../lib/call-signal';
import {
  appleMapsDirectionsUrl,
  appleMapsOpenUrl,
  distanceMeters,
  formatAccuracy,
  formatLatLon,
  googleMapsDirectionsUrl,
  googleMapsOpenUrl,
  projectPins,
} from '../lib/map-links';
import { buildVCard, escapeVCardText, foldVCardLine, vCardFileName } from '../lib/vcard';
import {
  LIVE_START_GRACE_MS,
  MAX_LIVE_SHARE_MS,
  formatUpdatedAgo,
  isLiveSessionRunning,
  latestPinPerMember,
  liveSessionKey,
  mergeLiveSession,
  resolveLiveBubble,
  sessionFromRow,
  type LiveLocationRow,
  type LiveSessionState,
  type LiveSessions,
} from '../lib/live-location';
import { selectEphemeralExcerpts } from '../lib/mr-onehook-excerpts';
import { UiElement, uiElementsForPlatform } from '../lib/analytics/generated/telemetryCatalog';
import { referencedUiElementNames } from './telemetry-guard-scan';

/**
 * Web side of OneHookBackend/docs/chat-location-contact.md: the 0x03 structured-content frame, map
 * links, the local vCard and the live-share merge. Pure functions only (no DOM).
 */

const SESSION = '3f6d2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const T0 = 1_794_700_000_000;

const frame = (payload: Record<string, unknown>) => frameStructuredContent(payload);

describe('structured-content framing (0x03)', () => {
  it('uses its own frame byte, distinct from attachments (0x01) and call signals (0x02)', () => {
    expect(STRUCTURED_FRAME_BYTE).toBe(0x03);
    expect(new Set([STRUCTURED_FRAME_BYTE, ATTACHMENT_FRAME_BYTE, CALL_SIGNAL_FRAME_BYTE]).size).toBe(3);
    expect(isStructuredFrame('\u0003{}')).toBe(true);
    expect(isStructuredFrame('\u0002{}')).toBe(false);
    expect(isStructuredFrame('{"v":1,"type":"location"}')).toBe(false);
  });

  it('decodes a current location, rounding coordinates to 6 decimals and ignoring unknown fields', () => {
    const content = decodeStructuredFrame(
      frame({
        v: 1,
        type: 'location',
        lat: 12.97161234,
        lon: 77.59469876,
        accuracyM: 14,
        name: 'Cubbon Park',
        address: 'Bengaluru',
        capturedAt: T0,
        futureField: { x: 1 },
      })
    );
    expect(content).toEqual({
      type: 'location',
      lat: 12.971612,
      lon: 77.594699,
      accuracyM: 14,
      name: 'Cubbon Park',
      address: 'Bengaluru',
      capturedAt: T0,
    });
  });

  it('decodes a live-location start and a contact card', () => {
    expect(
      decodeStructuredFrame(
        frame({ v: 1, type: 'live_location', sessionId: SESSION, startedAt: T0, expiresAt: T0 + 3_600_000, lat: 1, lon: 2, accuracyM: 5 })
      )
    ).toEqual({ type: 'live_location', sessionId: SESSION, startedAt: T0, expiresAt: T0 + 3_600_000, lat: 1, lon: 2, accuracyM: 5 });

    const contact = decodeStructuredFrame(
      frame({
        v: 1,
        type: 'contact',
        displayName: 'Asha Rao',
        givenName: 'Asha',
        familyName: 'Rao',
        phones: [{ label: 'mobile', value: '+91 98450 00000' }, { value: '' }, 'junk'],
        emails: [{ label: 'home', value: 'asha@example.com' }],
        thumbnailBase64: 'AAAA',
      })
    );
    expect(contact).toEqual({
      type: 'contact',
      displayName: 'Asha Rao',
      givenName: 'Asha',
      familyName: 'Rao',
      phones: [{ label: 'mobile', value: '+91 98450 00000' }],
      emails: [{ label: 'home', value: 'asha@example.com' }],
      thumbnailBase64: 'AAAA',
    });
  });

  it('drops an oversized or non-base64 contact thumbnail instead of rendering it', () => {
    const big = 'A'.repeat(MAX_CONTACT_THUMBNAIL_BASE64 + 4);
    for (const thumbnailBase64 of [big, 'not base64!', '<svg>']) {
      const c = decodeStructuredFrame(frame({ v: 1, type: 'contact', displayName: 'A', thumbnailBase64 }));
      expect(c).toMatchObject({ type: 'contact' });
      expect(c && 'thumbnailBase64' in c).toBe(false);
    }
  });

  it.each([
    ['unknown type', { v: 1, type: 'poll' }],
    ['newer version', { v: 2, type: 'location', lat: 1, lon: 2 }],
    ['missing version', { type: 'location', lat: 1, lon: 2 }],
    ['latitude out of range', { v: 1, type: 'location', lat: 91, lon: 2 }],
    ['non-numeric longitude', { v: 1, type: 'location', lat: 1, lon: '2' }],
    ['live start with a bad sessionId', { v: 1, type: 'live_location', sessionId: 'x', startedAt: T0, expiresAt: T0 + 1, lat: 1, lon: 2 }],
    ['an update posing as a message', { v: 1, type: 'live_location_update', sessionId: SESSION, lat: 1, lon: 2, at: T0 }],
    ['empty contact', { v: 1, type: 'contact' }],
  ])('renders the update placeholder for %s', (_name, payload) => {
    expect(decodeStructuredFrame(frame(payload))).toEqual({ type: 'unsupported' });
  });

  it('renders malformed JSON as the placeholder, never as raw text', () => {
    expect(decodeStructuredFrame('\u0003{"v":1,')).toEqual({ type: 'unsupported' });
    expect(decodeStructuredFrame('\u0003[1,2]')).toEqual({ type: 'unsupported' });
    expect(decodeMessagePlaintext('\u0003not json')).toEqual({
      type: 'structured',
      content: { type: 'unsupported' },
    });
  });

  it('routes through decodeMessagePlaintext without disturbing text', () => {
    expect(decodeMessagePlaintext('hello')).toEqual({ type: 'text', text: 'hello' });
    expect(decodeMessagePlaintext(frame({ v: 1, type: 'location', lat: 1, lon: 2 }))).toEqual({
      type: 'structured',
      content: { type: 'location', lat: 1, lon: 2 },
    });
  });

  it('strips control characters from peer-controlled strings', () => {
    const c = decodeStructuredFrame(frame({ v: 1, type: 'location', lat: 1, lon: 2, name: 'Caf\u0007e\nBar' }));
    expect(c).toMatchObject({ name: 'Caf e Bar' });
  });

  it('never offers a location or contact card to Mr.OneHook as an excerpt', () => {
    const messages = [
      { speaker: 'self' as const, text: frame({ v: 1, type: 'location', lat: 1, lon: 2 }), timestamp: T0 },
      { speaker: 'match' as const, text: frame({ v: 1, type: 'contact', displayName: 'X' }), timestamp: T0 + 1 },
      { speaker: 'match' as const, text: 'see you there', timestamp: T0 + 2 },
    ];
    const result = selectEphemeralExcerpts(messages, { maxMessages: 10 });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('see you there');
    expect(serialized).not.toContain('location');
    expect(serialized).not.toContain('contact');
  });
});

describe('live_location_update payload', () => {
  const update = (extra: Record<string, unknown> = {}) =>
    frame({ v: 1, type: 'live_location_update', sessionId: SESSION, lat: 12.9718, lon: 77.5949, accuracyM: 9, at: T0, ...extra });

  it('parses an update for the expected session, with optional heading and speed', () => {
    expect(parseLiveLocationUpdate(update({ headingDeg: 270, speedMps: 1.4 }), SESSION)).toEqual({
      type: 'live_location_update',
      sessionId: SESSION,
      lat: 12.9718,
      lon: 77.5949,
      accuracyM: 9,
      headingDeg: 270,
      speedMps: 1.4,
      at: T0,
    });
  });

  it('ignores an update sealed for a different session than the row it arrived on', () => {
    expect(parseLiveLocationUpdate(update(), 'aaaaaaaa-0000-0000-0000-000000000000')).toBeNull();
  });

  it('ignores a newer version, another type, or a non-0x03 plaintext', () => {
    expect(parseLiveLocationUpdate(update({ v: 2 }), SESSION)).toBeNull();
    expect(parseLiveLocationUpdate(update({ type: 'location' }), SESSION)).toBeNull();
    expect(parseLiveLocationUpdate('[Unable to decrypt]', SESSION)).toBeNull();
  });
});

describe('map links', () => {
  const target = { lat: 12.9716, lon: 77.5946 };

  it('builds the four contract URLs', () => {
    expect(appleMapsOpenUrl(target)).toBe('https://maps.apple.com/?ll=12.9716,77.5946');
    expect(googleMapsOpenUrl(target)).toBe('https://www.google.com/maps/search/?api=1&query=12.9716,77.5946');
    expect(appleMapsDirectionsUrl(target)).toBe('https://maps.apple.com/?daddr=12.9716,77.5946');
    expect(googleMapsDirectionsUrl(target)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
    );
  });

  it('URL-encodes the place name into Apple Maps q and omits q without a name', () => {
    expect(appleMapsOpenUrl({ ...target, name: 'Café & Bar #1' })).toBe(
      'https://maps.apple.com/?ll=12.9716,77.5946&q=Caf%C3%A9%20%26%20Bar%20%231'
    );
    expect(appleMapsOpenUrl({ ...target, name: '   ' })).toBe('https://maps.apple.com/?ll=12.9716,77.5946');
  });

  it('formats coordinates at 6 decimals without exponent notation', () => {
    expect(formatLatLon(-33.86881234, 151.20929999)).toBe('-33.868812,151.2093');
    expect(formatLatLon(0.0000001, -0.0000004)).toBe('0,0');
    expect(formatLatLon(0.000001, 10)).toBe('0.000001,10');
  });

  it('formats accuracy and measures distance on device', () => {
    expect(formatAccuracy(14.4)).toBe('±14 m');
    expect(formatAccuracy(1234)).toBe('±1.2 km');
    // One degree of latitude is about 111 km.
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeGreaterThan(110_000);
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeLessThan(112_000);
  });

  it('projects pins inside the tile-free card, a single pin in the centre', () => {
    expect(projectPins([{ lat: 10, lon: 20 }], 240, 120, 24)).toEqual([{ x: 120, y: 60 }]);
    const [a, b] = projectPins([{ lat: 10, lon: 20 }, { lat: 10.01, lon: 20.02 }], 240, 120, 24);
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(24);
      expect(p.x).toBeLessThanOrEqual(216);
      expect(p.y).toBeGreaterThanOrEqual(24);
      expect(p.y).toBeLessThanOrEqual(96);
    }
    // North is up, east is right.
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeLessThan(a.y);
  });
});

describe('vCard 3.0 builder', () => {
  it('escapes backslash, comma, semicolon and newlines', () => {
    expect(escapeVCardText('a\\b,c;d\ne\r\nf')).toBe('a\\\\b\\,c\\;d\\ne\\nf');
  });

  it('builds a CRLF vCard with N, FN, ORG, typed TEL/EMAIL, custom labels and the photo', () => {
    const card = buildVCard({
      type: 'contact',
      displayName: 'Rao, Asha; MD',
      givenName: 'Asha',
      familyName: 'Rao',
      organization: 'OneHook; Inc.',
      phones: [
        { label: 'mobile', value: '+91 98450 00000' },
        { label: '_$!<Work>!$_', value: '+91 80 0000 0000' },
        { label: 'Gym', value: '+91 1' },
        { value: '+91 2' },
      ],
      emails: [{ label: 'home', value: 'asha@example.com' }],
      thumbnailBase64: 'AAAA',
    });
    expect(card.endsWith('\r\n')).toBe(true);
    expect(card.split('\r\n').filter(Boolean)).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Rao;Asha;;;',
      'FN:Rao\\, Asha\\; MD',
      'ORG:OneHook\\; Inc.',
      'TEL;TYPE=CELL:+91 98450 00000',
      'TEL;TYPE=WORK:+91 80 0000 0000',
      'item1.TEL:+91 1',
      'item1.X-ABLabel:Gym',
      'TEL:+91 2',
      'EMAIL;TYPE=INTERNET,HOME:asha@example.com',
      'PHOTO;ENCODING=b;TYPE=JPEG:AAAA',
      'END:VCARD',
    ]);
    expect(card).not.toMatch(/[^\r]\n/);
  });

  it('folds long lines at 75 octets without splitting a UTF-8 character', () => {
    const line = `FN:${'é'.repeat(100)}`;
    const folded = foldVCardLine(line);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    for (const [i, p] of physical.entries()) {
      expect(enc.encode(p).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(' ')).toBe(true);
    }
    // Unfolding (drop CRLF + one space) restores the original.
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldVCardLine('FN:short')).toBe('FN:short');
  });

  it('derives a safe file name', () => {
    expect(vCardFileName('Asha Rao')).toBe('Asha Rao.vcf');
    expect(vCardFileName('../a/b:c*?')).toBe('abc.vcf');
    expect(vCardFileName('   ')).toBe('contact.vcf');
  });
});

describe('live session merge', () => {
  const row = (over: Partial<LiveLocationRow> = {}): LiveLocationRow => ({
    matchId: 'm1',
    userId: 'peer',
    sessionId: SESSION,
    ciphertext: 'sealed',
    at: T0,
    expiresAt: T0 + 3_600_000,
    ended: false,
    ...over,
  });
  const plaintext = (lat: number, at = T0) =>
    frame({ v: 1, type: 'live_location_update', sessionId: SESSION, lat, lon: 77.59, accuracyM: 9, at });
  const state = (lat: number, at: number, over: Partial<LiveLocationRow> = {}) =>
    sessionFromRow(row({ at, ...over }), plaintext(lat, at));
  const key = liveSessionKey('peer', SESSION);

  it('builds state from a row, with no position when the payload is unreadable or ended', () => {
    expect(state(12.97, T0).position).toEqual({ lat: 12.97, lon: 77.59, accuracyM: 9, updatedAt: T0 });
    expect(sessionFromRow(row(), null).position).toBeUndefined();
    expect(sessionFromRow(row({ ended: true, ciphertext: null }), plaintext(1)).position).toBeUndefined();
  });

  it('newer at wins; an older row arriving late is ignored', () => {
    let s: LiveSessions = {};
    s = mergeLiveSession(s, state(1, T0 + 10_000));
    const before = s;
    s = mergeLiveSession(s, state(2, T0 + 5_000));
    expect(s).toBe(before);
    s = mergeLiveSession(s, state(3, T0 + 15_000));
    expect(s[key].position?.lat).toBe(3);
  });

  it('a tie replaces only when it adds a position', () => {
    let s: LiveSessions = mergeLiveSession({}, sessionFromRow(row({ at: T0 }), null));
    s = mergeLiveSession(s, state(5, T0));
    expect(s[key].position?.lat).toBe(5);
    const same = mergeLiveSession(s, state(6, T0));
    expect(same).toBe(s);
  });

  it('a newer unreadable row keeps the last position and its own timestamp', () => {
    let s = mergeLiveSession({}, state(1, T0));
    s = mergeLiveSession(s, sessionFromRow(row({ at: T0 + 5_000 }), null));
    expect(s[key].at).toBe(T0 + 5_000);
    expect(s[key].position).toMatchObject({ lat: 1, updatedAt: T0 });
  });

  it('ended is final and drops the position, even against a newer running row', () => {
    let s = mergeLiveSession({}, state(1, T0));
    s = mergeLiveSession(s, sessionFromRow(row({ at: T0 + 1_000, ended: true, ciphertext: null }), null));
    expect(s[key].ended).toBe(true);
    expect(s[key].position).toBeUndefined();
    const after = mergeLiveSession(s, state(9, T0 + 60_000));
    expect(after).toBe(s);
  });

  it('keeps shares of different members (and sessions) apart', () => {
    let s = mergeLiveSession({}, state(1, T0));
    s = mergeLiveSession(s, sessionFromRow(row({ userId: 'me-id' }), plaintext(2)));
    expect(Object.keys(s).sort()).toEqual([liveSessionKey('me-id', SESSION), key].sort());
  });

  it('treats a share as ended at expiresAt with no event', () => {
    const s: LiveSessionState = state(1, T0);
    expect(isLiveSessionRunning(s, s.expiresAt - 1)).toBe(true);
    expect(isLiveSessionRunning(s, s.expiresAt)).toBe(false);
  });

  it('shows one pin per member: the running share with the newest at', () => {
    const OTHER = 'aaaaaaaa-1111-2222-3333-444444444444';
    const older = sessionFromRow(row({ at: T0 }), plaintext(1, T0));
    const newer = sessionFromRow(
      row({ sessionId: OTHER, at: T0 + 9_000 }),
      frame({ v: 1, type: 'live_location_update', sessionId: OTHER, lat: 2, lon: 3, at: T0 + 9_000 })
    );
    const mine = sessionFromRow(row({ userId: 'me-id', at: T0 }), plaintext(4, T0));
    const expired = sessionFromRow(row({ userId: 'gone', expiresAt: T0 + 1 }), plaintext(5));
    let s: LiveSessions = {};
    for (const x of [older, newer, mine, expired]) s = mergeLiveSession(s, x);
    const pins = latestPinPerMember(s, T0 + 10_000);
    expect(Object.keys(pins).sort()).toEqual(['me-id', 'peer']);
    expect(pins.peer.sessionId).toBe(OTHER);
    expect(pins.peer.position.lat).toBe(2);
  });
});

describe('live bubble resolution', () => {
  const start = {
    type: 'live_location' as const,
    sessionId: SESSION,
    startedAt: T0,
    expiresAt: T0 + 3_600_000,
    lat: 1,
    lon: 2,
    accuracyM: 20,
  };
  const running = sessionFromRow(
    { matchId: 'm1', userId: 'peer', sessionId: SESSION, ciphertext: 'x', at: T0 + 30_000, expiresAt: T0 + 3_600_000, ended: false },
    frame({ v: 1, type: 'live_location_update', sessionId: SESSION, lat: 1.5, lon: 2.5, accuracyM: 8, at: T0 + 30_000 })
  );

  it('starts from the start message and moves the pin with updates', () => {
    expect(resolveLiveBubble({ start, sentAt: T0, now: T0 + 1_000 })).toMatchObject({
      status: 'live',
      lat: 1,
      lon: 2,
      accuracyM: 20,
      moved: false,
    });
    expect(resolveLiveBubble({ start, session: running, sentAt: T0, now: T0 + 40_000 })).toMatchObject({
      status: 'live',
      lat: 1.5,
      lon: 2.5,
      accuracyM: 8,
      updatedAt: T0 + 30_000,
      moved: true,
    });
  });

  it('ends at expiresAt, on an ended event, and never runs past the 8-hour ceiling', () => {
    expect(resolveLiveBubble({ start, session: running, sentAt: T0, now: T0 + 3_600_000 }).status).toBe('ended');
    expect(
      resolveLiveBubble({ start, session: { ...running, ended: true }, sentAt: T0, now: T0 + 40_000 }).status
    ).toBe('ended');
    const greedy = { ...start, expiresAt: T0 + 30 * 3_600_000 };
    const view = resolveLiveBubble({ start: greedy, sentAt: T0, now: T0 + 1_000 });
    expect(view.expiresAt).toBe(T0 + MAX_LIVE_SHARE_MS);
  });

  it('ends a share missing from a running-share list fetched well after it started', () => {
    const later = T0 + LIVE_START_GRACE_MS + 1;
    expect(resolveLiveBubble({ start, sentAt: T0, loadedAt: later, now: later }).status).toBe('ended');
    // A list fetched before (or right after) the start proves nothing: the publish may not have landed.
    expect(resolveLiveBubble({ start, sentAt: T0, loadedAt: T0 + 1_000, now: later }).status).toBe('live');
    expect(resolveLiveBubble({ start, sentAt: T0, now: later }).status).toBe('live');
  });

  it('labels the update age', () => {
    expect(formatUpdatedAgo(T0, T0 + 30_000)).toBe('just now');
    expect(formatUpdatedAgo(T0, T0 + 4 * 60_000)).toBe('4 min ago');
    expect(formatUpdatedAgo(T0, T0 + 2 * 3_600_000)).toBe('2 h ago');
  });
});

describe('location and contact telemetry on web (catalog 1.23.0)', () => {
  const SRC_ROOT = new URL('../', import.meta.url).pathname;
  const referenced = referencedUiElementNames(SRC_ROOT);
  const webScope = new Set<string>(uiElementsForPlatform('web'));

  it('emits the receive-side events: location open, directions and contact open', () => {
    for (const name of ['CHAT_LOCATION_OPEN', 'CHAT_LOCATION_DIRECTIONS', 'CHAT_CONTACT_OPEN'] as const) {
      expect(webScope.has(UiElement[name])).toBe(true);
      expect(referenced.has(name)).toBe(true);
    }
  });

  it('leaves the send-side events as web gaps (web does not send yet)', () => {
    for (const name of ['CHAT_LOCATION_SHARE', 'CHAT_LIVE_LOCATION_DURATION', 'CHAT_LIVE_LOCATION_STOP'] as const) {
      expect(webScope.has(UiElement[name])).toBe(false);
      expect(referenced.has(name)).toBe(false);
    }
  });
});
