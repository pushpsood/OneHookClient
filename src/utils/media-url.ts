import { useEffect, useState } from 'react';
import { ProfileApi } from '../api/profile';
import {
  FALLBACK_PROFILE_IMAGE,
  getOptimizedProfileImageSrc,
  getCachedMediaPreview,
  setCachedMediaPreview,
} from './profile-image';

/**
 * Resolves private `media/…` object keys into displayable URLs.
 *
 * The media bucket blocks all public access, so a raw S3 URL 403s. Instead we ask the backend for a
 * short-lived presigned GET URL (GET /profile/media/download-url) and cache it for the session. Keys
 * that were just uploaded in this browser already have a local data-URL preview cached, so those
 * render instantly without a round-trip.
 */

/** In-flight de-duplication so N <img> tags for the same key trigger a single request. */
const inflight = new Map<string, Promise<string>>();

/** True when `src` is a private S3 media object key that must be resolved via a presigned URL. */
export function isMediaKey(src?: string | null): src is string {
  return !!src && src.startsWith('media/');
}

/**
 * Resolves a media key to a usable URL: cached preview → presigned GET URL. The resolved URL is
 * written back into the shared media cache so subsequent synchronous reads (and other components)
 * reuse it.
 */
export async function resolveMediaUrl(key: string): Promise<string> {
  const cached = getCachedMediaPreview(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = ProfileApi.getDownloadUrl(key)
    .then(({ downloadUrl }) => {
      setCachedMediaPreview(key, downloadUrl);
      inflight.delete(key);
      return downloadUrl;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * React hook that returns a renderable src for a profile image/audio value.
 *
 * - `data:`/`blob:`/remote URLs are returned immediately (via {@link getOptimizedProfileImageSrc}).
 * - `media/…` keys resolve asynchronously to a presigned URL; the hook returns a fallback while the
 *   request is in flight and re-renders once resolved.
 */
export function useMediaSrc(src?: string | null): string {
  const [resolved, setResolved] = useState<string>(() =>
    isMediaKey(src) ? getCachedMediaPreview(src) ?? FALLBACK_PROFILE_IMAGE : getOptimizedProfileImageSrc(src)
  );

  useEffect(() => {
    let active = true;

    if (isMediaKey(src)) {
      const cached = getCachedMediaPreview(src);
      if (cached) {
        setResolved(cached);
        return;
      }
      setResolved(FALLBACK_PROFILE_IMAGE);
      resolveMediaUrl(src)
        .then((url) => {
          if (active) setResolved(url);
        })
        .catch(() => {
          if (active) setResolved(FALLBACK_PROFILE_IMAGE);
        });
    } else {
      setResolved(getOptimizedProfileImageSrc(src));
    }

    return () => {
      active = false;
    };
  }, [src]);

  return resolved;
}
