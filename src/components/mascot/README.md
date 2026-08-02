# OneHook Alien Scanner Mascot

The official OneHook mascot — a futuristic binocular-eyed alien that scans for quality matches.

## 🎨 Design Concept

The alien represents OneHook's intelligent matching algorithm:
- **Binocular eyes**: Dual perspective analysis (reciprocal compatibility) — eyes track the user's pointer
- **Converging laser beams**: Two beams from each eye that converge at cursor position
- **Antennae**: Signal detection and intent awareness
- **Smooth movement**: Continuous vertical scanning through features
- **Interactive tracking**: Eyes and lasers follow mouse movement in real-time

---

## 🌐 Web Usage (React)

### Basic Implementation

```tsx
import { AlienScanner } from '@/components/mascot';

function MyComponent() {
  return (
    <div style={{ position: 'relative', height: '400px' }}>
      <AlienScanner 
        scrollBased={true}
        size={120}
        showBeam={true}
      />
    </div>
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `scrollBased` | `boolean` | `true` | Enable scroll-based movement |
| `scrollContainer` | `RefObject` | `window` | Container for scroll tracking |
| `speed` | `number` | `20` | Animation speed (auto mode) |
| `size` | `number` | `120` | Size in pixels |
| `primaryColor` | `string` | `#00ff88` | Alien body color |
| `scanColor` | `string` | `#00ffff` | Eye/antenna color |
| `showBeam` | `boolean` | `true` | Enable scanning beam |
| `zIndex` | `number` | `10` | Layer z-index |

---

## 📱 iOS Usage

### Export SVG for Xcode

1. Generate the SVG:
```typescript
import { ALIEN_MASCOT_SVG } from './components/mascot';
// Save ALIEN_MASCOT_SVG to file
```

2. Save as `onehook-alien-mascot.svg`

3. Import into Xcode:
   - Drag SVG into Assets.xcassets
   - Set as "Preserve Vector Data"
   - Use in SwiftUI:

```swift
Image("onehook-alien-mascot")
    .resizable()
    .frame(width: 120, height: 120)
```

### Custom Colors

```typescript
import { generateCustomMascotSVG } from './components/mascot';

const customSVG = generateCustomMascotSVG(
  '#ff0088', // primaryColor
  '#ffff00'  // scanColor
);
```

---

## 🤖 Android Usage

### Export for Android Studio

1. Generate the SVG (same as iOS)

2. Convert to Vector Drawable:
   - Right-click `res/drawable` → New → Vector Asset
   - Choose "Local file" and select the SVG
   - Or use: File → New → Vector Asset → Local SVG file

3. Use in XML:

```xml
<ImageView
    android:layout_width="120dp"
    android:layout_height="120dp"
    android:src="@drawable/onehook_alien_mascot"
    android:contentDescription="OneHook Mascot" />
```

4. Use in Compose:

```kotlin
Image(
    painter = painterResource(id = R.drawable.onehook_alien_mascot),
    contentDescription = "OneHook Mascot",
    modifier = Modifier.size(120.dp)
)
```

---

## 🎨 Marketing & Design Tools

### Adobe Illustrator / Photoshop
1. Copy SVG code from `AlienMascot.svg.ts`
2. File → Place → Paste SVG code
3. Fully editable vector

### Figma
1. Copy SVG code
2. Figma → File → Place → Paste as SVG
3. Or use Figma plugin "SVG Import"

### Sketch
1. Create new artboard
2. Insert → SVG → Paste code

---

## 🎭 Animation Guidelines

### Web Animation Features
- Smooth left-to-right scanning
- Pulsating binocular eyes with scanning rings
- Oscillating antennae
- Breathing body motion
- Optional horizontal scanning beam

### Mobile Animation Recommendations
For iOS/Android, consider using:
- **iOS**: Core Animation or Lottie
- **Android**: Vector Drawable Animations or Lottie

Export Lottie JSON from After Effects for frame-perfect animation sync across all platforms.

---

## 🎨 Color Variants

```typescript
import { MASCOT_COLOR_VARIANTS } from './components/mascot';

// Default (OneHook brand)
MASCOT_COLOR_VARIANTS.default // green/cyan

// Dark mode
MASCOT_COLOR_VARIANTS.dark

// Light mode
MASCOT_COLOR_VARIANTS.light

// Accent (special events)
MASCOT_COLOR_VARIANTS.accent // pink/yellow
```

---

## 📐 Size Recommendations

| Context | Size | Notes |
|---------|------|-------|
| App icon | 1024×1024 | Full mascot |
| Navigation | 32×32 | Head only |
| Loading screen | 200×200 | Full mascot with animation |
| Marketing hero | 512×512 | High detail |
| Social media | 400×400 | Profile picture |

---

## 📦 Export Files

### For Cross-Platform Use

The mascot is organized in separate files for easy distribution:

```
src/components/mascot/
├── AlienScanner.tsx        # React animated component (web)
├── AlienMascot.svg.ts      # Pure SVG export (mobile/marketing)
├── index.ts                # Barrel exports
└── README.md               # This file
```

### Distribution Checklist

When sharing mascot assets with iOS/Android teams:

- [ ] Export static SVG from `AlienMascot.svg.ts`
- [ ] Provide color variants
- [ ] Share this README for implementation guidance
- [ ] Consider exporting Lottie animation for native apps

---

## 🚀 Future Enhancements

Potential additions:
- [ ] Lottie animation export
- [ ] Additional expressions (happy, thinking, success)
- [ ] Interactive hover states
- [ ] Sound effects integration
- [ ] Seasonal variants (holiday themes)

---

## 📄 License

This mascot is proprietary to OneHook and should only be used for official OneHook products, marketing, and branding.

---

## 🛠️ Maintenance

**Created**: 2026-08-02  
**Last Updated**: 2026-08-02  
**Maintainer**: OneHook Design Team
