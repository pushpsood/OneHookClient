# OneHook Mascot — Design Specification

## 🎨 Visual Identity

### Character Design

```
        ╭───────╮
       (  ◕   ◕  )   ← big friendly eyes (blue iris, dark pupil, white catch-light)
       (    ‿    )   ← happy open mouth
   \  (           )     ← waving right arm
    \_(  pink egg  )
       (           )
        ╰─┳──────┳─╯
          ┃      ┃      ← little legs + feet
```

A rounded, egg‑shaped body with a glossy highlight, two large eyes, a cheerful
mouth, two arms (one waving) and two short legs.

### Color Palette

**Primary (Default)**

- Body: `#ff69b4` (hot pink) — warmth, connection, romance
- Eyes (iris): `#0052CC` (brand blue) in the web component / `#87ceeb` (sky blue)
  in the static artwork
- Pupil: `#0d1b3e` (near‑navy)
- Mouth: `#7d1f3d` with a `#ff6f9c` tongue highlight
- Gloss: white at low opacity for the 3D sheen

**Variants** (`MASCOT_COLOR_VARIANTS`)

- Dark: `#ff1493` / `#4682b4`
- Light: `#ffb6c1` / `#b0e0e6`
- Accent: `#ff0088` / `#00bfff`

### Animation States (web)

1. **Idle / engaging (default)**
   - Right arm **waves** on a gentle loop (rotates around the shoulder, with a
     short pause between waves).
   - Eyes **softly track the cursor** (springy iris offset).
   - Body **breathes** (subtle vertical scale).
   - Mouth gently animates.

2. **Reduced motion**
   - Respect `prefers-reduced-motion`; keep the mascot calm/static.

There is intentionally **no** roaming/teleporting movement and **no** laser or
scanning effects — the mascot sits beside content as a friendly companion.

## 🎭 Character Personality

- Warm, upbeat, welcoming.
- A friendly greeter that waves hello — not a technical/AI "scanner".
- Playful but not distracting.

## 📐 Technical Specifications

### Dimensions

- Base canvas: `120×120` (viewBox `0 0 120 120`)
- Body (egg): centered, roughly `68×84`
- Eyes: white ellipse `rx 11 / ry 13`, iris `r 7.5`, pupil `r 4`
- Feet at the bottom; a soft ground shadow anchors the character

### Animation Timing

- Hand wave: ~1.8s with a ~1.1s pause between waves
- Eye tracking: spring (stiffness 200, damping 20)
- Body breathing: ~3.5s cycle
- Mouth: ~3s cycle

### Rendering

- Pure SVG (scalable, lightweight)
- Motion/React for animation (GPU‑accelerated transforms)
- `preserveAspectRatio="xMidYMax meet"` so feet stay bottom‑aligned when the
  container aspect differs

## 🎯 Usage Context

- **Web**: beside the "science of one good match" copy on the landing page;
  small inline accents.
- **Mobile / marketing**: static SVG export (see `README.md`).

## 🚫 Don'ts

- Don't add lasers, antennae, or scanning rings (retired concept).
- Don't let it roam/float over text.
- Don't recolour the eyes to red (reads as error).
- Don't exceed ~200px on the web.

## ✅ Do's

- Keep the wave subtle and friendly.
- Bottom‑align the feet to the surrounding content.
- Keep colours on‑brand (pink body, blue eyes).
- Scale down gracefully on smaller screens.

## 🔄 Version History

- **v2.0** (2026-08-04): Pink egg mascot — waving hand, cursor eye‑tracking,
  breathing; static placement. Retired the "alien scanner" (binocular eyes,
  lasers, antennae, roaming movement).
- **v1.0** (2026-08-02): Initial "alien scanner" concept.

---

**Design Lead**: OneHook Team
**Last Updated**: 2026-08-04
