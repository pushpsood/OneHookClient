import type { CSSProperties } from 'react';

export interface PictureTransform { focalX: number; focalY: number; zoom: number }
export const CENTERED_TRANSFORM: PictureTransform = { focalX: 0.5, focalY: 0.5, zoom: 1 };

export function parsePictureTransform(value?: string | null): PictureTransform {
  if (!value) return CENTERED_TRANSFORM;
  const raw = value.startsWith('v1:') ? value.slice(3) : value;
  const [x, y, zoom] = raw.split(',').map(Number);
  if (![x, y, zoom].every(Number.isFinite)) return CENTERED_TRANSFORM;
  return {
    focalX: Math.min(1, Math.max(0, x)),
    focalY: Math.min(1, Math.max(0, y)),
    zoom: Math.min(4, Math.max(1, zoom)),
  };
}

/** Applies only presentation metadata; the original image URL/file remains unchanged. */
export function pictureTransformStyle(value?: string | null): CSSProperties {
  const t = parsePictureTransform(value);
  return {
    objectPosition: `${t.focalX * 100}% ${t.focalY * 100}%`,
    transformOrigin: `${t.focalX * 100}% ${t.focalY * 100}%`,
    transform: `scale(${t.zoom})`,
  };
}
