/**
 * The browser side of chat location sharing: reading positions from the Geolocation API, and the page
 * lifecycle and clock the live-sharing engine (lib/live-location-sharing.ts) runs on.
 *
 * Two separate users of the Geolocation API exist in the app and they never share anything:
 *  - chat sharing (this file): a one-shot read for the location sheet, and a `watchPosition` that runs
 *    only while this tab has a live share running;
 *  - matching (hooks/use-user-location.ts): a one-shot read for Discover, made only while the page is
 *    visible ({@link isPageForeground}). The web has no background location at all, so "foreground
 *    only" here means "never while the tab is hidden".
 *
 * Everything takes its browser objects as parameters, so it is unit-testable under Node with fakes.
 */
import type { LocationFix } from './chat-structured';
import type { LiveLocationSource, PageLifecycle, SharingClock } from './live-location-sharing';

/** Why a position could not be read. */
export type LocationErrorKind = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export class LocationReadError extends Error {
  readonly kind: LocationErrorKind;
  constructor(kind: LocationErrorKind) {
    super(LOCATION_ERROR_COPY[kind]);
    this.name = 'LocationReadError';
    this.kind = kind;
  }
}

/** What the location sheet says for each failure. */
export const LOCATION_ERROR_COPY: Record<LocationErrorKind, string> = {
  unsupported: "This browser can't share your location.",
  denied: 'Location access is off for this site. Turn it on in your browser settings to share your location.',
  unavailable: "Your location isn't available right now.",
  timeout: 'Finding your location took too long.',
};

/** The parts of `GeolocationPosition` used here (so tests can pass plain objects). */
export interface PositionLike {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
  };
  timestamp: number;
}

/** The parts of `navigator.geolocation` used here. */
export interface GeolocationLike {
  getCurrentPosition(
    success: (position: PositionLike) => void,
    error?: (error: { code: number }) => void,
    options?: PositionOptions
  ): void;
  watchPosition(
    success: (position: PositionLike) => void,
    error?: (error: { code: number }) => void,
    options?: PositionOptions
  ): number;
  clearWatch(id: number): void;
}

/** `GeolocationPositionError` codes. */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

export function errorKindFromCode(code: number): LocationErrorKind {
  if (code === PERMISSION_DENIED) return 'denied';
  if (code === TIMEOUT) return 'timeout';
  return 'unavailable';
}

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * A browser position as a fix. Heading is only meaningful while moving (browsers report NaN or null
 * otherwise), so it is dropped when the speed is unknown or zero. Returns null for coordinates out of
 * range, which some platforms report while they have no fix.
 */
export function fixFromPosition(position: PositionLike): LocationFix | null {
  const { latitude, longitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const fix: LocationFix = {
    lat: latitude,
    lon: longitude,
    at: Number.isFinite(position.timestamp) && position.timestamp > 0 ? position.timestamp : Date.now(),
  };
  const accuracy = finiteOrUndefined(position.coords.accuracy);
  if (accuracy !== undefined && accuracy >= 0) fix.accuracyM = accuracy;
  const speed = finiteOrUndefined(position.coords.speed);
  if (speed !== undefined && speed >= 0) fix.speedMps = speed;
  const heading = finiteOrUndefined(position.coords.heading);
  if (heading !== undefined && heading >= 0 && heading < 360 && speed !== undefined && speed > 0) {
    fix.headingDeg = heading;
  }
  return fix;
}

/** The page's geolocation, or null where there is none (old browsers, insecure origins, SSR). */
export function browserGeolocation(): GeolocationLike | null {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return navigator.geolocation as unknown as GeolocationLike;
}

/**
 * One fresh position for the location sheet. Prompts for permission the first time. A cached
 * position up to 30 s old is accepted (it is what the member sees in the preview before sending).
 */
export function getCurrentFix(
  geo: GeolocationLike | null = browserGeolocation(),
  options: PositionOptions = { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 }
): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!geo) {
      reject(new LocationReadError('unsupported'));
      return;
    }
    try {
      geo.getCurrentPosition(
        (position) => {
          const fix = fixFromPosition(position);
          if (fix) resolve(fix);
          else reject(new LocationReadError('unavailable'));
        },
        (error) => reject(new LocationReadError(errorKindFromCode(error?.code ?? 0))),
        options
      );
    } catch {
      reject(new LocationReadError('unsupported'));
    }
  });
}

/**
 * Positions for a running live share (`watchPosition`). High accuracy asks for GPS and fresh fixes;
 * low accuracy (the member has been still for a while) accepts network positions up to a minute old,
 * which lets the device keep its GPS off. Permission refused or revoked calls `onDenied`; other errors
 * are transient and ignored (the watch keeps running and the next fix arrives when it can).
 */
export function browserLocationSource(geo: GeolocationLike | null = browserGeolocation()): LiveLocationSource {
  return {
    watch(onFix, onDenied, { highAccuracy }) {
      if (!geo) {
        onDenied();
        return () => undefined;
      }
      let id: number | null = null;
      try {
        id = geo.watchPosition(
          (position) => {
            const fix = fixFromPosition(position);
            if (fix) onFix(fix);
          },
          (error) => {
            if (error?.code === PERMISSION_DENIED) onDenied();
          },
          highAccuracy
            ? { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 }
            : { enableHighAccuracy: false, maximumAge: 60_000, timeout: 120_000 }
        );
      } catch {
        onDenied();
      }
      return () => {
        if (id !== null) geo.clearWatch(id);
        id = null;
      };
    },
  };
}

/** The parts of `window` the page lifecycle uses. */
export interface WindowLike {
  addEventListener(type: 'pagehide', listener: () => void): void;
  removeEventListener(type: 'pagehide', listener: () => void): void;
}

/**
 * `pagehide` is the one event that fires reliably when a tab is closed, reloaded or navigated away
 * (including on mobile, where `beforeunload` and `unload` often do not), and also when the page goes
 * into the back/forward cache. `beforeunload` is not used: it fires before the member confirms
 * leaving, and listening to it keeps some browsers from caching the page.
 */
export function windowPageLifecycle(win: WindowLike | null = typeof window !== 'undefined' ? window : null): PageLifecycle {
  return {
    onPageHide(fn) {
      if (!win) return () => undefined;
      const listener = () => fn();
      win.addEventListener('pagehide', listener);
      return () => win.removeEventListener('pagehide', listener);
    },
  };
}

export const systemClock: SharingClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Whether the page is in the foreground (visible). Matching location is only read then: a tab in the
 * background never prompts for, refreshes or sends the matching location.
 */
export function isPageForeground(doc: { visibilityState?: string } | null = typeof document !== 'undefined' ? document : null): boolean {
  // No document (SSR, tests) proves nothing either way; the callers only run in the browser.
  return !doc || doc.visibilityState === undefined || doc.visibilityState === 'visible';
}
