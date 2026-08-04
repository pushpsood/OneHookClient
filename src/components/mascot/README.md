# OneHook Mascot

The official OneHook mascot — a friendly pink, egg‑shaped character with big
expressive eyes and a cheerful wave. It adds warmth and personality next to
product copy without distracting from it.

> Note: the source files are still named `AlienScanner.tsx` /
> `AlienMascot.svg.ts` / `onehook-alien-mascot.svg` for import stability. The
> current artwork is the pink egg mascot described below (the older
> "alien scanner" concept has been retired).

## 🎨 Design Concept

- **Pink egg body** with a soft top‑left gloss highlight.
- **Big friendly eyes** — white sclera, blue iris, dark pupil and a white
  catch‑light. On the web the eyes softly track the cursor.
- **Happy open mouth** that gently animates (breathing).
- **Waving hand** — the raised right arm waves on a loop for engagement.
- **Little arms & legs** with rounded hands and feet.
- **Gentle breathing** — the body subtly scales for life.

There is **no** floating/teleporting movement, no lasers, and no antennae — the
mascot is placed statically beside content.

---

## 🌐 Web Usage (React)

```tsx
import { AlienScanner } from '@/components/mascot';

// Fixed size
<AlienScanner size={150} />

// Or fill a container (e.g. match a text block's height)
<div className="relative">
  {/* ...text... */}
  <div className="absolute right-0 top-0 bottom-0 translate-x-full pl-10">
    <AlienScanner className="h-full aspect-square" />
  </div>
</div>
```

### Props

| Prop           | Type                  | Default     | Description                                                        |
| -------------- | --------------------- | ----------- | ------------------------------------------------------------------ |
| `size`         | `number`              | `undefined` | Fixed square size in px. Omit to let the container size it (`h-full`). |
| `primaryColor` | `string`              | `#ff69b4`   | Body / arms / legs colour.                                         |
| `scanColor`    | `string`              | `#0052CC`   | Eye iris colour.                                                   |
| `className`    | `string`              | –           | Class applied to the wrapper `div`.                                |
| `style`        | `React.CSSProperties` | –           | Inline style for the wrapper `div`.                                |

The SVG uses `preserveAspectRatio="xMidYMax meet"`, so when the container is
taller/shorter than it is wide, the mascot stays bottom‑aligned (feet on the
floor).

---

## 📱 iOS / 🤖 Android / 🎨 Marketing (static SVG)

The static, non‑animated artwork lives in a single source‑of‑truth file:
`onehook-alien-mascot.svg`. `AlienMascot.svg.ts` re‑exports its contents (via a
Vite `?raw` import) so the markup is never duplicated.

```ts
import { ALIEN_MASCOT_SVG, generateCustomMascotSVG } from '@/components/mascot';

// Base artwork (string of SVG markup)
const svg = ALIEN_MASCOT_SVG;

// Recolour for a specific context (body colour, eye colour)
const custom = generateCustomMascotSVG('#ff0088', '#00bfff');
```

Batch exports for native platforms are produced by `export-mascot.js`:

```bash
node src/components/mascot/export-mascot.js --ios       # iOS sizes
node src/components/mascot/export-mascot.js --android   # Android densities
node src/components/mascot/export-mascot.js --all       # everything
```

### Color Variants

```ts
import { MASCOT_COLOR_VARIANTS } from '@/components/mascot';

MASCOT_COLOR_VARIANTS.default; // { primaryColor: '#ff69b4', scanColor: '#87ceeb' }
MASCOT_COLOR_VARIANTS.dark;
MASCOT_COLOR_VARIANTS.light;
MASCOT_COLOR_VARIANTS.accent;
```

> In the static artwork the body is `#ff69b4` and the eyes are `#87ceeb`;
> `generateCustomMascotSVG(primaryColor, scanColor)` swaps exactly those two.

---

## 📐 Size Recommendations

| Context        | Size      | Notes                                  |
| -------------- | --------- | -------------------------------------- |
| Inline / badge | 32–48 px  | Small accent                           |
| Beside copy    | 120–160 px | Waving companion next to a text block |
| Marketing hero | 512 px    | High detail                            |
| App export     | 1024 px   | Full artwork                           |

Keep it ≤ ~200 px on the web so it complements rather than competes with content.

---

## 📦 Files

```
src/components/mascot/
├── AlienScanner.tsx          # Animated React component (web) — waving + eye tracking
├── AlienMascot.svg.ts        # Static SVG accessor (re-exports the .svg via ?raw) + colour helpers
├── onehook-alien-mascot.svg  # Single source of truth for the static artwork
├── export-mascot.js          # Node script: exports platform assets from the .svg
├── index.ts                  # Barrel exports
├── README.md                 # This file
└── DESIGN_SPEC.md            # Visual/animation spec
```

---

## 🛠️ Maintenance

**Last Updated**: 2026-08-04
**Maintainer**: OneHook Design Team
