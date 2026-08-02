/**
 * OneHook Alien Scanner Mascot - Export Module
 * 
 * This module exports all mascot-related components and assets for use across platforms.
 * 
 * WEB USAGE:
 * import { AlienScanner } from '@/components/mascot';
 * <AlienScanner scrollBased size={120} />
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
