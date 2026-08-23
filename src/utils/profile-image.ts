export const FALLBACK_PROFILE_IMAGE =
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=75&w=480';

const PROFILE_IMAGE_WIDTH = 480;

const inMemoryMediaCache = new Map<string, string>();

/** Cache local media preview (DataURL / ObjectURL) for an S3 media key. */
export function setCachedMediaPreview(key: string, url: string) {
  if (!key) return;
  inMemoryMediaCache.set(key, url);
  try {
    if (typeof window !== 'undefined' && url.startsWith('data:')) {
      // Store smaller previews in sessionStorage for resilience across page reloads
      if (url.length < 500_000) {
        sessionStorage.setItem(`media_prev_${key}`, url);
      }
    }
  } catch {
    // Ignore storage quota limits
  }
}

/** Retrieve cached preview for an S3 media key if available. */
export function getCachedMediaPreview(key: string): string | undefined {
  if (!key) return undefined;
  if (inMemoryMediaCache.has(key)) {
    return inMemoryMediaCache.get(key);
  }
  try {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`media_prev_${key}`);
      if (stored) {
        inMemoryMediaCache.set(key, stored);
        return stored;
      }
    }
  } catch {
    // Ignore storage read issues
  }
  return undefined;
}

/** Convert a File or Blob to a Data URL string. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Normalizes supported remote image URLs without changing unknown providers. */
export function getOptimizedProfileImageSrc(src?: string | null): string {
  if (!src) return FALLBACK_PROFILE_IMAGE;

  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }

  if (src.startsWith('media/')) {
    const cached = getCachedMediaPreview(src);
    if (cached) return cached;
    return `https://onehook-profile-gamma-media.s3.ap-south-1.amazonaws.com/${src}`;
  }

  try {
    const url = new URL(src);

    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('q', '75');
      url.searchParams.set('w', String(PROFILE_IMAGE_WIDTH));
      return url.toString();
    }

    if (url.hostname === 'picsum.photos') {
      url.pathname = url.pathname.replace(/\/\d+\/\d+$/, '/320/320');
      return url.toString();
    }

    return src;
  } catch {
    if (src.includes('images.unsplash.com')) {
      return src.replace(/w=\d+/g, `w=${PROFILE_IMAGE_WIDTH}`).replace(/q=\d+/g, 'q=75');
    }

    if (src.includes('picsum.photos')) {
      return src.replace(/\/\d+\/\d+$/, '/320/320');
    }

    return src;
  }
}
