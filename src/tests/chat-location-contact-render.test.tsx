import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  StructuredMessageBubble,
  UNSUPPORTED_CONTENT_COPY,
  type LiveLocationContext,
} from '../components/chat/StructuredMessageBubble';
import type { StructuredContent } from '../lib/chat-structured';
import { frameStructuredContent } from '../lib/chat-structured';
import {
  liveSessionKey,
  mergeLiveSession,
  sessionFromRow,
  type LiveSessions,
} from '../lib/live-location';
import { UiElement } from '../lib/analytics/generated/telemetryCatalog';

/**
 * Static render (no DOM, no effects) of the structured-content bubbles: location card, live card in
 * its live / ended states with both members' shares, contact card, and the update placeholder. Also
 * pins the telemetry wiring of the map and contact actions.
 */

const T0 = 1_794_700_000_000;
const SESSION = '3f6d2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const PEER_SESSION = 'aaaaaaaa-1111-2222-3333-444444444444';

const baseLive: LiveLocationContext = {
  sessions: {},
  currentUserId: 'me-id',
  peerId: 'peer-id',
  peerName: 'Riya',
};

function render(content: StructuredContent, opts: { mine?: boolean; live?: Partial<LiveLocationContext>; sentAt?: number } = {}) {
  return renderToStaticMarkup(
    <StructuredMessageBubble
      content={content}
      mine={opts.mine ?? false}
      sentAt={opts.sentAt ?? T0}
      live={{ ...baseLive, ...opts.live }}
    />
  );
}

/** Decodes the HTML entities React emits in attributes, so URLs can be compared verbatim. */
const html = (s: string) => s.replace(/&amp;/g, '&');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 60_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('location card', () => {
  const location: StructuredContent = {
    type: 'location',
    lat: 12.9716,
    lon: 77.5946,
    accuracyM: 14,
    name: 'Cubbon Park',
    address: 'Kasturba Road, Bengaluru',
  };

  it('shows the pin, the place name and address, and the accuracy', () => {
    const out = render(location);
    expect(out).toContain('Cubbon Park');
    expect(out).toContain('Kasturba Road, Bengaluru');
    expect(out).toContain('Accuracy ±14 m');
    expect(out).toContain('aria-label="Show map for Cubbon Park"');
  });

  it('falls back to coordinates without a place', () => {
    const out = render({ type: 'location', lat: -33.8688, lon: 151.2093 });
    expect(out).toContain('33.86880° S, 151.20930° E');
  });

  it('opens Apple Maps and Google Maps, with directions, each tracked with its app', () => {
    const out = html(render(location));
    expect(out).toContain('href="https://maps.apple.com/?ll=12.9716,77.5946&q=Cubbon%20Park"');
    expect(out).toContain('href="https://www.google.com/maps/search/?api=1&query=12.9716,77.5946"');
    expect(out).toContain('href="https://maps.apple.com/?daddr=12.9716,77.5946"');
    expect(out).toContain('href="https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LOCATION_OPEN}" data-track-value="apple_maps"`);
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LOCATION_OPEN}" data-track-value="google_maps"`);
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LOCATION_DIRECTIONS}" data-track-value="apple_maps"`);
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LOCATION_DIRECTIONS}" data-track-value="google_maps"`);
    expect(out).toContain('Opens in Apple Maps or Google Maps');
  });
});

describe('live location card', () => {
  const start: StructuredContent = {
    type: 'live_location',
    sessionId: PEER_SESSION,
    startedAt: T0,
    expiresAt: T0 + 3_600_000,
    lat: 12.9716,
    lon: 77.5946,
    accuracyM: 20,
  };
  const update = (userId: string, sessionId: string, lat: number, at: number) =>
    sessionFromRow(
      { matchId: 'm1', userId, sessionId, ciphertext: 'x', at, expiresAt: T0 + 3_600_000, ended: false },
      frameStructuredContent({ v: 1, type: 'live_location_update', sessionId, lat, lon: 77.6, accuracyM: 9, at })
    );

  it('shows live until, a pulsing dot and the last update, using the newest position', () => {
    const sessions = mergeLiveSession({}, update('peer-id', PEER_SESSION, 12.98, T0 + 30_000));
    const out = html(render(start, { live: { sessions } }));
    expect(out).toContain('Live location');
    expect(out).toContain('Live until');
    expect(out).toContain('Updated just now · ±9 m');
    expect(out).toContain('animate-ping');
    expect(out).toContain('href="https://maps.apple.com/?ll=12.98,77.6"');
    expect(out).toContain('receive the latest position as a snapshot');
  });

  it("does not move the peer's bubble with a share of the same sessionId owned by someone else", () => {
    const sessions = mergeLiveSession({}, update('me-id', PEER_SESSION, 50, T0 + 30_000));
    const out = html(render(start, { live: { sessions } }));
    expect(out).toContain('href="https://maps.apple.com/?ll=12.9716,77.5946"');
  });

  it('renders the ended state with no coordinates or map links', () => {
    let sessions: LiveSessions = mergeLiveSession({}, update('peer-id', PEER_SESSION, 12.98, T0 + 30_000));
    sessions = mergeLiveSession(
      sessions,
      sessionFromRow(
        { matchId: 'm1', userId: 'peer-id', sessionId: PEER_SESSION, ciphertext: null, at: T0 + 40_000, expiresAt: T0 + 3_600_000, ended: true },
        null
      )
    );
    expect(sessions[liveSessionKey('peer-id', PEER_SESSION)].ended).toBe(true);
    const out = render(start, { live: { sessions } });
    expect(out).toContain('Ended');
    expect(out).not.toContain('maps.apple.com');
    expect(out).not.toContain('Live until');
  });

  it('is ended once expiresAt passes, with no event', () => {
    vi.setSystemTime(T0 + 3_600_000);
    const out = render(start);
    expect(out).toContain('Ended');
  });

  it("labels the sender's own share as theirs", () => {
    const own = { ...start, sessionId: SESSION } as StructuredContent;
    const sessions = mergeLiveSession({}, update('me-id', SESSION, 12.97, T0 + 30_000));
    const out = render(own, { mine: true, live: { sessions } });
    expect(out).toContain('aria-label="Show map for your live location"');
  });
});

describe('contact card', () => {
  const contact: StructuredContent = {
    type: 'contact',
    displayName: 'Asha Rao',
    organization: 'OneHook',
    phones: [{ label: 'mobile', value: '+91 98450 00000' }],
    emails: [{ label: 'home', value: 'asha@example.com' }],
  };

  it('shows initials, name, phones, emails and a tracked Download .vcf', () => {
    const out = render(contact);
    expect(out).toContain('>AR<');
    expect(out).toContain('Asha Rao');
    expect(out).toContain('OneHook');
    expect(out).toContain('+91 98450 00000');
    expect(out).toContain('asha@example.com');
    expect(out).toContain('Download .vcf');
    expect(out).toContain(`data-track-id="${UiElement.CHAT_CONTACT_OPEN}"`);
    // Phones and emails are text, not tel:/mailto: links.
    expect(out).not.toContain('tel:');
    expect(out).not.toContain('mailto:');
  });

  it('shows the thumbnail when present', () => {
    const out = render({ ...contact, thumbnailBase64: 'AAAA' } as StructuredContent);
    expect(out).toContain('src="data:image/jpeg;base64,AAAA"');
  });
});

describe('unsupported content', () => {
  it('renders the update placeholder', () => {
    expect(render({ type: 'unsupported' })).toContain(UNSUPPORTED_CONTENT_COPY);
    expect(UNSUPPORTED_CONTENT_COPY).toBe('Update OneHook to view this');
  });
});
