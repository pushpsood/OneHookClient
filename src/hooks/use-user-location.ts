import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Coordinates,
  DEFAULT_FALLBACK_COORDS,
  isValidCoordinate,
  resolveFallbackCoordinates,
  saveLastKnownLocation,
} from '../utils/location';
import { MatchingApi } from '../api/matching';

export type CoordinateSource = 'LIVE_GPS' | 'LAST_KNOWN' | 'PROFILE_CITY' | 'DEFAULT';

export interface UserLocationState {
  coords: Coordinates;
  loading: boolean;
  error: string | null;
  isLiveGps: boolean;
  source: CoordinateSource;
  refreshLocation: () => void;
}

/**
 * Hook to manage and provide high-accuracy user coordinates following the Option 3 Tiered Architecture:
 * - Tier 1: Live Browser GPS (navigator.geolocation)
 * - Tier 2: Fallback to user's last known location (localStorage) or profile city
 * - Tier 3: Default fallback metro center (e.g. SF Bay Area / env config)
 */
export function useUserLocation(
  userId?: string,
  profileCityText?: string | null
): UserLocationState {
  const initialFallback = resolveFallbackCoordinates(profileCityText);

  const [coords, setCoords] = useState<Coordinates>(initialFallback.coords);
  const [source, setSource] = useState<CoordinateSource>(initialFallback.source);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveGps, setIsLiveGps] = useState<boolean>(false);

  const lastIndexedCoordsRef = useRef<string | null>(null);

  const indexLocationIfChanged = useCallback(
    async (targetUserId: string, targetCoords: Coordinates) => {
      const key = `${targetUserId}_${targetCoords.lat.toFixed(4)}_${targetCoords.lon.toFixed(4)}`;
      if (lastIndexedCoordsRef.current === key) return;

      try {
        await MatchingApi.indexLocation(targetUserId, targetCoords.lat, targetCoords.lon);
        lastIndexedCoordsRef.current = key;
      } catch (err) {
        console.warn('MatchingApi.indexLocation skipped or failed:', err);
      }
    },
    []
  );

  const requestLocation = useCallback(() => {
    // Check if running in browser with geolocation available
    if (typeof window === 'undefined' || !navigator?.geolocation) {
      const fallback = resolveFallbackCoordinates(profileCityText);
      setCoords(fallback.coords);
      setSource(fallback.source);
      setIsLiveGps(false);
      setLoading(false);
      setError('Geolocation is not supported in this environment.');
      if (userId) {
        void indexLocationIfChanged(userId, fallback.coords);
      }
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lon = Number(position.coords.longitude.toFixed(6));

        if (isValidCoordinate(lat, lon)) {
          const liveCoords: Coordinates = { lat, lon };
          setCoords(liveCoords);
          setIsLiveGps(true);
          setSource('LIVE_GPS');
          setLoading(false);
          setError(null);

          // Tier 2 Cache: Save to localStorage for subsequent sessions
          saveLastKnownLocation(liveCoords);

          // Index with backend PostGIS matching service
          if (userId) {
            void indexLocationIfChanged(userId, liveCoords);
          }
        } else {
          // GPS returned coordinates out of valid boundaries
          const fallback = resolveFallbackCoordinates(profileCityText);
          setCoords(fallback.coords);
          setSource(fallback.source);
          setIsLiveGps(false);
          setLoading(false);
          setError('GPS returned coordinates out of valid boundaries.');
          if (userId) {
            void indexLocationIfChanged(userId, fallback.coords);
          }
        }
      },
      (geoError) => {
        // Tier 2 / Tier 3: Graceful fallback on permission denied, timeout, or location unavailable
        const fallback = resolveFallbackCoordinates(profileCityText);
        setCoords(fallback.coords);
        setSource(fallback.source);
        setIsLiveGps(false);
        setLoading(false);
        setError(geoError.message);

        if (userId) {
          void indexLocationIfChanged(userId, fallback.coords);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000 * 60 * 5, // 5 minute cache
      }
    );
  }, [userId, profileCityText, indexLocationIfChanged]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return {
    coords,
    loading,
    error,
    isLiveGps,
    source,
    refreshLocation: requestLocation,
  };
}
