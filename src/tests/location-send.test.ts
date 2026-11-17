import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildLiveLocationStartPayload,
  buildLiveLocationUpdatePayload,
  buildLocationPayload,
  decodeStructuredFrame,
  frameStructuredContent,
  parseLiveLocationUpdate,
} from '../lib/chat-structured';
import {
  LocationReadError,
  browserLocationSource,
  errorKindFromCode,
  fixFromPosition,
  getCurrentFix,
  isPageForeground,
  windowPageLifecycle,
  type GeolocationLike,
  type PositionLike,
} from '../lib/browser-location';

/**
 * Sending locations from the web: the payloads exactly as the contract has them, reading positions
 * from the Geolocation API (one-shot and watch), the pagehide hook, and the rule that the matching
 * location is only read while the page is in the foreground.
 */

const T0 = 1_794_700_000_000;
const SESSION = '3f6d2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';

describe('payloads', () => {
  it('a current location: 6 decimals, accuracy, capturedAt, nothing else', () => {
    const payload = buildLocationPayload({ lat: 12.97161234, lon: 77.59456789, accuracyM: 14.26, at: T0 });
    expect(payload).toEqual({ v: 1, type: 'location', lat: 12.971612, lon: 77.594568, accuracyM: 14.3, capturedAt: T0 });
    expect(decodeStructuredFrame(frameStructuredContent(payload))).toMatchObject({ type: 'location', lat: 12.971612 });
  });

  it('omits an unknown accuracy and refuses coordinates out of range', () => {
    expect(buildLocationPayload({ lat: 1, lon: 2, accuracyM: Number.NaN, at: T0 })).not.toHaveProperty('accuracyM');
    expect(() => buildLocationPayload({ lat: 91, lon: 0, at: T0 })).toThrow();
    expect(() => buildLocationPayload({ lat: 0, lon: Number.NaN, at: T0 })).toThrow();
  });

  it('a live start carries the session, its window and the first position', () => {
    const payload = buildLiveLocationStartPayload({
      sessionId: SESSION,
      startedAt: T0,
      expiresAt: T0 + 3_600_000,
      fix: { lat: 12.9716, lon: 77.5946, accuracyM: 14, at: T0 },
    });
    expect(payload).toEqual({
      v: 1,
      type: 'live_location',
      sessionId: SESSION,
      startedAt: T0,
      expiresAt: T0 + 3_600_000,
      lat: 12.9716,
      lon: 77.5946,
      accuracyM: 14,
    });
    expect(decodeStructuredFrame(frameStructuredContent(payload))).toMatchObject({ type: 'live_location', sessionId: SESSION });
    expect(() => buildLiveLocationStartPayload({ sessionId: 'bad id', startedAt: T0, expiresAt: T0 + 1, fix: { lat: 0, lon: 0, at: T0 } })).toThrow();
    expect(() => buildLiveLocationStartPayload({ sessionId: SESSION, startedAt: T0, expiresAt: T0, fix: { lat: 0, lon: 0, at: T0 } })).toThrow();
  });

  it('a live update round-trips through the receiver parser, heading wrapped below 360', () => {
    const payload = buildLiveLocationUpdatePayload(SESSION, {
      lat: 12.9718,
      lon: 77.5949,
      accuracyM: 9,
      headingDeg: 359.7,
      speedMps: 1.44,
      at: T0 + 60_000,
    });
    expect(payload).toEqual({
      v: 1,
      type: 'live_location_update',
      sessionId: SESSION,
      lat: 12.9718,
      lon: 77.5949,
      accuracyM: 9,
      headingDeg: 0,
      speedMps: 1.4,
      at: T0 + 60_000,
    });
    const parsed = parseLiveLocationUpdate(frameStructuredContent(payload), SESSION);
    expect(parsed).toMatchObject({ headingDeg: 0, speedMps: 1.4 });
    // An update is never a chat message.
    expect(decodeStructuredFrame(frameStructuredContent(payload))).toEqual({ type: 'unsupported' });
  });
});

function position(coords: Partial<PositionLike['coords']>, timestamp = T0): PositionLike {
  return { coords: { latitude: 12.9716, longitude: 77.5946, ...coords }, timestamp };
}

describe('reading positions', () => {
  it('maps a browser position to a fix, dropping heading when not moving', () => {
    expect(fixFromPosition(position({ accuracy: 12, heading: 90, speed: 0 }))).toEqual({
      lat: 12.9716,
      lon: 77.5946,
      accuracyM: 12,
      speedMps: 0,
      at: T0,
    });
    expect(fixFromPosition(position({ heading: 90, speed: 2 }))).toMatchObject({ headingDeg: 90, speedMps: 2 });
    expect(fixFromPosition(position({ heading: Number.NaN, speed: null, accuracy: null }))).toEqual({ lat: 12.9716, lon: 77.5946, at: T0 });
    expect(fixFromPosition(position({ latitude: 200 }))).toBeNull();
  });

  it('maps GeolocationPositionError codes', () => {
    expect(errorKindFromCode(1)).toBe('denied');
    expect(errorKindFromCode(2)).toBe('unavailable');
    expect(errorKindFromCode(3)).toBe('timeout');
  });

  it('getCurrentFix resolves a fix, and rejects with the reason', async () => {
    const ok: GeolocationLike = {
      getCurrentPosition: (success) => success(position({ accuracy: 5 })),
      watchPosition: () => 1,
      clearWatch: () => undefined,
    };
    await expect(getCurrentFix(ok)).resolves.toMatchObject({ lat: 12.9716, accuracyM: 5 });

    const denied: GeolocationLike = { ...ok, getCurrentPosition: (_s, error) => error?.({ code: 1 }) };
    await expect(getCurrentFix(denied)).rejects.toMatchObject({ kind: 'denied' });
    await expect(getCurrentFix(null)).rejects.toBeInstanceOf(LocationReadError);
    await expect(getCurrentFix(null)).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('the live watch asks for GPS at high accuracy, accepts older network fixes at low, and stops cleanly', () => {
    const calls: PositionOptions[] = [];
    const cleared: number[] = [];
    let success: (p: PositionLike) => void = () => undefined;
    let failure: (e: { code: number }) => void = () => undefined;
    const geo: GeolocationLike = {
      getCurrentPosition: () => undefined,
      watchPosition: (s, e, options) => {
        success = s;
        failure = e ?? failure;
        calls.push(options ?? {});
        return calls.length;
      },
      clearWatch: (id) => cleared.push(id),
    };
    const source = browserLocationSource(geo);
    const onFix = vi.fn();
    const onDenied = vi.fn();
    const stopHigh = source.watch(onFix, onDenied, { highAccuracy: true });
    expect(calls[0]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    success(position({ accuracy: 5 }));
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ lat: 12.9716, accuracyM: 5 }));
    failure({ code: 2 });
    expect(onDenied).not.toHaveBeenCalled();
    failure({ code: 1 });
    expect(onDenied).toHaveBeenCalledTimes(1);
    stopHigh();
    stopHigh();
    expect(cleared).toEqual([1]);

    source.watch(onFix, onDenied, { highAccuracy: false });
    expect(calls[1]).toMatchObject({ enableHighAccuracy: false, maximumAge: 60_000 });
  });

  it('without geolocation the watch reports denied at once', () => {
    const onDenied = vi.fn();
    browserLocationSource(null).watch(() => undefined, onDenied, { highAccuracy: true });
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it('hooks pagehide and unhooks it', () => {
    const listeners = new Set<() => void>();
    const win = {
      addEventListener: (_type: 'pagehide', fn: () => void) => listeners.add(fn),
      removeEventListener: (_type: 'pagehide', fn: () => void) => listeners.delete(fn),
    };
    const fn = vi.fn();
    const off = windowPageLifecycle(win).onPageHide(fn);
    for (const l of listeners) l();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    expect(listeners.size).toBe(0);
  });
});

describe('matching location stays in the foreground', () => {
  it('isPageForeground is true only for a visible page', () => {
    expect(isPageForeground({ visibilityState: 'visible' })).toBe(true);
    expect(isPageForeground({ visibilityState: 'hidden' })).toBe(false);
  });

  const source = readFileSync(new URL('../hooks/use-user-location.ts', import.meta.url), 'utf8');

  it('use-user-location reads once (never watches) and only while the page is visible', () => {
    expect(source).not.toMatch(/watchPosition/);
    expect(source).toMatch(/if \(!isPageForeground\(\)\) return;/);
    expect(source).toMatch(/visibilitychange/);
  });

  it('the chat share engine never touches the matching location', () => {
    const sharing = readFileSync(new URL('../lib/live-location-sharing.ts', import.meta.url), 'utf8');
    const browser = readFileSync(new URL('../lib/browser-location.ts', import.meta.url), 'utf8');
    for (const text of [sharing, browser]) {
      expect(text).not.toMatch(/from ['"][^'"]*(use-user-location|api\/matching)['"]/);
      expect(text).not.toMatch(/indexLocation\(|MatchingApi/);
    }
  });
});
