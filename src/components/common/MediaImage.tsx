import type { ImgHTMLAttributes } from 'react';
import { useMediaSrc } from '../../utils/media-url';

type MediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** A profile media value: a private `media/…` object key, a data/blob URL, or a remote URL. */
  src?: string | null;
};

/**
 * Renders a profile image, resolving private `media/…` object keys into short-lived presigned URLs
 * (the media bucket is not public). Drop-in replacement for `<img src={getOptimizedProfileImageSrc(x)} />`.
 */
export function MediaImage({ src, ...rest }: MediaImageProps) {
  const resolved = useMediaSrc(src);
  return <img src={resolved} {...rest} />;
}
