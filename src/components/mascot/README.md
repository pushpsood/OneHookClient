# OneHook Mascot

The official OneHook mascot (Mr.OneHook): a friendly pink, egg‑shaped character with big
expressive eyes, holding a paint brush and a paint bucket. It adds warmth and personality next to
product copy without distracting from it.

> Note: the source files are still named `AlienScanner.tsx` /
> `AlienMascot.svg.ts` / `onehook-alien-mascot.svg` for import stability. The
> current artwork is the pink egg mascot described below (the older
> "alien scanner" concept has been retired).

## 🎨 Design Concept

- **Pink egg body** with a soft top‑left gloss highlight.
- **Big friendly eyes**: white sclera, blue iris, dark pupil and a white
  catch‑light. On the web the eyes softly track the cursor.
- **Happy open mouth** that gently animates.
- **Raised right arm holding a paint brush**, swaying gently on a 4 s loop.
- **Left arm holding a paint bucket**, which swings only in the excited state.
- **Little legs** with rounded feet, and a soft ground shadow.
- **Gentle breathing**: the body subtly scales for life.
- **Silver sparkle ring** (`AiSparkle`) behind the character, with the labels "AI Inside",
  "Understanding", "Privacy Intact" and "100% encrypted". It animates in when scrolled into view.

There is **no** floating/teleporting movement, no lasers, and no antennae; the
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

// Interactive (excited on hover / keyboard focus, clickable)
<AlienScanner size={150} onClick={() => setOpen(true)} />

// Just the character, no brush, bucket, shadow or sparkle ring
<AlienScanner size={34} hideTooltips bare />
```

Current call sites: `src/components/Landing.tsx` (interactive, `forceExcited`, `hideTooltips`) and
`src/components/messenger/Messenger.tsx` (`hideTooltips`, mostly `bare`).

### Props

| Prop           | Type                  | Default     | Description                                                        |
| -------------- | --------------------- | ----------- | ------------------------------------------------------------------ |
| `size`         | `number`              | `undefined` | Fixed square size in px. Omit to let the container size it (`h-full`). |
| `primaryColor` | `string`              | `#ff69b4`   | Body / arms / legs colour.                                         |
| `scanColor`    | `string`              | `#0052CC`   | Eye iris colour.                                                   |
| `className`    | `string`              | –           | Class applied to the wrapper `div`.                                |
| `style`        | `React.CSSProperties` | –           | Inline style for the wrapper `div`.                                |
| `onClick`      | `() => void`          | –           | Makes the mascot interactive: renders a `<button>` and enables the excited state. |
| `hoverLabel`   | `string`              | `'Click to watch Mr.OneHook explain more about onehook.club'` | Tooltip text and the button's `aria-label`. |
| `forceExcited` | `boolean`             | `false`     | Holds the excited state regardless of hover/focus (only when `onClick` is set). |
| `hideTooltips` | `boolean`             | `false`     | Hides the built-in tooltips so they can be rendered elsewhere.     |
| `bare`         | `boolean`             | `false`     | Renders only the character: no paint brush, paint bucket, ground shadow or sparkle ring. |
| `settled`      | `boolean`             | `false`     | Shows the sparkle ring already finished (no pop-in), e.g. on a revisited story screen. |

The SVG uses `preserveAspectRatio="xMidYMax meet"`, so when the container is
taller/shorter than it is wide, the mascot stays bottom‑aligned (feet on the
floor).

### States

- **Idle**: brush arm sways, body breathes, mouth animates, eyes follow the cursor.
- **Excited** (interactive only; on mouse hover, keyboard `:focus-visible` focus, or `forceExcited`):
  the bucket arm swings, the mascot bounces, eyes widen, the smile grows, breathing speeds up, and
  three gold sparkles pulse. Unless `hideTooltips` is set, a tooltip shows `hoverLabel`.
- **Hovered** (interactive only, without `hideTooltips`): a "CLICK TO CONNECT" pill with Instagram
  (`instagram.com/mr.onehook`) and YouTube (`youtube.com/@mr.onehook`) links appears below.

The button and social links report telemetry with `trackProps` (`UiElement.LANDING_DEMO_INTERACT`
and `UiElement.LANDING_SOCIAL_LINK`), as required by the telemetry contract.

The sparkle ring's CSS animations stop under `prefers-reduced-motion: reduce`
(`AiSparkle.css`). The character's Motion animations do not check reduced motion.

---

## 📱 iOS / 🤖 Android / 🎨 Marketing (static SVG)

The static, non‑animated artwork lives in a single source‑of‑truth file:
`onehook-alien-mascot.svg` (120 × 120). `AlienMascot.svg.ts` re‑exports its contents (via a
Vite `?raw` import) so the markup is never duplicated. The static artwork is the plain character
with a raised right hand and a ground shadow; it has no paint brush, paint bucket or sparkle ring.

```ts
import { ALIEN_MASCOT_SVG, generateCustomMascotSVG } from '@/components/mascot';

// Base artwork (string of SVG markup)
const svg = ALIEN_MASCOT_SVG;

// Recolour for a specific context (body colour, eye colour)
const custom = generateCustomMascotSVG('#ff0088', '#00bfff');
```

Batch exports are produced by `export-mascot.js`. It writes SVG files only (base artwork plus the
four colour variants) into `src/components/mascot/exports/{ios,android,marketing}/`; the marketing
set also includes a 1024 × 1024 `onehook-alien-highres.svg`. Running it with no flag exports
everything.

```bash
node src/components/mascot/export-mascot.js --ios        # iOS SVGs
node src/components/mascot/export-mascot.js --android    # Android SVGs (snake_case names)
node src/components/mascot/export-mascot.js --marketing  # marketing SVGs + high-res
node src/components/mascot/export-mascot.js --all        # everything
```

### Color Variants

```ts
import { MASCOT_COLOR_VARIANTS } from '@/components/mascot';

MASCOT_COLOR_VARIANTS.default; // { primaryColor: '#ff69b4', scanColor: '#87ceeb' }
MASCOT_COLOR_VARIANTS.dark;    // { primaryColor: '#ff1493', scanColor: '#4682b4' }
MASCOT_COLOR_VARIANTS.light;   // { primaryColor: '#ffb6c1', scanColor: '#b0e0e6' }
MASCOT_COLOR_VARIANTS.accent;  // { primaryColor: '#ff0088', scanColor: '#00bfff' }
```

> In the static artwork the body is `#ff69b4` and the eyes are `#87ceeb`;
> `generateCustomMascotSVG(primaryColor, scanColor)` swaps exactly those two.

---

## 📐 Size Recommendations

| Context        | Size      | Notes                                  |
| -------------- | --------- | -------------------------------------- |
| Inline / badge | 32–48 px  | Small accent                           |
| Beside copy    | 120–160 px | Companion next to a text block        |
| Marketing hero | 512 px    | High detail                            |
| App export     | 1024 px   | Full artwork                           |

Keep it ≤ ~200 px on the web so it complements rather than competes with content.

---

## 📦 Files

```
src/components/mascot/
├── AlienScanner.tsx          # Animated React component (web): eye tracking, idle and excited states
├── AiSparkle.tsx             # Silver sparkle ring rendered behind the mascot
├── AiSparkle.css             # Sparkle ring animations (reduced-motion aware)
├── AlienMascot.svg.ts        # Static SVG accessor (re-exports the .svg via ?raw) + colour helpers
├── onehook-alien-mascot.svg  # Single source of truth for the static artwork
├── export-mascot.js          # Node script: exports platform SVGs from the .svg
├── index.ts                  # Barrel exports (AlienScanner, ALIEN_MASCOT_SVG, MASCOT_COLOR_VARIANTS, generateCustomMascotSVG)
├── README.md                 # This file
└── DESIGN_SPEC.md            # Visual/animation spec
```

The Mr OneHook chat surfaces use a separate mood-based mascot, `src/components/Chatbot/Mascot.tsx`
(moods `Happy`, `Neutral`, `Thinking`, `Sad`, `Excited`), in `ChatbotWidget.tsx` and
`src/features/chat/ChatView.tsx`. It is not exported from this folder.

---

## 🛠 Maintenance

**Last Updated**: 2026-08-04
**Maintainer**: OneHook Design Team
