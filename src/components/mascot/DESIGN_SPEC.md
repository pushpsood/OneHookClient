# OneHook Alien Scanner — Design Specification

## 🎨 Visual Identity

### Character Design
```
     ○ ○  ← Antennae with glowing tips (signal detection)
      \ /
   ╭───────╮
   │ ◉═◉ │  ← Binocular scanner eyes (dual analysis)
   │   ═   │  ← Bridge (connected perspective)
   │   ⌣   │  ← Subtle smile (friendly AI)
   ╰───────╯
      ╲ ╱
```

### Color Palette

**Primary (Default)**
- Body: `#ff69b4` (Hot Pink) — Represents warmth, connection, romance
- Scan: `#0052CC` (OneHook Brand Blue) — Represents intelligence, trust, precision

**Variants**
- Dark Mode: `#ff1493` / `#003d99` (Deep pink / Dark blue)
- Light Mode: `#ffb6c1` / `#4d88ff` (Light pink / Light blue)
- Accent: `#ff0088` / `#0066ff` (Magenta / Bright blue)

### Animation States

1. **Scanning (Active) — Mouse Interactive**
   - Eyes track cursor position in real-time
   - Dual laser beams emit from each eye
   - Laser beams converge at cursor position with pulsing glow
   - Moves vertically through features from top to bottom
   - Eyes pulsate with scanning rings expanding outward
   - Antennae oscillate gently
   - Body subtly breathes (scale)
   - Loops continuously, resetting at bottom

2. **Idle**
   - Slow eye blink animation
   - Gentle antenna sway
   - Minimal scanning ring pulse
   - Eyes still track mouse but with reduced intensity

3. **Success** (future)
   - Rapid eye blink
   - Antennae point upward
   - Green glow intensifies

4. **Thinking** (future)
   - Eyes narrow slightly
   - Antennae lean inward
   - Scanning beam accelerates

## 🎭 Character Personality

**Name**: Scanner (internal codename)

**Role**: OneHook's quality assurance mascot — validates profiles for authenticity, scans for compatibility signals, ensures match robustness.

**Personality Traits**:
- Diligent and thorough
- Friendly but focused
- Tech-savvy and precise
- Trustworthy guardian

**Voice** (if adding text/sound):
- Short, technical confirmations ("Verified", "Match found", "Scanning...")
- Friendly but professional tone
- Minimal but helpful

## 📐 Technical Specifications

### Dimensions
- Base canvas: 120×120px
- Alien body: 70×84px (centered)
- Eye spacing: 30px apart
- Eye diameter: 20px (outer), 16px (inner lens)
- Antenna height: ~45px from top of head

### Animation Timing
- Eye pulse: 1.5s cycle
- Scanning rings: 2s expansion + fade
- Antenna sway: 2.5s cycle
- Body breathing: 3s cycle
- Horizontal scan: 20s (scroll-based varies)

### Performance
- SVG-based (scalable, lightweight)
- CSS/Motion animations (GPU-accelerated)
- No external dependencies beyond Motion/React
- ~8KB unminified

## 🎯 Usage Context

### Web
- Landing page "science" section (validates algorithm features)
- Loading screens
- Error states (gentle, non-intrusive)
- Success confirmations

### Mobile
- Splash screen
- Profile verification indicator
- Match success celebration
- Settings/about section

### Marketing
- Social media avatar
- Email headers
- Presentation slides
- Promotional materials
- Stickers/swag

## 🚫 Don'ts

- Don't make eyes red (suggests error/danger)
- Don't add aggressive expressions (keep friendly)
- Don't over-animate (should be subtle background element)
- Don't obscure main content (z-index ≤ 10)
- Don't make larger than 200px on web (distracting)

## ✅ Do's

- Keep animation smooth and non-jarring
- Use as subtle quality indicator
- Match animation to user context (faster during loading, slower when idle)
- Keep colors consistent with brand
- Scale appropriately for device (smaller on mobile)

## 📊 A/B Testing Ideas

Future experiments:
- With vs. without scanning beam
- Different scanning speeds
- Eye color variations
- Size impact on engagement
- Static vs. animated versions

## 🔄 Version History

- **v1.0** (2026-08-02): Initial release
  - Binocular eyes with scanning rings
  - Horizontal scanning beam
  - Animated antennae
  - Breathing body
  - Scroll-based movement

## 📝 Notes

The alien design deliberately avoids being too cute or cartoonish — it should feel like a sophisticated AI companion rather than a playful mascot. The binocular eyes reinforce the core OneHook concept of "two-way compatibility" rather than one-sided swiping.

The scanning animation serves both aesthetic and functional purposes:
1. **Visual interest**: Adds movement to static sections
2. **Brand reinforcement**: Represents continuous quality assurance
3. **Trust signal**: Shows the algorithm actively working
4. **Delighter**: Subtle discovery for engaged users

---

**Design Lead**: OneHook Team  
**Last Updated**: 2026-08-02
