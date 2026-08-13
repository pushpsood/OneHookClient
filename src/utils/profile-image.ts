export const FALLBACK_PROFILE_IMAGE =
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=75&w=480';

const PROFILE_IMAGE_WIDTH = 480;

/** Normalizes supported remote image URLs without changing unknown providers. */
export function getOptimizedProfileImageSrc(src?: string | null): string {
  if (!src) return FALLBACK_PROFILE_IMAGE;

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
