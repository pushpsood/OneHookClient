import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { BRAND, ENGINE_META, type ChapterDef } from './ScienceUi';

/**
 * Orbit navigator: a half-oval dial anchored to the left edge of the screen (taller than it is wide).
 *
 * Every chapter sits on a ring. The ring turns continuously with scroll, so the chapter you are
 * reading glides into the fixed pointer at the dial's midpoint (3 o'clock) and locks there; the
 * others fan out above and below and fade with their distance. Around it: a tick ring that turns
 * with the chapters, a counter-rotating inner orbit, and an outer arc that fills with overall
 * reading progress. Click any chapter to travel to it.
 */

const DISC = 170; // half-oval reach along x (px)
const OVAL = 1.45; // vertical stretch: every ring is an ellipse with ry = r * OVAL (1 = circle, >1 = taller)
const RING = 144; // chapter ring "radius" (x semi-axis)
const TICK_R = 158; // tick ring
const PROGRESS_R = 165; // progress arc
const CONTENT_MAX = 1152; // max-w-6xl: the page content the dial must not cover when idle
const STEP = 28; // degrees between chapters (parametric angle; the taller oval spreads them out)
const H = Math.round(DISC * 2 * OVAL);
const CY = H / 2; // vertical centre of the dial

/** Point on the ellipse (rx = r, ry = r·OVAL) at parametric angle `deg` (0° = 3 o'clock). */
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.cos(a), y: CY + r * OVAL * Math.sin(a) };
};

// Curved label: just outside the chapter ring, close enough to the disc edge to stay inside the
// narrowest peek (~52px at 1280px wide), and on a short enough arc that its ends stay on screen too.
const LABEL_R = RING + 3;
const LABEL_GAP = 6; // degrees kept clear on each side of the pointer and the current-chapter dot
// The narrowest peek (1280px wide) shows only ±36° of the ring, so both halves stay inside that.
// Near the pointer the tall oval gives more arc per degree, so these spans comfortably fit the labels.
const NUMBER_SPAN = 30; // chapter number: above the dot, ending at it
const TITLE_SPAN = 50; // chapter title: below the dot, starting at it

/** Clockwise arc from `fromDeg` to `toDeg` (0° = 3 o'clock), so text on it reads top → bottom. */
function labelArc(r: number, fromDeg: number, toDeg: number) {
  const a = polar(r, fromDeg);
  const b = polar(r, toDeg);
  return `M ${a.x} ${a.y} A ${r} ${r * OVAL} 0 0 1 ${b.x} ${b.y}`;
}

/** Length along the ellipse (rx = r, ry = r·OVAL) between two parametric angles. */
function arcLength(r: number, fromDeg: number, toDeg: number, steps = 48) {
  let len = 0;
  let prev = polar(r, fromDeg);
  for (let i = 1; i <= steps; i++) {
    const p = polar(r, fromDeg + ((toDeg - fromDeg) * i) / steps);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

const TITLE_FONT = 8.5;
const TITLE_FONT_MIN = 6.5;

/** SVG arc path on the visible half (−90° top → +90° bottom), `t` in 0..1 of that sweep. */
function arcPath(r: number, t: number) {
  const start = polar(r, -90);
  const end = polar(r, -90 + 180 * Math.max(0, Math.min(1, t)));
  const large = 180 * t > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r * OVAL} 0 ${large} 1 ${end.x} ${end.y}`;
}

/**
 * Continuous reading position: chapter index plus fraction through it, measured at the line 45%
 * down the viewport. −1 while the hero is on screen; stays on the last chapter through the finale.
 */
function useChapterPosition(ids: readonly string[]) {
  const [state, setState] = useState({ pos: -1, progress: 0 });
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.45;
      let pos = -1;
      ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= line) pos = i + Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height))) - 0.5;
      });
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = { pos: Math.min(pos, ids.length - 1), progress: max > 0 ? window.scrollY / max : 0 };
      setState((prev) =>
        Math.abs(prev.pos - next.pos) < 0.001 && Math.abs(prev.progress - next.progress) < 0.0005 ? prev : next
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);
  return state;
}

export function OrbitNav({ chapters, onSelect }: { chapters: readonly ChapterDef[]; onSelect: (id: string) => void }) {
  const reduce = useReducedMotion() ?? false;
  // Stable identity: a fresh array each render would re-run the scroll effect every render, and
  // that effect sets state — an endless render loop that starved route transitions.
  const idKey = chapters.map((c) => c.id).join('|');
  const ids = useMemo(() => idKey.split('|'), [idKey]);
  const { pos: rawPos, progress } = useChapterPosition(ids);

  // Spring the dial so it settles like a physical knob instead of snapping.
  const spring = useSpring(rawPos, reduce ? { stiffness: 1000, damping: 100 } : { stiffness: 90, damping: 20, mass: 0.8 });
  const [pos, setPos] = useState(rawPos);
  useEffect(() => spring.set(rawPos), [rawPos, spring]);
  useMotionValueEvent(spring, 'change', setPos);

  const [hover, setHover] = useState(false);
  // How much of the dial fits in the empty gutter beside the content. Where it all fits, show it all;
  // otherwise the dial peeks (ring, dots and pointer only) and swings fully open on hover/focus.
  const [gutter, setGutter] = useState(() => (typeof window === 'undefined' ? 0 : (window.innerWidth - CONTENT_MAX) / 2));
  useEffect(() => {
    const onResize = () => setGutter((window.innerWidth - CONTENT_MAX) / 2);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Idle, the dial rests mostly off-screen as a slim strip (ring, dots, pointer and the curved
  // current-chapter label). Hover or keyboard focus slides it out to its full position.
  // `roomy`: the fully open dial (DISC + 40px of pointer) also fits beside the content.
  const roomy = gutter >= DISC + 52;
  const open = hover;
  // Visible width of the idle strip; never closer than 12px to the content.
  const IDLE_PEEK = 60;
  const peek = Math.max(40, Math.min(IDLE_PEEK, gutter - 12));
  const shiftX = open ? 0 : -(DISC - peek);
  const activeIndex = Math.max(0, Math.min(chapters.length - 1, Math.round(rawPos)));
  const visible = rawPos > -0.6;
  const rotation = -pos * STEP; // tick ring turns with the chapters
  const accents = [ENGINE_META.engagement.color, BRAND.silver, ENGINE_META.meaning.color];

  // Fit the curved title into the part of the oval that is actually on screen while peeking:
  // beyond `titleMaxDeg` the arc runs off the left edge of the viewport.
  const measureRef = useRef<SVGTextElement>(null); // hidden, unstyled copy used only for measuring
  const [fit, setFit] = useState<{ font: number; split: number }>({ font: TITLE_FONT, split: 0 });
  const hidden = DISC - peek; // px of the dial pushed off-screen while peeking
  const cosLimit = Math.min(1, (hidden + 6) / LABEL_R);
  const titleMaxDeg = Math.min(LABEL_GAP + TITLE_SPAN, (Math.acos(cosLimit) * 180) / Math.PI);
  const titleAvail = arcLength(LABEL_R, LABEL_GAP, Math.max(LABEL_GAP, titleMaxDeg));
  const peeking = !open && visible;
  const title = chapters[activeIndex].title.toUpperCase();
  const number = chapters[activeIndex].number;
  const words = title.split(' ');
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!peeking || !el) return;
    // The hidden copy renders the whole title at the base size; per-character width is near-uniform in caps.
    const natural = el.getComputedTextLength();
    if (natural <= 0) return;
    const perChar = natural / title.length;
    const fontFor = (chars: number) => (TITLE_FONT * titleAvail) / (perChar * chars);
    let next = { font: Math.min(TITLE_FONT, fontFor(title.length)), split: 0 };
    if (next.font < TITLE_FONT_MIN && words.length > 1) {
      // Too long for one half of the visible arc: put the first word(s) after the number above the
      // dot and the rest below, choosing the break that balances the two halves.
      let best = { split: 1, longest: Infinity };
      for (let k = 1; k < words.length; k++) {
        const above = `${number}  ${words.slice(0, k).join(' ')}`.length;
        const below = words.slice(k).join(' ').length;
        const longest = Math.max(above, below);
        if (longest < best.longest) best = { split: k, longest };
      }
      next = { font: Math.min(TITLE_FONT, fontFor(best.longest)), split: best.split };
    }
    next.font = Math.max(TITLE_FONT_MIN, next.font);
    setFit((prev) => (Math.abs(prev.font - next.font) < 0.05 && prev.split === next.split ? prev : next));
  }, [peeking, activeIndex, titleAvail, title, number, words]);
  const above = fit.split ? words.slice(0, fit.split).join(' ') : '';
  const below = fit.split ? words.slice(fit.split).join(' ') : title;

  return (
    <motion.nav
      aria-label="Chapters"
      className="fixed left-0 top-1/2 z-40 hidden xl:block"
      style={{ width: DISC + 40, height: H, marginTop: -CY }}
      initial={false}
      animate={{ x: visible ? shiftX : -DISC - 40, opacity: visible ? 1 : 0 }}
      // Slide out/in like a drawer: quick to start, soft to settle, no overshoot.
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
    >
      {/* Frosted half-disc: always dark, so it reads the same over light and dark chapters */}
      <motion.div
        aria-hidden="true"
        className="absolute left-0 top-0 border border-l-0 backdrop-blur-xl"
        style={{
          width: DISC,
          height: H,
          // A true half-ellipse (not a pill): horizontal radius DISC, vertical radius H/2.
          borderRadius: `0 ${DISC}px ${DISC}px 0 / 0 ${CY}px ${CY}px 0`,
          borderColor: 'rgba(255,255,255,0.10)',
          background: `radial-gradient(100% 100% at 0% 50%, ${BRAND.ink}f2 0%, ${BRAND.ink}d9 60%, ${BRAND.ink}b3 100%)`,
          boxShadow: '0 30px 80px -30px rgba(0,0,0,0.6), inset -1px 0 0 rgba(255,255,255,0.04)',
          transformOrigin: 'left center',
        }}
        animate={{ scale: hover && roomy ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      />

      <motion.svg
        aria-hidden="true"
        width={DISC + 40}
        height={H}
        viewBox={`0 0 ${DISC + 40} ${H}`}
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        style={{ transformOrigin: 'left center' }}
        animate={{ scale: hover && roomy ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        <defs>
          <linearGradient id="orbit-progress" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accents[0]} />
            <stop offset="50%" stopColor={accents[1]} />
            <stop offset="100%" stopColor={accents[2]} />
          </linearGradient>
          <radialGradient id="orbit-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Overall reading progress, filling the outer arc from top to bottom */}
        <path d={arcPath(PROGRESS_R, 1)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
        <path d={arcPath(PROGRESS_R, progress)} fill="none" stroke="url(#orbit-progress)" strokeWidth={2} strokeLinecap="round" />

        {/* Tick ring — turns with the chapters, like the bezel of a dial */}
        <g style={{ opacity: open ? 1 : 0, transition: 'opacity 300ms' }}>
          {Array.from({ length: 72 }, (_, i) => {
            // Ticks travel along the oval with the chapters (rotating the group would tilt the oval).
            const deg = i * 5 + rotation;
            if (Math.cos((deg * Math.PI) / 180) < -0.05) return null; // hidden half, skip
            const major = i % 6 === 0;
            const a = polar(TICK_R - (major ? 7 : 3), deg);
            const b = polar(TICK_R, deg);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`rgba(255,255,255,${major ? 0.32 : 0.12})`} strokeWidth={major ? 1.2 : 1} />;
          })}
        </g>

        {/* Chapter ring + counter-rotating inner orbit */}
        <ellipse cx={0} cy={CY} rx={RING} ry={RING * OVAL} fill="none" stroke="rgba(255,255,255,0.10)" />
        {/* Inner orbit drifts the other way: its dashes flow along the oval (rotating would tilt it) */}
        <motion.ellipse
          cx={0}
          cy={CY}
          rx={RING - 34}
          ry={(RING - 34) * OVAL}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeDasharray="1 7"
          animate={reduce ? undefined : { strokeDashoffset: [0, 64] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />

        {/* Fixed pointer at 3 o'clock — the "you are here" of the dial */}
        <line x1={RING + 10} y1={CY} x2={open ? DISC + 30 : DISC - 2} y2={CY} stroke="rgba(255,255,255,0.35)" />
        <path d={`M ${RING + 12} ${CY - 5} L ${RING + 4} ${CY} L ${RING + 12} ${CY + 5} Z`} fill="#FFFFFF" />

        {/* Peeking: the current chapter is written along the ring, so it fits the narrow visible strip */}
        <path id="orbit-label-number" d={labelArc(LABEL_R, -Math.max(LABEL_GAP + NUMBER_SPAN, titleMaxDeg), -LABEL_GAP)} fill="none" />
        <path id="orbit-label-title" d={labelArc(LABEL_R, LABEL_GAP, LABEL_GAP + TITLE_SPAN + 20)} fill="none" />
        <text ref={measureRef} x={0} y={0} visibility="hidden" fontSize={TITLE_FONT} fontWeight={600} letterSpacing={0.9}>
          {title}
        </text>
        <AnimatePresence mode="wait">
          {!open && visible && (
            <motion.g
              key={activeIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.35 }}
              fontWeight={600}
            >
              {/* "04" above the dot, the title below it: the dot itself is the separator. */}
              <text fontSize={fit.split ? fit.font : 9} letterSpacing={fit.split ? 0.9 * (fit.font / TITLE_FONT) : 1.5}>
                <textPath href="#orbit-label-number" startOffset="100%" textAnchor="end">
                  <tspan fill={accents[activeIndex % accents.length]}>{number}</tspan>
                  {above && <tspan fill="#FFFFFF">{`  ${above}`}</tspan>}
                </textPath>
              </text>
              <text fill="#FFFFFF" fontSize={fit.font} letterSpacing={0.9 * (fit.font / TITLE_FONT)}>
                <textPath href="#orbit-label-title" startOffset="0%" textAnchor="start">
                  {below}
                </textPath>
              </text>
            </motion.g>
          )}
        </AnimatePresence>

        {/* The one, half-visible at the hub */}
        <circle cx={0} cy={CY} r={26} fill="none" stroke="rgba(255,255,255,0.18)" />
        <image href={BRAND.logo} x={-18} y={CY - 18} width={36} height={36} opacity={0.95} />
      </motion.svg>

      {/* Chapters on the ring (HTML so they stay crisp, focusable and clickable) */}
      <motion.ol
        className="absolute left-0 top-0"
        style={{ width: DISC + 40, height: H, transformOrigin: 'left center' }}
        animate={{ scale: hover && roomy ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        {chapters.map((c, i) => {
          const deg = (i - pos) * STEP;
          const dist = Math.abs(deg);
          if (dist > 110) return null;
          const { x, y } = polar(RING, deg);
          const on = i === activeIndex && visible;
          // Fade and shrink with angular distance from the pointer; hover reveals the whole orbit.
          const opacity = on ? 1 : Math.max(0, 1 - dist / (hover ? 120 : 85)) * (hover ? 0.85 : 0.55);
          const accent = accents[i % accents.length];
          return (
            <li key={c.id} className="absolute" style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={on ? 'step' : undefined}
                aria-label={`Chapter ${c.number}: ${c.title}`}
                tabIndex={dist > 80 ? -1 : 0}
                {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
                className="group relative grid h-6 w-6 place-items-center rounded-full focus-visible:outline-none"
                style={{ opacity, pointerEvents: opacity < 0.15 ? 'none' : 'auto' }}
              >
                {/* Dot (+ glow and pulsing ring when active) */}
                {on && (
                  <>
                    <span aria-hidden="true" className="absolute h-10 w-10 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 70%)' }} />
                    {!reduce && (
                      <motion.span
                        aria-hidden="true"
                        className="absolute h-5 w-5 rounded-full border"
                        style={{ borderColor: accent }}
                        initial={{ scale: 1, opacity: 0.8 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                      />
                    )}
                  </>
                )}
                <span
                  aria-hidden="true"
                  className="relative rounded-full transition-all duration-300 group-hover:scale-125 group-focus-visible:ring-2 group-focus-visible:ring-white/70"
                  style={{
                    width: on ? 9 : 5,
                    height: on ? 9 : 5,
                    background: on ? '#FFFFFF' : accent,
                    boxShadow: on ? `0 0 14px ${accent}` : 'none',
                  }}
                />
                {/* Label sits inside the disc, to the left of its dot, always upright */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-full mr-2.5 flex flex-col items-end whitespace-nowrap text-right leading-tight transition-opacity duration-300"
                  style={{ opacity: open ? 1 : 0 }}
                >
                  <span className="font-mono text-[9px]" style={{ color: on ? accent : 'rgba(255,255,255,0.5)' }}>
                    {c.number}
                  </span>
                  <span
                    className="font-semibold uppercase transition-all duration-300"
                    style={{
                      fontSize: on ? 10.5 : 9,
                      letterSpacing: on ? '0.14em' : '0.1em',
                      color: on ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {c.title}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </motion.ol>
    </motion.nav>
  );
}
