import { useEffect, useMemo, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { BRAND, ENGINE_META, type ChapterDef } from './ScienceUi';

/**
 * Chapter rail that comes straight OUT of a small dark hole, toward the viewer (no sideways tilt).
 *
 * The chapters sit on a ring (a drum) that rotates toward you as you scroll: the current chapter is
 * at the front, centred and full size; chapters above/below rotate back into the hole —
 * foreshortened, smaller and fainter. Labels are drawn with a 3D rotateX plus a horizontal stretch,
 * so as a chapter rotates to the front its text looks like it is being stretched out of the hole.
 * The line itself is a straight ribbon on the hole's axis: thin where it enters the hole, widest at
 * the front, which sells the "coming out of the screen" depth.
 */

const STEP = 30; // degrees between chapters on the ring
const R = 132; // ring radius (px) — vertical reach of the projection
const H = R * 2 + 48; // nav height
const CY = H / 2; // the front of the ring (current chapter)
const BOX_W = 40; // breadth of the dark hole
const DOT_X = BOX_W / 2; // the line runs straight down the hole's axis
const WIDE = 10; // ribbon width at the front (px)
const THIN = 1; // ribbon width where it enters the hole (px)
const MAX_DEG = 84; // beyond this a chapter has rotated into the hole

/**
 * Continuous reading position: chapter index plus fraction through it, measured at the line 45%
 * down the viewport. −1 while the hero is on screen; stays on the last chapter through the finale.
 */
function useChapterPosition(ids: readonly string[]) {
  const [pos, setPos] = useState(-1);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.45;
      let p = -1;
      ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= line) p = i + Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height))) - 0.5;
      });
      const next = Math.min(p, ids.length - 1);
      setPos((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
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
  return pos;
}

export function OrbitNav({ chapters, onSelect }: { chapters: readonly ChapterDef[]; onSelect: (id: string) => void }) {
  const reduce = useReducedMotion() ?? false;
  const idKey = chapters.map((c) => c.id).join('|');
  const ids = useMemo(() => idKey.split('|'), [idKey]);
  const rawPos = useChapterPosition(ids);

  // Spring the ring so it turns like a physical drum instead of snapping.
  const spring = useSpring(rawPos, reduce ? { stiffness: 1000, damping: 100 } : { stiffness: 110, damping: 22, mass: 0.7 });
  const [pos, setPos] = useState(rawPos);
  useEffect(() => spring.set(rawPos), [rawPos, spring]);
  useMotionValueEvent(spring, 'change', setPos);

  const [hover, setHover] = useState(false);
  const visible = rawPos > -0.6;
  const accents = [ENGINE_META.engagement.color, BRAND.silver, ENGINE_META.meaning.color];
  const activeIndex = Math.max(0, Math.min(chapters.length - 1, Math.round(rawPos)));
  const activeAccent = accents[activeIndex % accents.length];

  // Straight ribbon on the hole's axis: its width follows the ring's foreshortening (cos), so it is
  // thin where it disappears into the hole and widest at the front.
  const SAMPLES = 56;
  const right: string[] = [];
  const left: string[] = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const y = CY - R + (s / SAMPLES) * (2 * R);
    const c = Math.sqrt(Math.max(0, 1 - ((y - CY) / R) ** 2)); // cos of the ring angle at this height
    const hw = (THIN + (WIDE - THIN) * c) / 2;
    right.push(`${(DOT_X + hw).toFixed(2)},${y.toFixed(2)}`);
    left.unshift(`${(DOT_X - hw).toFixed(2)},${y.toFixed(2)}`);
  }
  const ribbon = `M ${right.join(' L ')} L ${left.join(' L ')} Z`;

  return (
    <motion.nav
      aria-label="Chapters"
      className="fixed left-5 top-1/2 z-40 hidden xl:block"
      style={{ height: H, marginTop: -CY, width: BOX_W }}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -20 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
    >
      {/* the small dark hole */}
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 rounded-full border border-white/[0.07] backdrop-blur-2xl"
        style={{
          width: BOX_W,
          height: H,
          background: `linear-gradient(160deg, ${BRAND.ink}f0 0%, ${BRAND.ink}cc 100%)`,
          boxShadow: '0 24px 70px -36px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      />

      {/* straight, tapered line coming out of the hole; ends fade into the dark */}
      <svg
        aria-hidden="true"
        width={BOX_W}
        height={H}
        viewBox={`0 0 ${BOX_W} ${H}`}
        className="absolute left-0 top-0 overflow-visible"
        style={{
          WebkitMaskImage: `linear-gradient(to bottom, transparent 0, #000 ${H * 0.24}px, #000 ${H * 0.76}px, transparent ${H}px)`,
          maskImage: `linear-gradient(to bottom, transparent 0, #000 ${H * 0.24}px, #000 ${H * 0.76}px, transparent ${H}px)`,
        }}
      >
        <defs>
          <linearGradient id="rail-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={activeAccent} stopOpacity="0" />
            <stop offset="50%" stopColor={activeAccent} stopOpacity="0.95" />
            <stop offset="100%" stopColor={activeAccent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={ribbon} fill="url(#rail-fill)" />
      </svg>

      {chapters.map((c, i) => {
        const deg = (i - pos) * STEP; // angle on the ring; 0 = front
        if (Math.abs(deg) > MAX_DEG) return null;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad); // 1 at the front, -> 0 as it rotates into the hole
        const y = CY + R * Math.sin(rad);
        const on = Math.round(pos) === i && visible;
        const accent = accents[i % accents.length];
        const dot = 4 + 10 * cos;
        const labelOpacity = Math.max(0, hover ? Math.max(0.45, cos) : cos ** 1.6);
        // Stretched out of the hole: narrow + tilted back while emerging, full width at the front.
        const labelTransform = `perspective(420px) rotateX(${-deg}deg) scaleX(${(0.35 + 0.65 * cos).toFixed(3)})`;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-current={on ? 'step' : undefined}
            aria-label={`Chapter ${c.number}: ${c.title}`}
            tabIndex={cos < 0.3 ? -1 : 0}
            {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
            className="group absolute flex -translate-y-1/2 items-center gap-3 focus-visible:outline-none"
            style={{ top: y, left: DOT_X - 8, pointerEvents: cos < 0.25 ? 'none' : 'auto', zIndex: Math.round(cos * 10) }}
          >
            {/* dot on the hole's axis */}
            <span className="relative grid h-4 w-4 shrink-0 place-items-center">
              {on && !reduce && (
                <motion.span
                  aria-hidden="true"
                  className="absolute h-4 w-4 rounded-full border"
                  style={{ borderColor: accent }}
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                />
              )}
              <span
                aria-hidden="true"
                className="rounded-full transition-colors duration-300"
                style={{
                  width: dot,
                  height: dot,
                  opacity: 0.35 + 0.65 * cos,
                  background: on ? '#FFFFFF' : accent,
                  boxShadow: on ? `0 0 0 3px rgba(10,11,16,0.45), 0 0 16px ${accent}` : '0 0 0 2px rgba(10,11,16,0.4)',
                }}
              />
            </span>

            {/* label — stretched out of the hole as the ring turns it to the front */}
            <span
              aria-hidden="true"
              className="flex flex-col whitespace-nowrap rounded-lg px-2.5 py-1 text-left leading-tight backdrop-blur-sm"
              style={{
                opacity: labelOpacity,
                background: 'rgba(10,11,16,0.82)',
                transform: labelTransform,
                transformOrigin: 'left center',
              }}
            >
              <span className="font-mono" style={{ fontSize: 8 + 2 * cos, color: on ? accent : 'rgba(255,255,255,0.55)' }}>
                {c.number}
              </span>
              <span
                className="font-semibold uppercase"
                style={{
                  fontSize: 8 + 5 * cos,
                  letterSpacing: `${(0.02 + 0.16 * cos).toFixed(3)}em`,
                  color: on ? '#FFFFFF' : 'rgba(255,255,255,0.8)',
                }}
              >
                {c.title}
              </span>
            </span>
          </button>
        );
      })}
    </motion.nav>
  );
}
