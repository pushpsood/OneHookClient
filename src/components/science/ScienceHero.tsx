import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref, type RefObject } from 'react';
import {
  motion,
  useAnimate,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { ArrowDown, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hideMrOneHook } from '../Chatbot/ChatbotWidget';
import { AURORA, Accent, BRAND, ENGINE_META, ENGINE_ORDER, Kicker, pillClass } from './ScienceUi';
import { CX, CY, LOGO, ORBITS } from './ScienceDiagrams';
import type { EngineId } from './science-model';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
/**
 * Science hero: exactly one viewport tall (below the site header), never overflowing.
 *
 * Interaction model (all optional, all mirrored by keyboard-accessible buttons):
 *  - Move the pointer: the six orbits drift in parallax at different depths and a soft light follows.
 *  - Hover / focus a mind in the legend: its orbit comes forward, the others recede.
 *  - Tap anywhere in the orbits (or a mind in the legend): a signal is born on the nearest orbit,
 *    travels to the logo, and the logo answers with a heartbeat.
 *  - Left alone, the hero sends its own signals now and then, so it never looks static.
 *
 * Reduced motion: no parallax, no drift, no autoplay; signals still register instantly.
 */

const ENGINES: EngineId[] = ENGINE_ORDER;
const EASE = [0.22, 1, 0.36, 1] as const;

export interface Pulse {
  id: number;
  x: number;
  y: number;
  engine: EngineId;
}

/** Height of the sticky site header, so the hero can be exactly "the rest of the screen". */
function useHeaderOffset(): number {
  const [h, setH] = useState(69);
  useLayoutEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const measure = () => setH(header.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return h;
}

/** The site pill, made compact on phones so three fit side by side in one row. */
const heroPill = (variant: 'solid-light' | 'ghost-light') =>
  `${pillClass(variant).replace('px-6 ', '').replace('tracking-[0.28em] ', '')} whitespace-nowrap px-3 tracking-[0.12em] sm:px-6 sm:tracking-[0.28em]`;

/** Where each mind's label sits on the orbit plane, clockwise from top-left (a flat-topped hexagon,
 *  so the widest labels get the horizontal room beside the logo). */
const LEGEND_ANGLES = [-120, -60, 0, 60, 120, 180].map((d) => (d * Math.PI) / 180);

/** The orbit plane leans back (a squashed vertical axis) and slants a little, so the rings read as
 *  one tilted disc in depth. The lean adapts to the free space: deep on wide screens, gentle on
 *  tall ones, so the disc fills landscape screens without crowding portrait ones. */
export const SLANT_DEG = -10;
const SLANT = (SLANT_DEG * Math.PI) / 180;
const TILT_MIN = 0.36;
const TILT_MAX = 0.78;
/** Pointer parallax strength for the rings; the layout reserves exactly this much room. */
const PARALLAX = 0.35;
const PARALLAX_UNITS = (10 + (ORBITS.length - 1) * 12) * PARALLAX;
/** The logo image inside its hairline ring (ring radius LOGO / 2 + 10), as a % inset. */
export const LOGO_INSET = (10 / (LOGO + 20)) * 100;
/** Outermost ring plus its halo and the parallax reserve, in orbit units. */
const DISC = ORBITS[ORBITS.length - 1].radius + 24 + PARALLAX_UNITS;
/** Preferred plane radius for the labels: between the third and fourth rings. */
const LEGEND_PLANE = (ORBITS[2].radius + ORBITS[3].radius) / 2;

interface HeroLayout {
  w: number;
  h: number;
  cx: number;
  cy: number;
  tilt: number;
  orbitScale: number;
  logoScale: number;
  /** Logo ring radius in px, for the tap hit test. */
  logoR: number;
  labels: { x: number; y: number }[];
  ready: boolean;
}

/** Projects a point on the orbit plane (orbit units, centred) to section px. */
function project(l: Pick<HeroLayout, 'cx' | 'cy' | 'tilt' | 'orbitScale'>, px: number, py: number) {
  const x = px * l.orbitScale;
  const y = py * l.orbitScale * l.tilt;
  return {
    x: l.cx + x * Math.cos(SLANT) - y * Math.sin(SLANT),
    y: l.cy + x * Math.sin(SLANT) + y * Math.cos(SLANT),
  };
}

/** Layout for the orbit layer, measured from the real text blocks so nothing ever collides: the
 *  disc stays between the headline and the buttons, and the labels clear the logo and each other. */
function useHeroLayout(
  sectionRef: RefObject<HTMLElement | null>,
  topRef: RefObject<HTMLDivElement | null>,
  bottomRef: RefObject<HTMLDivElement | null>,
  legendRef: RefObject<HTMLUListElement | null>
) {
  const [layout, setLayout] = useState<HeroLayout>({
    w: 800,
    h: 560,
    cx: 400,
    cy: 280,
    tilt: 0.6,
    orbitScale: 1,
    logoScale: 1,
    logoR: 74,
    labels: LEGEND_ANGLES.map(() => ({ x: 400, y: 280 })),
    ready: false,
  });
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const top = topRef.current;
    const bottom = bottomRef.current;
    const legend = legendRef.current;
    if (!section || !top || !bottom || !legend) return;
    const ringUnits = LOGO / 2 + 10; // logo plus its hairline ring, in logo units
    const measure = () => {
      const s = section.getBoundingClientRect();
      const textBottom = top.getBoundingClientRect().bottom - s.top;
      const actionsTop = bottom.getBoundingClientRect().top - s.top;
      const sizes = [...legend.children].map((el) => {
        const r = el.getBoundingClientRect();
        return { hw: r.width / 2, hh: r.height / 2 };
      });
      const bandTop = textBottom + Math.min(40, Math.max(14, s.height * 0.03));
      const bandBottom = actionsTop - 14;
      const inset = s.width < 640 ? 12 : 32;
      const halfW = Math.max(1, s.width / 2 - inset);
      const halfH = Math.max(1, (bandBottom - bandTop) / 2);
      const cx = s.width / 2;
      const cy = bandTop + halfH;

      // Lean the disc back just enough to fill the band, then size it to the tighter axis of its
      // slanted bounding box.
      const tilt = Math.min(TILT_MAX, Math.max(TILT_MIN, halfH / halfW));
      const fx = Math.hypot(Math.cos(SLANT), tilt * Math.sin(SLANT));
      const fy = Math.hypot(Math.sin(SLANT), tilt * Math.cos(SLANT));
      const discPx = Math.min(halfW / fx, halfH / fy);
      const orbitScale = discPx / DISC;

      // Labels: start at the preferred plane radius and the preferred logo size, then search
      // outward/inward and shrink the logo until every label clears the logo, its neighbours and
      // the band. The first layout that passes wins.
      const gap = Math.min(14, Math.max(6, s.height * 0.012));
      const fits = (logoPx: number, planeR: number) => {
        const logoR = logoPx / 2; // logoPx is the ring's diameter
        const pts = LEGEND_ANGLES.map((a) =>
          project({ cx, cy, tilt, orbitScale }, Math.cos(a) * planeR, Math.sin(a) * planeR)
        );
        for (let i = 0; i < pts.length; i++) {
          const { hw, hh } = sizes[i] ?? { hw: 0, hh: 0 };
          const p = pts[i];
          if (p.x - hw < inset || p.x + hw > s.width - inset) return null;
          if (p.y - hh < bandTop || p.y + hh > bandBottom) return null;
          const nx = Math.max(0, Math.abs(p.x - cx) - hw);
          const ny = Math.max(0, Math.abs(p.y - cy) - hh);
          if (Math.hypot(nx, ny) < logoR + gap) return null;
          for (let j = 0; j < i; j++) {
            const q = pts[j];
            const o = sizes[j] ?? { hw: 0, hh: 0 };
            if (Math.abs(p.x - q.x) < hw + o.hw + 8 && Math.abs(p.y - q.y) < hh + o.hh + 6) return null;
          }
        }
        return { logoR, pts };
      };
      const preferredLogo = Math.max(72, Math.min(176, Math.min(s.width, s.height) * 0.2));
      const radii: number[] = [];
      for (let d = 0; d <= DISC; d += 6) {
        if (LEGEND_PLANE + d <= DISC - 8) radii.push(LEGEND_PLANE + d);
        if (d > 0 && LEGEND_PLANE - d >= ORBITS[0].radius) radii.push(LEGEND_PLANE - d);
      }
      let chosen: { logoPx: number; logoR: number; pts: { x: number; y: number }[] } | null = null;
      for (let logoPx = preferredLogo; logoPx >= 40 && !chosen; logoPx -= 8) {
        for (const r of radii) {
          const f = fits(logoPx, r);
          if (f) {
            chosen = { logoPx, ...f };
            break;
          }
        }
      }
      if (!chosen) {
        const logoPx = 40;
        chosen = {
          logoPx,
          logoR: logoPx / 2,
          pts: LEGEND_ANGLES.map((a) =>
            project({ cx, cy, tilt, orbitScale }, Math.cos(a) * LEGEND_PLANE, Math.sin(a) * LEGEND_PLANE)
          ),
        };
      }

      const next: HeroLayout = {
        w: s.width,
        h: s.height,
        cx,
        cy,
        tilt,
        orbitScale,
        logoScale: chosen.logoPx / (ringUnits * 2),
        logoR: chosen.logoR,
        labels: chosen.pts,
        ready: true,
      };
      // Skip no-op updates so a resize observation can never feed back into another render.
      setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    [section, top, bottom, legend, ...legend.children].forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [sectionRef, topRef, bottomRef, legendRef]);
  return layout;
}

/** One travelling signal: a ripple where it was born, then a spark that flies to the centre. */
export function PulseSpark({ pulse, reduce, onArrive }: { pulse: Pulse; reduce: boolean; onArrive: (p: Pulse) => void }) {
  const color = ENGINE_META[pulse.engine].color;
  useEffect(() => {
    if (!reduce) return;
    const t = window.setTimeout(() => onArrive(pulse), 0);
    return () => window.clearTimeout(t);
  }, [reduce, pulse, onArrive]);
  if (reduce) return null;
  return (
    <g>
      <motion.circle
        cx={pulse.x}
        cy={pulse.y}
        fill="none"
        stroke={color}
        initial={{ r: 2, opacity: 0.9, strokeWidth: 1.5 }}
        animate={{ r: 46, opacity: 0, strokeWidth: 0.4 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />
      <motion.circle
        r={4}
        fill={color}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        initial={{ cx: pulse.x, cy: pulse.y, opacity: 0 }}
        animate={{ cx: CX, cy: CY, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.95, ease: [0.55, 0, 0.45, 1], times: [0, 0.1, 0.85, 1] }}
        onAnimationComplete={() => onArrive(pulse)}
      />
    </g>
  );
}

/**
 * One ring of the hero disc as its own GPU layer. The spin is a CSS animation and the parallax a
 * transform, so neither repaints anything: the browser only re-composites a texture it already
 * has. Shared with the landing page's ScienceOrbitBackdrop.
 */
export const HeroRing = memo(function HeroRing({
  index,
  scale,
  sx,
  sy,
  dim,
  lift,
  spin,
}: {
  index: number;
  scale: number;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  dim: boolean;
  lift: boolean;
  spin: boolean;
}) {
  const o = ORBITS[index];
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const depth = (10 + index * 12) * PARALLAX; // outer rings move more, which reads as depth
  const x = useTransform(sx, (v) => v * depth * scaleRef.current);
  const y = useTransform(sy, (v) => v * depth * scaleRef.current);
  const color = ENGINE_META[o.engine].color;
  const half = o.radius + 6;
  const size = half * 2 * scale;
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ x, y }}
      animate={{ opacity: dim ? 0.18 : 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div
        className="oh-spin absolute"
        style={{
          left: -size / 2,
          top: -size / 2,
          width: size,
          height: size,
          animationDuration: `${o.duration}s`,
          animationDirection: o.direction > 0 ? 'normal' : 'reverse',
          animationPlayState: spin ? 'running' : 'paused',
        }}
      >
        <svg viewBox={`${CX - half} ${CY - half} ${half * 2} ${half * 2}`} width={size} height={size} className="block">
          <circle
            cx={CX}
            cy={CY}
            r={o.radius}
            fill="none"
            stroke={color}
            strokeOpacity={lift ? 0.55 : 0.22}
            strokeDasharray={lift ? undefined : '1 6'}
          />
          {o.points.map((p) => (
            <circle key={p.k} cx={p.x} cy={p.y} r={lift ? p.r * 1.7 : p.r} fill={color} fillOpacity={p.r > 2 ? 0.95 : 0.55} />
          ))}
        </svg>
      </div>
    </motion.div>
  );
});

/** Headline that rises word by word out of a soft blur. */
function RevealHeadline({ reduce, id }: { reduce: boolean; id?: string }) {
  const words = ['The', 'science', 'of'];
  const word = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: '0.45em', filter: 'blur(10px)' },
          animate: { opacity: 1, y: '0em', filter: 'blur(0px)' },
          transition: { duration: 0.9, delay: 0.15 + i * 0.09, ease: EASE },
        };
  return (
    <h1
      id={id}
      className="mx-auto max-w-5xl font-light leading-[1.02] tracking-[-0.03em]"
      style={{ fontSize: 'clamp(2.4rem, min(8.2vw, 9.5vh), 6.25rem)' }}
    >
      {words.map((w, i) => (
        <motion.span key={w} className="mr-[0.24em] inline-block" {...word(i)}>
          {w}
        </motion.span>
      ))}
      <motion.span className="inline-block" {...word(words.length)}>
        <Accent dark>one</Accent>
      </motion.span>
    </h1>
  );
}

/** The /science page header (SiteHeader) is this tall at every width; the hero fills the rest. */
const SCIENCE_HEADER_H = 69;

const LEGEND_ITEM_CLASS =
  'group flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2 text-center transition-colors sm:px-4 sm:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

/** What a mind label shows: its dot, its name and (on large screens) its role. */
function LegendLabel({ id, on }: { id: EngineId; on: boolean }) {
  const meta = ENGINE_META[id];
  return (
    <>
      <motion.span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color, boxShadow: on ? `0 0 12px ${meta.color}` : 'none' }}
        animate={{ scale: on ? 1.8 : 1 }}
      />
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] sm:text-[10px] sm:tracking-[0.3em]" style={{ color: on ? meta.color : 'rgba(255,255,255,0.7)' }}>
        {meta.name}
      </span>
      <span className="hidden text-xs font-light text-white/40 [@media(min-width:1024px)_and_(min-height:760px)]:block">{meta.role}</span>
    </>
  );
}

/** The hero's title block: kicker, headline and subtitle. */
function HeroText({ boxRef, reduce, titleId }: { boxRef: Ref<HTMLDivElement>; reduce: boolean; titleId?: string }) {
  return (
    <div ref={boxRef} className="relative z-10 mx-auto w-full max-w-6xl shrink-0 pt-[clamp(1.25rem,5vh,3.5rem)] text-center">
      <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <Kicker dark>OneHook Intelligence</Kicker>
      </motion.div>
      <div className="mt-[clamp(0.75rem,2.5vh,1.75rem)]">
        <RevealHeadline reduce={reduce} id={titleId} />
      </div>
      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.8 }}
        className="mx-auto mt-[clamp(0.5rem,2vh,1.5rem)] max-w-xl font-light leading-relaxed text-white/55"
        style={{ fontSize: 'clamp(0.9rem, 1.9vh, 1.125rem)' }}
      >
        What OneHook quietly notices, and what it never will.
      </motion.p>
    </div>
  );
}

/** The hero's calls to action. "See how it works" sits in the middle; the two ways out flank it. */
function HeroActions({ boxRef, reduce, onFollow }: { boxRef: Ref<HTMLDivElement>; reduce: boolean; onFollow: () => void }) {
  const navigate = useNavigate();
  return (
    <div ref={boxRef} className="relative z-10 mx-auto min-w-0 w-full max-w-4xl shrink-0 pb-[clamp(1rem,4vh,2.5rem)]">
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate('/#get-app')}
          {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
          className={`${heroPill('ghost-light')}`}
        >
          <Smartphone className="hidden h-3.5 w-3.5 sm:inline" aria-hidden="true" /> Get the app
        </button>
        <button
          type="button"
          onClick={onFollow}
          {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_send' })}
          className={`${heroPill('solid-light')}`}
        >
          <span className="sm:hidden">Explore</span>
          <span className="hidden sm:inline">See how it works</span>
          <motion.span
            aria-hidden="true"
            className="inline-flex"
            animate={reduce ? undefined : { y: [0, 3, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </motion.span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/#philosophy')}
          {...trackProps(UiElement.LANDING_HOME_LINK)}
          className={`${heroPill('ghost-light')}`}
        >
          <span className="sm:hidden">Philosophy</span>
          <span className="hidden sm:inline">Our philosophy</span>
        </button>
      </div>
    </div>
  );
}

/** Geometry of the tilted disc: centre, lean, scale and logo size, in px of its container. */
export type DiscLayout = Pick<HeroLayout, 'cx' | 'cy' | 'tilt' | 'orbitScale' | 'logoR'>;

/**
 * The tilted orbit disc and the upright logo, positioned at `layout.cx/cy` in its container. Used
 * by the /science hero and, with the hero's own geometry, by the landing page's Mr.OneHook backdrop,
 * so both look the same on a given screen.
 */
export function ScienceDisc({
  layout,
  sx,
  sy,
  focus = null,
  spin,
  reduce,
  pulses,
  onArrive,
  logoScope,
  logoX,
  logoY,
  shade = BRAND.ink,
}: {
  layout: DiscLayout;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  focus?: EngineId | null;
  spin: boolean;
  reduce: boolean;
  pulses: Pulse[];
  onArrive: (p: Pulse) => void;
  logoScope: Ref<HTMLDivElement>;
  logoX?: MotionValue<number>;
  logoY?: MotionValue<number>;
  /** The background colour the far half of the disc recedes into. */
  shade?: string;
}) {
  const planePx = DISC * 2 * layout.orbitScale;
  const fade = (pct: number) => `color-mix(in srgb, ${shade} ${pct}%, transparent)`;
  return (
    <>
      {/* The tilted plane: lean back (squashed) and slant. */}
      <div
        className="absolute"
        style={{
          left: layout.cx,
          top: layout.cy,
          transform: `rotate(${SLANT_DEG}deg) scaleY(${layout.tilt})`,
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            left: -planePx / 2,
            top: -planePx / 2,
            width: planePx,
            height: planePx,
            background: `radial-gradient(closest-side, rgba(255,255,255,0.2), rgba(201,205,211,0.05) 45%, rgba(10,11,16,0) 100%)`,
          }}
        />
        {ORBITS.map((o, i) => (
          <HeroRing
            key={o.engine}
            index={i}
            scale={layout.orbitScale}
            sx={sx}
            sy={sy}
            spin={spin}
            dim={focus !== null && focus !== o.engine}
            lift={focus === o.engine}
          />
        ))}
        {/* Depth: the far half of the disc recedes into the background. */}
        <div
          className="absolute rounded-full"
          style={{
            left: -planePx / 2,
            top: -planePx / 2,
            width: planePx,
            height: planePx,
            background: `linear-gradient(to bottom, ${fade(55)} 0%, ${fade(30)} 30%, transparent 52%)`,
            // Fade the shade out before the disc's edge so it never draws an outline of its own.
            maskImage: 'radial-gradient(closest-side, #000 62%, transparent 86%)',
            WebkitMaskImage: 'radial-gradient(closest-side, #000 62%, transparent 86%)',
          }}
        />
        {pulses.length > 0 && (
          <svg
            className="absolute overflow-visible"
            style={{ left: -planePx / 2, top: -planePx / 2 }}
            width={planePx}
            height={planePx}
            viewBox={`${CX - DISC} ${CY - DISC} ${DISC * 2} ${DISC * 2}`}
          >
            {pulses.map((p) => (
              <g key={p.id}>
                <PulseSpark pulse={p} reduce={reduce} onArrive={onArrive} />
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* The one, upright in front of the disc. Counter-parallax keeps it anchored. */}
      <motion.div className="absolute" style={{ left: layout.cx, top: layout.cy, x: reduce || !logoX ? 0 : logoX, y: reduce || !logoY ? 0 : logoY }}>
        <div
          ref={logoScope}
          className="absolute rounded-full"
          style={{ left: -layout.logoR, top: -layout.logoR, width: layout.logoR * 2, height: layout.logoR * 2 }}
        >
          <span className="absolute inset-0 rounded-full border border-white/[0.18]" />
          {!reduce && <span className="oh-ping absolute inset-0 rounded-full border border-white/25" style={{ animationPlayState: spin ? 'running' : 'paused' }} />}
          <img
            src={BRAND.logo}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              left: `${LOGO_INSET}%`,
              top: `${LOGO_INSET}%`,
              width: `${100 - LOGO_INSET * 2}%`,
              height: `${100 - LOGO_INSET * 2}%`,
            }}
          />
        </div>
      </motion.div>
    </>
  );
}

/**
 * The disc geometry the /science hero would use on this screen, for showing the same disc on
 * another page. It lays out an invisible copy of the hero (its text, buttons and labels, at the
 * hero's exact size) and runs the hero's own solver on it. Render `frame` anywhere.
 */
export function useScienceHeroDisc() {
  const sectionRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const layout = useHeroLayout(sectionRef, topRef, bottomRef, legendRef);
  const frame = (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none invisible fixed inset-x-0 top-0 -z-50 overflow-hidden"
      style={{ height: `calc(100svh - ${SCIENCE_HEADER_H}px)`, minHeight: 560 }}
    >
      <section ref={sectionRef} className="relative flex h-full flex-col overflow-hidden px-6">
        <HeroText boxRef={topRef} reduce />
        <div className="min-h-0 flex-1" />
        <ul ref={legendRef} className="absolute inset-0">
          {ENGINES.map((id) => (
            <li key={id} className="absolute left-0 top-0 whitespace-nowrap">
              <span className={LEGEND_ITEM_CLASS}>
                <LegendLabel id={id} on={false} />
              </span>
            </li>
          ))}
        </ul>
        <HeroActions boxRef={bottomRef} reduce onFollow={() => undefined} />
      </section>
    </div>
  );
  return { layout, frame };
}

export function ScienceHero({ onFollow }: { onFollow: () => void }) {
  const reduce = useReducedMotion() ?? false;
  const headerH = useHeaderOffset();
  const sectionRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const layout = useHeroLayout(sectionRef, topRef, bottomRef, legendRef);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const [logoScope, animateLogo] = useAnimate<HTMLDivElement>();

  const [focus, setFocus] = useState<EngineId | null>(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const lastInteraction = useRef(0);
  const nextId = useRef(1);

  // Pointer: normalised (-1..1) for parallax, section px for the light.
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const sx = useSpring(nx, { stiffness: 60, damping: 18, mass: 0.6 });
  const sy = useSpring(ny, { stiffness: 60, damping: 18, mass: 0.6 });
  const lx = useSpring(0, { stiffness: 140, damping: 22 });
  const ly = useSpring(0, { stiffness: 140, damping: 22 });
  const lightOpacity = useSpring(0, { stiffness: 80, damping: 20 });
  const logoX = useTransform(sx, (v) => v * -6);
  const logoY = useTransform(sy, (v) => v * -6);

  /** Section px → orbit-plane units (the inverse of `project`). */
  const toPlane = (sectionX: number, sectionY: number) => {
    const dx = sectionX - layout.cx;
    const dy = sectionY - layout.cy;
    const ux = dx * Math.cos(SLANT) + dy * Math.sin(SLANT);
    const uy = -dx * Math.sin(SLANT) + dy * Math.cos(SLANT);
    return { x: CX + ux / layout.orbitScale, y: CY + uy / (layout.orbitScale * layout.tilt) };
  };

  const emit = useCallback((x: number, y: number, engine: EngineId) => {
    setPulses((ps) => [...ps.slice(-8), { id: nextId.current++, x, y, engine }]);
  }, []);

  /** A signal born on a random point of one orbit (used by the legend and by autoplay). */
  const emitRandom = useCallback(
    (engine?: EngineId) => {
      const o = ORBITS.find((orb) => orb.engine === (engine ?? ENGINES[Math.floor(Math.random() * ENGINES.length)])) ?? ORBITS[0];
      const a = Math.random() * Math.PI * 2;
      emit(CX + Math.cos(a) * o.radius, CY + Math.sin(a) * o.radius, o.engine);
    },
    [emit]
  );

  const onArrive = useCallback(
    (p: Pulse) => {
      setPulses((ps) => ps.filter((q) => q.id !== p.id));
      if (!reduce && logoScope.current) {
        void animateLogo(logoScope.current, { scale: [1, 1.12, 0.97, 1] }, { duration: 0.65, ease: 'easeOut' });
      }
    },
    [reduce, animateLogo, logoScope]
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    nx.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    ny.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
    lx.set(e.clientX - rect.left);
    ly.set(e.clientY - rect.top);
    lightOpacity.set(1);
    lastInteraction.current = Date.now();
  };

  const onPointerLeave = () => {
    nx.set(0);
    ny.set(0);
    lightOpacity.set(0);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // Buttons and links in the hero do their own thing; only bare presses send a signal.
    if ((e.target as Element).closest('button, a')) return;
    const box = e.currentTarget.getBoundingClientRect();
    const p = toPlane(e.clientX - box.left, e.clientY - box.top);
    lastInteraction.current = Date.now();
    // One demo interaction per press. Emitted imperatively here (not via trackProps) because the
    // tracked event is the pointer press itself — a press that becomes a drag never fires a `click`,
    // and we must count it exactly once without the delegated click listener also counting it.
    trackUi(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_send' });
    const dist = Math.hypot(p.x - CX, p.y - CY);
    // The logo stands upright in front of the tilted plane, so hit-test it on screen.
    if (Math.hypot(e.clientX - box.left - layout.cx, e.clientY - box.top - layout.cy) < layout.logoR) {
      // Tapping the logo itself: it answers, nothing travels.
      if (!reduce && logoScope.current) void animateLogo(logoScope.current, { scale: [1, 1.08, 1] }, { duration: 0.45 });
      return;
    }
    const nearest = ORBITS.reduce((best, o) => (Math.abs(o.radius - dist) < Math.abs(best.radius - dist) ? o : best), ORBITS[0]);
    emit(p.x, p.y, nearest.engine);
  };

  // Autoplay: an occasional signal while the hero is on screen and the visitor is idle.
  useEffect(() => {
    if (reduce || !inView) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInteraction.current < 5000) return;
      emitRandom();
    }, 2600);
    return () => window.clearInterval(t);
  }, [reduce, inView, emitRandom]);

  const spin = !reduce && inView;
  /** The six minds on the tilted orbit plane around the logo, positioned from the measured layout. */
  const legend = (
    <ul
      ref={legendRef}
      aria-label="The six minds"
      className="pointer-events-none absolute inset-0 z-10"
      style={{ visibility: layout.ready ? 'visible' : 'hidden' }}
    >
      {ENGINES.map((id, i) => {
        const meta = ENGINE_META[id];
        const on = focus === id;
        const a = LEGEND_ANGLES[i];
        return (
          <li
            key={id}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
            style={{ left: layout.labels[i]?.x ?? layout.cx, top: layout.labels[i]?.y ?? layout.cy }}
          >
            <button
              type="button"
              onMouseEnter={() => setFocus(id)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(id)}
              onBlur={() => setFocus(null)}
              onClick={() => {
                lastInteraction.current = Date.now();
                emitRandom(id);
              }}
              aria-label={`${meta.name}: ${meta.role}. Send a ${meta.name} signal.`}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_kind' })}
              style={{ background: `radial-gradient(closest-side, ${BRAND.ink}E6 0%, ${BRAND.ink}B3 60%, ${BRAND.ink}00 100%)` }}
              className={LEGEND_ITEM_CLASS}
            >
              <LegendLabel id={id} on={on} />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      ref={sectionRef}
      data-chapter=""
      {...hideMrOneHook}
      aria-labelledby="science-title"
      className="relative flex cursor-crosshair touch-manipulation select-none flex-col overflow-hidden px-6 text-white"
      style={{ background: BRAND.ink, height: `calc(100svh - ${headerH}px)`, minHeight: 560 }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      data-track-exempt="duplicate: the press emits landing.demo_interact (science_signal_send) imperatively via trackUi inside onPointerDown; adding trackProps here would double-count the click."
    >
      {/* Ambient: a soft aurora behind everything. It is static: a blurred layer that moves would be
          re-blurred on every frame. */}
      {!reduce && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{ background: AURORA }}
        />
      )}

      {/* Orbits: a tilted disc measured to sit between the headline and the buttons, never under
          either, with the logo upright at its centre. Every moving part is a composited layer. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: layout.ready ? 1 : 0, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.35, ease: EASE }}
      >
        {/* The pointer light rests on the flat layer, under the disc. */}
        {!reduce && (
          <motion.div
            className="absolute left-0 top-0 rounded-full"
            style={{
              x: lx,
              y: ly,
              opacity: lightOpacity,
              width: 300 * layout.orbitScale,
              height: 300 * layout.orbitScale,
              marginLeft: -150 * layout.orbitScale,
              marginTop: -150 * layout.orbitScale,
              background: 'radial-gradient(closest-side, rgba(255,255,255,0.16), rgba(255,255,255,0))',
            }}
          />
        )}

        <ScienceDisc
          layout={layout}
          sx={sx}
          sy={sy}
          focus={focus}
          spin={spin}
          reduce={reduce}
          pulses={pulses}
          onArrive={onArrive}
          logoScope={logoScope}
          logoX={logoX}
          logoY={logoY}
        />
      </motion.div>

      {/* Top: title block (sized to the viewport, never pushes the diagram off-screen) */}
      <HeroText boxRef={topRef} reduce={reduce} titleId="science-title" />

      {/* Middle: free band for the logo (the orbit layer itself is full-bleed, above) */}
      <div className="min-h-0 flex-1" />

      {/* Legend (interactive): the six minds on a circle around the logo */}
      {legend}

      {/* Bottom: the calls to action, always inside the viewport. */}
      <HeroActions boxRef={bottomRef} reduce={reduce} onFollow={onFollow} />
    </section>
  );
}
