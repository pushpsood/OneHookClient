/**
 * OneHook Mascot - Export Module
 *
 * The friendly pink egg mascot (waving hand + cursor eye-tracking on web).
 * Exports the animated React component plus the static SVG artwork and helpers
 * for mobile/marketing use.
 *
 * WEB USAGE:
 * import { AlienScanner } from '@/components/mascot';
 * <AlienScanner size={150} />
 *
 * MOBILE/MARKETING USAGE:
 * import { ALIEN_MASCOT_SVG, generateCustomMascotSVG } from '@/components/mascot';
 */

export { AlienScanner } from './AlienScanner';
export {
  ALIEN_MASCOT_SVG,
  MASCOT_COLOR_VARIANTS,
  generateCustomMascotSVG,
} from './AlienMascot.svg';
