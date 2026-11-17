import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocationShareSheetView, type LocationShareSheetViewProps } from '../components/chat/LocationShareSheet';
import { ContactShareSheetView, type ContactShareSheetViewProps } from '../components/chat/ContactShareSheet';
import { StructuredMessageBubble, type LiveLocationContext } from '../components/chat/StructuredMessageBubble';
import { EMPTY_CONTACT_FORM } from '../lib/contact-share';
import { TAB_BOUND_COPY } from '../lib/live-location-sharing';
import { UiElement, uiElementsForPlatform } from '../lib/analytics/generated/telemetryCatalog';
import { referencedUiElementNames } from './telemetry-guard-scan';

/**
 * Static render of the sending side: the location sheet (current and live, the durations, the
 * tab-bound copy), the contact sheet (picked review and the manual form), and the Stop button on the
 * member's own live bubble. Pins the telemetry ids and values each control carries.
 */

const T0 = Date.now();
const SESSION = '3f6d2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const noop = () => undefined;
// renderToStaticMarkup escapes the apostrophe in the copy.
const TAB_BOUND_HTML = TAB_BOUND_COPY.replace("'", '&#x27;');

function locationSheet(overrides: Partial<LocationShareSheetViewProps> = {}) {
  return renderToStaticMarkup(
    <LocationShareSheetView
      peerName="Riya"
      phase={{ kind: 'ready', fix: { lat: 12.9716, lon: 77.5946, accuracyM: 14, at: T0 } }}
      step="main"
      busy={false}
      sendError={null}
      now={T0}
      onClose={noop}
      onRetry={noop}
      onSendCurrent={noop}
      onChooseLive={noop}
      onBack={noop}
      onChooseDuration={noop}
      {...overrides}
    />
  );
}

describe('location sheet', () => {
  it('previews the position on device and offers current and live, each tracked', () => {
    const out = locationSheet();
    expect(out).toContain('12.97160° N, 77.59460° E');
    expect(out).toContain('Accuracy ±14 m');
    expect(out).toContain('Send your current location');
    expect(out).toContain('Share live location');
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LOCATION_SHARE}" data-track-value="current"`);
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LOCATION_SHARE}" data-track-value="live"`);
    expect(out).toContain(`data-track-id="${UiElement.CHAT_ATTACH_BUTTON}" data-track-action="dismiss"`);
    expect(out).toContain(TAB_BOUND_HTML);
    // Tile-free: no map image or tile host.
    expect(out).not.toMatch(/<img|googleapis|mapbox|openstreetmap/i);
  });

  it('offers 15 minutes, 1 hour and 8 hours with the tab-bound copy', () => {
    const out = locationSheet({ step: 'duration' });
    for (const [value, label] of [
      ['min_15', '15 minutes'],
      ['hour_1', '1 hour'],
      ['hour_8', '8 hours'],
    ]) {
      expect(out).toContain(`data-track-id="${UiElement.CHAT_LIVE_LOCATION_DURATION}" data-track-value="${value}"`);
      expect(out).toContain(label);
    }
    expect(out).toContain(TAB_BOUND_HTML);
    // Back emits the duration dismiss imperatively, so it is exempt rather than double counted.
    expect(out).toContain('data-track-exempt="duplicate:');
  });

  it('says a new live share replaces the running one', () => {
    const out = locationSheet({
      step: 'duration',
      runningShare: { matchId: 'm', sessionId: SESSION, peerName: 'Riya', startedAt: T0, expiresAt: T0 + 60_000 },
    });
    expect(out).toContain('This replaces the live share running until');
  });

  it('cannot send before a position exists, and explains a refused permission', () => {
    const locating = locationSheet({ phase: { kind: 'locating' } });
    expect(locating).toContain('Finding your location');
    expect(locating.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    const denied = locationSheet({ phase: { kind: 'error', error: 'denied' } });
    expect(denied).toContain('Location access is off for this site');
    expect(denied).toContain(`data-track-id="${UiElement.CHAT_RETRY}"`);
  });
});

function contactSheet(overrides: Partial<ContactShareSheetViewProps> = {}) {
  return renderToStaticMarkup(
    <ContactShareSheetView
      peerName="Riya"
      picked={null}
      pickerAvailable={false}
      values={EMPTY_CONTACT_FORM}
      nameTouched={false}
      selection={{ phones: [], emails: [] }}
      busy={false}
      sendError={null}
      onChangeValues={noop}
      onTouchName={noop}
      onToggle={noop}
      onPickAgain={noop}
      onClose={noop}
      onSend={noop}
      {...overrides}
    />
  );
}

describe('contact sheet', () => {
  it('without the Contact Picker: a form, Send disabled until there is a name', () => {
    const out = contactSheet();
    expect(out).toContain('id="contact-share-name"');
    expect(out).toContain('aria-label="Phone number 1"');
    expect(out).toContain('aria-label="Email address 1"');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-track-id="chat\.send_button"/);
    const named = contactSheet({ values: { ...EMPTY_CONTACT_FORM, name: 'Asha' } });
    expect(named).not.toMatch(/<button[^>]*disabled=""[^>]*data-track-id="chat\.send_button"/);
  });

  it('shows the name error once the field was left empty', () => {
    expect(contactSheet({ nameTouched: true })).toContain('Enter a name');
    expect(contactSheet()).not.toContain('Enter a name');
  });

  it('a picked contact: every phone and email ticked by default, untickable, plus choose another', () => {
    const out = contactSheet({
      picked: { displayName: 'Asha Rao', phones: [{ value: '+91 98450 12345' }], emails: [{ value: 'asha@example.com' }] },
      pickerAvailable: true,
      selection: { phones: [true], emails: [false] },
    });
    expect(out).toContain('Asha Rao');
    expect(out).toContain('Choose what to share');
    // Attribute order is React's (type, class, checked), so match the attributes anywhere in the tag.
    expect(out.match(/<input[^>]*type="checkbox"[^>]*checked=""[^>]*>/g)).toHaveLength(1);
    expect(out.match(/type="checkbox"/g)).toHaveLength(2);
    expect(out).toContain(`data-track-id="${UiElement.CHAT_ATTACH_OPTION}" data-track-value="contact"`);
  });
});

describe('send-side telemetry on web (catalog 1.24.0)', () => {
  it('chat.location_share, chat.live_location_duration and chat.live_location_stop are in web scope and emitted', () => {
    const referenced = referencedUiElementNames(new URL('../', import.meta.url).pathname);
    const webScope = new Set<string>(uiElementsForPlatform('web'));
    for (const name of ['CHAT_LOCATION_SHARE', 'CHAT_LIVE_LOCATION_DURATION', 'CHAT_LIVE_LOCATION_STOP'] as const) {
      expect(webScope.has(UiElement[name])).toBe(true);
      expect(referenced.has(name)).toBe(true);
    }
  });
});

describe('own live bubble', () => {
  const live: LiveLocationContext = {
    sessions: {},
    currentUserId: 'me-id',
    peerId: 'peer-id',
    peerName: 'Riya',
    onStopShare: noop,
    sharingHereSessionId: SESSION,
  };
  const start = {
    type: 'live_location' as const,
    sessionId: SESSION,
    startedAt: T0,
    expiresAt: T0 + 15 * 60_000,
    lat: 12.9716,
    lon: 77.5946,
  };

  it('has a tracked Stop button and the tab-bound copy when this tab runs the share', () => {
    const out = renderToStaticMarkup(<StructuredMessageBubble content={start} mine sentAt={T0} live={live} />);
    expect(out).toContain('Stop sharing');
    expect(out).toContain(`data-track-id="${UiElement.CHAT_LIVE_LOCATION_STOP}"`);
    expect(out).toContain(TAB_BOUND_HTML);
  });

  it('still offers Stop for a share from another device, without the tab copy', () => {
    const out = renderToStaticMarkup(
      <StructuredMessageBubble content={start} mine sentAt={T0} live={{ ...live, sharingHereSessionId: undefined }} />
    );
    expect(out).toContain('Stop sharing');
    expect(out).not.toContain(TAB_BOUND_HTML);
  });

  it("never offers Stop on the peer's share, or once a share ended", () => {
    expect(renderToStaticMarkup(<StructuredMessageBubble content={start} mine={false} sentAt={T0} live={live} />)).not.toContain('Stop sharing');
    const ended = { ...start, expiresAt: T0 - 1, startedAt: T0 - 60_000 };
    expect(renderToStaticMarkup(<StructuredMessageBubble content={ended} mine sentAt={T0 - 60_000} live={live} />)).not.toContain('Stop sharing');
  });
});
