#!/usr/bin/env node

/**
 * OneHook Mascot Export Script
 * 
 * Generates mascot files in various formats and sizes for different platforms.
 * 
 * Usage:
 *   node export-mascot.js [options]
 * 
 * Options:
 *   --ios       Generate iOS assets (multiple sizes)
 *   --android   Generate Android assets (multiple densities)
 *   --all       Generate all platform assets
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateCustomMascotSVG, MASCOT_COLOR_VARIANTS } from './AlienMascot.svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXPORT_DIR = join(__dirname, 'exports');

// iOS sizes (for @1x, @2x, @3x)
const IOS_SIZES = [
  { name: 'icon-small', size: 29 },
  { name: 'icon-medium', size: 40 },
  { name: 'icon-large', size: 60 },
  { name: 'icon-xlarge', size: 76 },
  { name: 'icon-xxlarge', size: 83.5 },
];

// Android densities
const ANDROID_DENSITIES = [
  { name: 'mdpi', scale: 1 },
  { name: 'hdpi', scale: 1.5 },
  { name: 'xhdpi', scale: 2 },
  { name: 'xxhdpi', scale: 3 },
  { name: 'xxxhdpi', scale: 4 },
];

function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Directory exists
  }
}

function exportIOS() {
  console.log('📱 Generating iOS assets...');
  const iosDir = join(EXPORT_DIR, 'ios');
  ensureDir(iosDir);

  // Export base SVG
  const baseSVG = generateCustomMascotSVG();
  writeFileSync(join(iosDir, 'onehook-alien-mascot.svg'), baseSVG);
  console.log('  ✓ Base SVG exported');

  // Export color variants
  Object.entries(MASCOT_COLOR_VARIANTS).forEach(([name, colors]) => {
    const svg = generateCustomMascotSVG(colors.primaryColor, colors.scanColor);
    writeFileSync(join(iosDir, `onehook-alien-mascot-${name}.svg`), svg);
  });
  console.log('  ✓ Color variants exported');

  console.log(`\n✅ iOS assets exported to: ${iosDir}`);
  console.log('   Import SVGs into Xcode Assets.xcassets');
  console.log('   Set "Preserve Vector Data" for scalability\n');
}

function exportAndroid() {
  console.log('🤖 Generating Android assets...');
  const androidDir = join(EXPORT_DIR, 'android');
  ensureDir(androidDir);

  // Export base SVG (Android can use SVG as vector drawables)
  const baseSVG = generateCustomMascotSVG();
  writeFileSync(join(androidDir, 'onehook_alien_mascot.svg'), baseSVG);
  console.log('  ✓ Base SVG exported');

  // Export color variants
  Object.entries(MASCOT_COLOR_VARIANTS).forEach(([name, colors]) => {
    const svg = generateCustomMascotSVG(colors.primaryColor, colors.scanColor);
    writeFileSync(join(androidDir, `onehook_alien_mascot_${name}.svg`), svg);
  });
  console.log('  ✓ Color variants exported');

  console.log(`\n✅ Android assets exported to: ${androidDir}`);
  console.log('   Convert to Vector Drawable in Android Studio:');
  console.log('   Right-click res/drawable → New → Vector Asset → Local SVG file\n');
}

function exportMarketing() {
  console.log('🎨 Generating marketing assets...');
  const marketingDir = join(EXPORT_DIR, 'marketing');
  ensureDir(marketingDir);

  // Export all color variants
  Object.entries(MASCOT_COLOR_VARIANTS).forEach(([name, colors]) => {
    const svg = generateCustomMascotSVG(colors.primaryColor, colors.scanColor);
    writeFileSync(join(marketingDir, `onehook-alien-${name}.svg`), svg);
  });
  console.log('  ✓ All color variants exported');

  // Export high-res base
  const baseSVG = generateCustomMascotSVG();
  const highResSVG = baseSVG.replace('width="120"', 'width="1024"').replace('height="120"', 'height="1024"');
  writeFileSync(join(marketingDir, 'onehook-alien-highres.svg'), highResSVG);
  console.log('  ✓ High-res version exported');

  console.log(`\n✅ Marketing assets exported to: ${marketingDir}`);
  console.log('   Use in Adobe Suite, Figma, Sketch, etc.\n');
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.includes('--ios') || args.includes('--all')) {
  exportIOS();
}

if (args.includes('--android') || args.includes('--all')) {
  exportAndroid();
}

if (args.includes('--marketing') || args.includes('--all')) {
  exportMarketing();
}

if (args.length === 0) {
  console.log('🎭 OneHook Mascot Export Script\n');
  console.log('Usage:');
  console.log('  node export-mascot.js --ios       # Export for iOS');
  console.log('  node export-mascot.js --android   # Export for Android');
  console.log('  node export-mascot.js --marketing # Export for marketing');
  console.log('  node export-mascot.js --all       # Export all\n');
  
  // Run all by default if no args
  exportIOS();
  exportAndroid();
  exportMarketing();
}
