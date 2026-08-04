/**
 * OneHook Mascot - static SVG accessor.
 *
 * The mascot artwork lives in exactly ONE place: ./onehook-alien-mascot.svg
 * This module re-exports that file's contents (imported raw at build time by
 * Vite) so the markup is never duplicated. It also provides colour variants and
 * a helper to recolour the mascot for different platforms/contexts.
 *
 * USAGE:
 *   import { ALIEN_MASCOT_SVG, generateCustomMascotSVG } from '@/components/mascot';
 */

import mascotSvg from './onehook-alien-mascot.svg?raw';

/** The canonical mascot SVG markup (single source of truth: the .svg file). */
export const ALIEN_MASCOT_SVG = mascotSvg;

/**
 * Color variants for different contexts
 */
export const MASCOT_COLOR_VARIANTS = {
  default: {
    primaryColor: '#ff69b4',
    scanColor: '#87ceeb',
  },
  dark: {
    primaryColor: '#ff1493',
    scanColor: '#4682b4',
  },
  light: {
    primaryColor: '#ffb6c1',
    scanColor: '#b0e0e6',
  },
  accent: {
    primaryColor: '#ff0088',
    scanColor: '#00bfff',
  },
};

/**
 * Export function to generate custom colored SVG
 */
export function generateCustomMascotSVG(
  primaryColor: string = '#ff69b4',
  scanColor: string = '#87ceeb'
): string {
  return ALIEN_MASCOT_SVG
    .replace(/#ff69b4/g, primaryColor)
    .replace(/#87ceeb/g, scanColor);
}
