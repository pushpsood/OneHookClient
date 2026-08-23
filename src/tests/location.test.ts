import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isValidCoordinate,
  getLastKnownLocation,
  saveLastKnownLocation,
  resolveCoordinatesFromText,
  resolveFallbackCoordinates,
  DEFAULT_FALLBACK_COORDS,
  STORAGE_KEY_LAST_COORDS,
} from '../utils/location';

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockStorage = new LocalStorageMock();
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = {
  ...(globalThis as any).window,
  localStorage: mockStorage,
};

describe('Location Utility: Coordinate Validation', () => {
  it('validates standard GPS coordinates within valid ranges', () => {
    expect(isValidCoordinate(37.7749, -122.4194)).toBe(true); // San Francisco
    expect(isValidCoordinate(51.5074, -0.1278)).toBe(true); // London
    expect(isValidCoordinate(19.076, 72.8777)).toBe(true); // Mumbai
    expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true); // Sydney
    expect(isValidCoordinate(90, 180)).toBe(true); // Extreme bounds
    expect(isValidCoordinate(-90, -180)).toBe(true); // Extreme bounds
  });

  it('rejects out of bounds latitude', () => {
    expect(isValidCoordinate(90.1, 0)).toBe(false);
    expect(isValidCoordinate(-90.0001, 0)).toBe(false);
    expect(isValidCoordinate(150, 50)).toBe(false);
  });

  it('rejects out of bounds longitude', () => {
    expect(isValidCoordinate(0, 180.1)).toBe(false);
    expect(isValidCoordinate(0, -180.001)).toBe(false);
    expect(isValidCoordinate(45, 200)).toBe(false);
  });

  it('rejects (0, 0) Null Island coordinates', () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(0.0, 0.0)).toBe(false);
  });

  it('rejects null, undefined, NaN, and non-numeric inputs', () => {
    expect(isValidCoordinate(null, null)).toBe(false);
    expect(isValidCoordinate(undefined, undefined)).toBe(false);
    expect(isValidCoordinate(NaN, -122.4)).toBe(false);
    expect(isValidCoordinate(37.7, NaN)).toBe(false);
    expect(isValidCoordinate('37.7' as any, -122.4)).toBe(false);
  });
});

describe('Location Utility: LocalStorage Caching (Tier 2 Fallback)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves last known location correctly', () => {
    const coords = { lat: 40.7128, lon: -74.006 };
    saveLastKnownLocation(coords);

    const retrieved = getLastKnownLocation();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.lat).toBe(40.7128);
    expect(retrieved?.lon).toBe(-74.006);
  });

  it('ignores saving invalid coordinates', () => {
    saveLastKnownLocation({ lat: 0, lon: 0 });
    expect(getLastKnownLocation()).toBeNull();

    saveLastKnownLocation({ lat: 95, lon: 200 });
    expect(getLastKnownLocation()).toBeNull();
  });

  it('returns null if corrupted JSON is in storage', () => {
    localStorage.setItem(STORAGE_KEY_LAST_COORDS, 'invalid json {[');
    expect(getLastKnownLocation()).toBeNull();
  });
});

describe('Location Utility: Profile City Resolution', () => {
  it('resolves direct city matches', () => {
    const sf = resolveCoordinatesFromText('San Francisco');
    expect(sf).not.toBeNull();
    expect(sf?.lat).toBeCloseTo(37.7749, 2);
    expect(sf?.lon).toBeCloseTo(-122.4194, 2);

    const london = resolveCoordinatesFromText('London');
    expect(london).not.toBeNull();
    expect(london?.lat).toBeCloseTo(51.5074, 2);
  });

  it('resolves city matches within freeform strings', () => {
    const mission = resolveCoordinatesFromText('Mission District, SF');
    expect(mission).not.toBeNull();
    expect(mission?.lat).toBeCloseTo(37.7749, 2);

    const mumbaiSub = resolveCoordinatesFromText('Bandra West, Mumbai, India');
    expect(mumbaiSub).not.toBeNull();
    expect(mumbaiSub?.lat).toBeCloseTo(19.076, 2);
  });

  it('returns null for unknown or empty text', () => {
    expect(resolveCoordinatesFromText('')).toBeNull();
    expect(resolveCoordinatesFromText(null)).toBeNull();
    expect(resolveCoordinatesFromText('Mars Colony 1')).toBeNull();
  });
});

describe('Location Utility: Tiered Fallback Resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('Tier 2A: prefers cached last known location over profile city text', () => {
    const cached = { lat: 51.5074, lon: -0.1278 }; // London
    saveLastKnownLocation(cached);

    const res = resolveFallbackCoordinates('New York, NY');
    expect(res.source).toBe('LAST_KNOWN');
    expect(res.coords.lat).toBe(51.5074);
    expect(res.coords.lon).toBe(-0.1278);
  });

  it('Tier 2B: resolves profile city text when no cache exists', () => {
    const res = resolveFallbackCoordinates('New York, NY');
    expect(res.source).toBe('PROFILE_CITY');
    expect(res.coords.lat).toBeCloseTo(40.7128, 2);
    expect(res.coords.lon).toBeCloseTo(-74.006, 2);
  });

  it('Tier 3: falls back to system default coordinates when no cache or known city exists', () => {
    const res = resolveFallbackCoordinates('Unknown Place Nowhere');
    expect(res.source).toBe('DEFAULT');
    expect(res.coords.lat).toBe(DEFAULT_FALLBACK_COORDS.lat);
    expect(res.coords.lon).toBe(DEFAULT_FALLBACK_COORDS.lon);
  });

  it('guarantees DEFAULT_FALLBACK_COORDS are valid coordinates and not (0,0)', () => {
    expect(isValidCoordinate(DEFAULT_FALLBACK_COORDS.lat, DEFAULT_FALLBACK_COORDS.lon)).toBe(true);
    expect(DEFAULT_FALLBACK_COORDS.lat).not.toBe(0);
    expect(DEFAULT_FALLBACK_COORDS.lon).not.toBe(0);
  });
});
