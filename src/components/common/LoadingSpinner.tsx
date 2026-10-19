import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

/** Pixel dimensions for each named size. The full-screen loader uses a larger fixed size. */
const SIZE_PX = {
  sm: 20,
  md: 40,
  lg: 56,
} as const;

const FULLSCREEN_PX = 124;

/**
 * The OneHook brand loader: the silver heart flips around the Y axis in 3D while the navy "1" stays
 * fixed on top (matches the iOS HeartLoaderView and the index.html boot splash). This is the single
 * loader used everywhere in the app — inline, per-view (menu switches), and full screen — so the
 * loading experience is identical in every surface.
 */
function HeartLoader({ px }: { px: number }) {
  return (
    <div
      className="relative"
      style={{ width: px, height: px, perspective: px * 5 }}
      role="status"
      aria-label="Loading"
    >
      <img
        src="/media/LogoHeart.png"
        alt=""
        className="absolute inset-0 w-full h-full object-contain animate-oh-flip origin-center"
      />
      <img
        src="/media/LogoOne.png"
        alt=""
        className="absolute inset-0 w-full h-full object-contain z-10"
      />
    </div>
  );
}

export function LoadingSpinner({ size = 'md', fullScreen = false }: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <HeartLoader px={FULLSCREEN_PX} />
      </div>
    );
  }

  return <HeartLoader px={SIZE_PX[size]} />;
}
