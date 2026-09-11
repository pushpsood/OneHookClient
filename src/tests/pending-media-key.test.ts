import { describe, expect, it } from 'vitest';
import { isMediaKey } from '../utils/media-url';
import { getOptimizedProfileImageSrc } from '../utils/profile-image';

/**
 * Uploads are signed into `pending/{userId}/{uuid}`, not `media/{userId}/{uuid}`: an S3 POST policy is
 * only checked when a request starts, so an admitted transfer can land at an arbitrary later time. The
 * backend copies a claimed upload into `media/` during a profile save, and an unclaimed one is expired by
 * an S3 Lifecycle rule.
 *
 * The consequence for this client is that a freshly uploaded key is `pending/…` until the profile is
 * saved, and `media/…` afterwards. Anything that decides "is this a private S3 key?" must accept both, or
 * a just-uploaded photo is treated as a plain URL and renders broken.
 */
describe('pending upload keys', () => {
  it('treats pending keys as private S3 keys needing a presigned URL', () => {
    expect(isMediaKey('pending/user-1/abc-123')).toBe(true);
    expect(isMediaKey('media/user-1/abc-123')).toBe(true);
  });

  it('still rejects values that are already renderable or empty', () => {
    expect(isMediaKey('https://example.com/x.jpg')).toBe(false);
    expect(isMediaKey('data:image/png;base64,AAAA')).toBe(false);
    expect(isMediaKey('blob:http://localhost/abc')).toBe(false);
    expect(isMediaKey(null)).toBe(false);
    expect(isMediaKey(undefined)).toBe(false);
    expect(isMediaKey('')).toBe(false);
  });

  it('routes a pending key to the bucket rather than the image fallback', () => {
    const resolved = getOptimizedProfileImageSrc('pending/user-1/abc-123');
    expect(resolved).toContain('pending/user-1/abc-123');
  });
});
