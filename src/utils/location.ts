export interface Coordinates {
  lat: number;
  lon: number;
}

export const STORAGE_KEY_LAST_COORDS = 'onehook_last_coords';

/**
 * Default fallback coordinates (San Francisco Bay Area: 37.7749° N, 122.4194° W),
 * configurable via environment variables if needed.
 */
export const DEFAULT_FALLBACK_COORDS: Coordinates = {
  lat:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_LAT
      ? parseFloat(import.meta.env.VITE_DEFAULT_LAT)
      : 37.7749,
  lon:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_LON
      ? parseFloat(import.meta.env.VITE_DEFAULT_LON)
      : -122.4194,
};

/**
 * Validates whether latitude and longitude are valid GPS numbers within range:
 * lat in [-90, 90], lon in [-180, 180], and not NaN.
 */
export function isValidCoordinate(lat?: number | null, lon?: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  // Disallow (0, 0) as valid device GPS to avoid Null Island defaults
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Retrieves the user's last known coordinates stored in localStorage.
 */
export function getLastKnownLocation(): Coordinates | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_COORDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidCoordinate(parsed?.lat, parsed?.lon)) {
      return { lat: Number(parsed.lat), lon: Number(parsed.lon) };
    }
  } catch (e) {
    console.warn('Failed to parse last known coordinates from storage:', e);
  }
  return null;
}

/**
 * Saves valid coordinates to localStorage for subsequent sessions.
 */
export function saveLastKnownLocation(coords: Coordinates): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (!isValidCoordinate(coords.lat, coords.lon)) return;
  try {
    localStorage.setItem(STORAGE_KEY_LAST_COORDS, JSON.stringify(coords));
  } catch (e) {
    console.warn('Failed to save coordinates to storage:', e);
  }
}

/**
 * Common city center coordinates dictionary to resolve textual locations entered
 * in user profiles (currentLocation / hometown) when GPS is unavailable.
 */
const CITY_COORDINATE_MAP: Record<string, Coordinates> = {
  // United States
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  'sf': { lat: 37.7749, lon: -122.4194 },
  'new york': { lat: 40.7128, lon: -74.006 },
  'nyc': { lat: 40.7128, lon: -74.006 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'la': { lat: 34.0522, lon: -118.2437 },
  'chicago': { lat: 41.8781, lon: -87.6298 },
  'seattle': { lat: 47.6062, lon: -122.3321 },
  'austin': { lat: 30.2672, lon: -97.7431 },
  'boston': { lat: 42.3601, lon: -71.0589 },
  'miami': { lat: 25.7617, lon: -80.1918 },

  // International
  'london': { lat: 51.5074, lon: -0.1278 },
  'mumbai': { lat: 19.076, lon: 72.8777 },
  'delhi': { lat: 28.6139, lon: 77.209 },
  'bangalore': { lat: 12.9716, lon: 77.5946 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'toronto': { lat: 43.6532, lon: -79.3832 },
  'vancouver': { lat: 49.2827, lon: -123.1207 },
  'paris': { lat: 48.8566, lon: 2.3522 },
  'berlin': { lat: 52.52, lon: 13.405 },
  'sydney': { lat: -33.8688, lon: 151.2093 },
  'singapore': { lat: 1.3521, lon: 103.8198 },
  'tokyo': { lat: 35.6762, lon: 139.6503 },
  'dubai': { lat: 25.2048, lon: 55.2708 },
};

/**
 * Resolves approximate city center coordinates from freeform text like
 * "Mission District, SF", "London, UK", "New York", etc.
 */
export function resolveCoordinatesFromText(text?: string | null): Coordinates | null {
  if (!text || typeof text !== 'string') return null;
  const normalized = text.toLowerCase().trim();
  if (!normalized) return null;

  // Direct match
  if (CITY_COORDINATE_MAP[normalized]) {
    return CITY_COORDINATE_MAP[normalized];
  }

  // Word-boundary match for city keywords (avoids matching 'la' inside 'place')
  for (const [cityName, coords] of Object.entries(CITY_COORDINATE_MAP)) {
    // Escape any regex special characters in city name
    const escaped = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
    if (regex.test(normalized)) {
      return coords;
    }
  }

  return null;
}

/**
 * Resolves Tier 2 / Tier 3 fallback coordinates in order of priority:
 * 1. User's last known cached location in localStorage.
 * 2. User's profile city text (currentLocation or hometown).
 * 3. Default fallback metro coordinates (DEFAULT_FALLBACK_COORDS).
 */
export function resolveFallbackCoordinates(profileCityText?: string | null): {
  coords: Coordinates;
  source: 'LAST_KNOWN' | 'PROFILE_CITY' | 'DEFAULT';
} {
  // 1. Last known cached location
  const cached = getLastKnownLocation();
  if (cached && isValidCoordinate(cached.lat, cached.lon)) {
    return { coords: cached, source: 'LAST_KNOWN' };
  }

  // 2. Profile city lookup
  const fromCity = resolveCoordinatesFromText(profileCityText);
  if (fromCity && isValidCoordinate(fromCity.lat, fromCity.lon)) {
    return { coords: fromCity, source: 'PROFILE_CITY' };
  }

  // 3. System default fallback
  return { coords: DEFAULT_FALLBACK_COORDS, source: 'DEFAULT' };
}
