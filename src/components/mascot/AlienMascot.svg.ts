/**
 * OneHook Alien Scanner Mascot - Static SVG Export
 * 
 * This file contains the pure SVG version of the mascot for use in:
 * - iOS apps (import into Xcode)
 * - Android apps (import into Android Studio)
 * - Marketing materials (Adobe Suite, Figma, etc.)
 * 
 * USAGE:
 * 1. Copy the SVG code below
 * 2. Save as "onehook-alien-mascot.svg"
 * 3. Import into your platform of choice
 * 
 * CUSTOMIZATION:
 * - Change primaryColor for body color
 * - Change scanColor for eye/antenna color
 * - Adjust viewBox for different aspect ratios
 */

export const ALIEN_MASCOT_SVG = `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="headGlow" cx="50%" cy="30%">
      <stop offset="0%" stop-color="#87ceeb" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#87ceeb" stop-opacity="0" />
    </radialGradient>
    
    <radialGradient id="eyeGlow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#87ceeb" stop-opacity="1" />
      <stop offset="100%" stop-color="#87ceeb" stop-opacity="0.6" />
    </radialGradient>
  </defs>

  <!-- Alien head (oval) -->
  <ellipse cx="60" cy="55" rx="35" ry="42" fill="#ff69b4" opacity="0.9"/>
  
  <!-- Head glow -->
  <ellipse cx="60" cy="55" rx="35" ry="42" fill="url(#headGlow)" opacity="0.4"/>

  <!-- Left binocular eye -->
  <g class="left-eye">
    <circle cx="45" cy="50" r="12" fill="#1a1a2e" opacity="0.8"/>
    <circle cx="45" cy="50" r="10" fill="url(#eyeGlow)"/>
    <circle cx="47" cy="48" r="3" fill="white" opacity="0.9"/>
    <!-- Scanning ring -->
    <circle cx="45" cy="50" r="13" stroke="#87ceeb" stroke-width="1" fill="none" opacity="0.5"/>
  </g>

  <!-- Right binocular eye -->
  <g class="right-eye">
    <circle cx="75" cy="50" r="12" fill="#1a1a2e" opacity="0.8"/>
    <circle cx="75" cy="50" r="10" fill="url(#eyeGlow)"/>
    <circle cx="77" cy="48" r="3" fill="white" opacity="0.9"/>
    <!-- Scanning ring -->
    <circle cx="75" cy="50" r="13" stroke="#87ceeb" stroke-width="1" fill="none" opacity="0.5"/>
  </g>

  <!-- Binocular bridge -->
  <rect x="53" y="48" width="14" height="4" rx="2" fill="#1a1a2e" opacity="0.6"/>

  <!-- Left antenna -->
  <line x1="40" y1="20" x2="35" y2="8" stroke="#ff69b4" stroke-width="2" stroke-linecap="round"/>
  <circle cx="35" cy="8" r="3" fill="#87ceeb" opacity="0.9"/>

  <!-- Right antenna -->
  <line x1="80" y1="20" x2="85" y2="8" stroke="#ff69b4" stroke-width="2" stroke-linecap="round"/>
  <circle cx="85" cy="8" r="3" fill="#87ceeb" opacity="0.9"/>

  <!-- Subtle mouth -->
  <path d="M 50 70 Q 60 75 70 70" stroke="#ff69b4" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>

  <!-- Body hint -->
  <path d="M 35 85 Q 60 95 85 85" stroke="#ff69b4" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>
</svg>
`;

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
