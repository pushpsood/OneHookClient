import { describe, expect, it } from 'vitest';
import { FALLBACK_PROFILE_IMAGE, getOptimizedProfileImageSrc } from '../utils/profile-image';

describe('getOptimizedProfileImageSrc', () => {
  it('uses the fallback when the profile has no image', () => {
    expect(getOptimizedProfileImageSrc()).toBe(FALLBACK_PROFILE_IMAGE);
    expect(getOptimizedProfileImageSrc(null)).toBe(FALLBACK_PROFILE_IMAGE);
  });

  it('normalizes Unsplash transformation parameters while preserving other parameters', () => {
    const result = new URL(
      getOptimizedProfileImageSrc('https://images.unsplash.com/photo-1?ixlib=test&w=1200&q=90')
    );

    expect(result.searchParams.get('auto')).toBe('format');
    expect(result.searchParams.get('fit')).toBe('crop');
    expect(result.searchParams.get('q')).toBe('75');
    expect(result.searchParams.get('w')).toBe('480');
    expect(result.searchParams.get('ixlib')).toBe('test');
  });

  it('normalizes sized Picsum paths', () => {
    expect(getOptimizedProfileImageSrc('https://picsum.photos/800/600')).toBe(
      'https://picsum.photos/320/320'
    );
  });

  it('leaves unsupported image providers unchanged', () => {
    const src = 'https://cdn.example.com/profiles/user.jpg?width=1200';
    expect(getOptimizedProfileImageSrc(src)).toBe(src);
  });

  it('retains the legacy best-effort behavior for malformed provider URLs', () => {
    expect(getOptimizedProfileImageSrc('images.unsplash.com/photo?w=900&q=20')).toBe(
      'images.unsplash.com/photo?w=480&q=75'
    );
    expect(getOptimizedProfileImageSrc('picsum.photos/640/480')).toBe('picsum.photos/320/320');
  });
});
