/**
 * Links that hand a location to Apple Maps or Google Maps (OneHookBackend/docs/chat-location-contact.md,
 * "Opening in Apple Maps and Google Maps").
 *
 * Client-only: the coordinates go only to the maps app the user taps, never to any other service. For a
 * live share the caller passes the latest known position; the maps app shows a snapshot of it.
 */
import { roundCoordinate } from './chat-structured';

export interface MapTarget {
  lat: number;
  lon: number;
  /** Place name, when the sender picked a place. Omitted from the link when absent. */
  name?: string;
}

export type MapsApp = 'apple_maps' | 'google_maps';

/** `lat,lon` at the contract's 6 decimals, without exponent notation or trailing zeros. */
export function formatLatLon(lat: number, lon: number): string {
  return `${roundCoordinate(lat)},${roundCoordinate(lon)}`;
}

/** Apple Maps pin: `https://maps.apple.com/?ll=<lat>,<lon>&q=<name>` (no `q` without a name). */
export function appleMapsOpenUrl(target: MapTarget): string {
  const ll = formatLatLon(target.lat, target.lon);
  const name = target.name?.trim();
  return name
    ? `https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(name)}`
    : `https://maps.apple.com/?ll=${ll}`;
}

/** Apple Maps directions: `https://maps.apple.com/?daddr=<lat>,<lon>`. */
export function appleMapsDirectionsUrl(target: MapTarget): string {
  return `https://maps.apple.com/?daddr=${formatLatLon(target.lat, target.lon)}`;
}

/** Google Maps pin: `https://www.google.com/maps/search/?api=1&query=<lat>,<lon>`. */
export function googleMapsOpenUrl(target: MapTarget): string {
  return `https://www.google.com/maps/search/?api=1&query=${formatLatLon(target.lat, target.lon)}`;
}

/** Google Maps directions: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lon>`. */
export function googleMapsDirectionsUrl(target: MapTarget): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${formatLatLon(target.lat, target.lon)}`;
}

/** The pin link for a maps app. */
export function mapsOpenUrl(app: MapsApp, target: MapTarget): string {
  return app === 'apple_maps' ? appleMapsOpenUrl(target) : googleMapsOpenUrl(target);
}

/** The directions link for a maps app. */
export function mapsDirectionsUrl(app: MapsApp, target: MapTarget): string {
  return app === 'apple_maps' ? appleMapsDirectionsUrl(target) : googleMapsDirectionsUrl(target);
}

/** Human-readable coordinates for a card: `12.9716° N, 77.5946° E` (5 decimals, about 1 m). */
export function formatCoordinatesForDisplay(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}

/** Accuracy for a card: `±14 m`, `±1.2 km`. */
export function formatAccuracy(accuracyM: number): string {
  if (accuracyM >= 1000) return `±${(accuracyM / 1000).toFixed(1)} km`;
  return `±${Math.max(1, Math.round(accuracyM))} m`;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres (haversine). Used only on device, to label two pins. */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance for a label: `350 m`, `4.2 km`, `120 km`. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * Places pins in a `width` x `height` box for the tile-free on-device map: an equirectangular
 * projection scaled to fit every pin inside `padding`. One pin (or pins at the same spot) sits in the
 * centre. No tiles, no network: only the relative layout of the pins is drawn.
 */
export function projectPins(
  pins: readonly { lat: number; lon: number }[],
  width: number,
  height: number,
  padding: number
): { x: number; y: number }[] {
  if (pins.length === 0) return [];
  const meanLat = pins.reduce((sum, p) => sum + p.lat, 0) / pins.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const raw = pins.map((p) => ({ x: p.lon * k, y: -p.lat }));
  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y));
  const maxY = Math.max(...raw.map((p) => p.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  if (!Number.isFinite(scale)) return raw.map(() => ({ x: width / 2, y: height / 2 }));
  // Centre the fitted drawing in the box.
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return raw.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }));
}
