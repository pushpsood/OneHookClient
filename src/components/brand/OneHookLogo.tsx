/**
 * OneHook Logo
 *
 * Reusable brand mark: a metallic-silver outlined heart with a navy "1".
 * This component simply references the single source-of-truth vector asset at
 * `public/media/onehook-logo.svg` (traced pixel-for-pixel from the master art),
 * so the logo never drifts out of sync across the app.
 *
 * USAGE:
 *   import { OneHookLogo } from '@/components/brand/OneHookLogo';
 *   <OneHookLogo size={48} />
 *   <OneHookLogo width={120} className="header-logo" />
 */

import React from 'react';

/** Public path to the canonical logo vector. */
export const ONEHOOK_LOGO_SRC = '/media/onehook-logo.svg';

export interface OneHookLogoProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Convenience square size in px (sets both width & height) */
  size?: number;
  /** Accessible label (defaults to "OneHook"); pass "" for decorative use */
  alt?: string;
}

export const OneHookLogo: React.FC<OneHookLogoProps> = ({
  size,
  width,
  height,
  alt = 'OneHook',
  ...rest
}) => (
  <img
    src={ONEHOOK_LOGO_SRC}
    alt={alt}
    width={width ?? size}
    height={height ?? size}
    {...rest}
  />
);

export default OneHookLogo;
