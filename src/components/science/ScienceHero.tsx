import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  AnimatePresence,
  motion,
  useAnimate,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { ArrowDown, Radio } from 'lucide-react';
import { hideMrOneHook } from '../Chatbot/ChatbotWidget';
import { Accent, BRAND, ENGINE_META, Kicker, pillClass } from './ScienceUi';
import { CX, CY, LOGO, ORBITS, SPOKES } from './ScienceDiagrams';
import type { EngineId } from './science-model';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
/**
 * Science hero: exactly one viewport tall (below the site header), never overflowing.
 *
 * Interaction model (all optional, all mirrored by keyboard-accessible buttons):
 *  - Move the pointer: the three orbits drift in parallax at different depths and a soft light follows.
 *  - Hover / focus a mind in the legend: its orbit comes forward, the others recede.
 *  - Tap anywhere in the orbits (or press "Send a signal"): a signal is born on the nearest orbit,
 *    travels to the logo, the logo answers with a heartbeat, and the counter ticks.
 *  - Left alone, the hero sends its own signals now and then, so it never looks static.
 *
 * Reduced motion: no parallax, no drift, no autoplay; signals still register instantly.
 */

const ENGINES: EngineId[] = ['engagement', 'rhythm', 'meaning'];
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

/** Layout for the orbit layer, measured from the real text blocks so nothing ever collides. */
function useHeroLayout(
  sectionRef: RefObject<HTMLElement | null>,
  topRef: RefObject<HTMLDivElement | null>,
  bottomRef: RefObject<HTMLDivElement | null>
) {
  const [layout, setLayout] = useState({ w: 800, h: 560, cx: 400, cy: 280, orbitScale: 1, logoScale: 1, ready: false });
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!section || !top || !bottom) return;
    const outer = ORBITS[ORBITS.length - 1].radius + 24; // outermost ring + halo, in orbit units
    const ring = LOGO + 20; // logo plus its hairline ring, in orbit units
    const measure = () => {
      const s = section.getBoundingClientRect();
      const textBottom = top.getBoundingClientRect().bottom - s.top;
      const legendTop = bottom.getBoundingClientRect().top - s.top;
      const gapTop = Math.min(56, Math.max(28, s.height * 0.05)); // breathing room under the text
      const gapBottom = 16;
      const band = Math.max(0, legendTop - textBottom - gapTop - gapBottom);
      const cx = s.width / 2;
      const cy = textBottom + gapTop + band / 2;
      // Logo: comfortably sized, but always inside the free band.
      const logoPx = Math.min(band, Math.max(88, Math.min(176, Math.min(s.width, s.height) * 0.2)));
      // `orbitPx` is the radius of the complete outer halo, not its diameter. Cap it against every
      // viewport edge around the measured centre so the full circle is visible at every aspect ratio.
      const edgeInset = s.width < 640 ? 12 : 24;
      const availableRadius = Math.max(
        1,
        Math.min(cx - edgeInset, s.width - cx - edgeInset, cy - edgeInset, s.height - cy - edgeInset)
      );
      const preferredRadius = Math.max(
        logoPx * 1.9,
        Math.min(s.height * 0.62, s.width * (s.width < 640 ? 0.72 : 0.58))
      );
      const orbitPx = Math.min(preferredRadius, availableRadius);
      const next = {
        w: s.width,
        h: s.height,
        cx,
        cy,
        orbitScale: orbitPx / outer,
        logoScale: logoPx / ring,
        ready: true,
      };
      // Skip no-op updates so a resize observation can never feed back into another render.
      setLayout((prev) =>
        (Object.keys(next) as (keyof typeof next)[]).every((k) => prev[k] === next[k]) ? prev : next
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    [section, top, bottom].forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [sectionRef, topRef, bottomRef]);
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

/** One orbit with its own parallax depth; rotation runs inside the parallax layer. */
export function Orbit({
  index,
  sx,
  sy,
  dim,
  lift,
  reduce,
}: {
  index: number;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  dim: boolean;
  lift: boolean;
  reduce: boolean;
}) {
  const o = ORBITS[index];
  const depth = 10 + index * 12; // outer orbits move more, which reads as depth
  const x = useTransform(sx, (v) => v * depth);
  const y = useTransform(sy, (v) => v * depth);
  const color = ENGINE_META[o.engine].color;
  return (
    <motion.g style={reduce ? undefined : { x, y }} animate={{ opacity: dim ? 0.18 : 1 }} transition={{ duration: 0.5, ease: EASE }}>
      <motion.g
        style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        animate={reduce ? { rotate: 0 } : { rotate: 360 * o.direction }}
        transition={reduce ? { duration: 0 } : { duration: o.duration, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx={CX} cy={CY} r={o.radius} fill="none" stroke={color} strokeOpacity={lift ? 0.55 : 0.22} strokeDasharray={lift ? '0' : '1 6'} style={{ transition: 'stroke-opacity 400ms' }} />
        {o.points.map((p) => (
          <motion.circle
            key={p.k}
            cx={p.x}
            cy={p.y}
            fill={color}
            initial={false}
            animate={{ r: lift ? p.r * 1.7 : p.r, opacity: p.r > 2 ? 0.95 : 0.55 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: lift ? (p.k % 8) * 0.015 : 0 }}
          />
        ))}
      </motion.g>
    </motion.g>
  );
}

/** Headline that rises word by word out of a soft blur. */
function RevealHeadline({ reduce }: { reduce: boolean }) {
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
      id="science-title"
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

export function ScienceHero({ onFollow }: { onFollow: () => void }) {
  const reduce = useReducedMotion() ?? false;
  const headerH = useHeaderOffset();
  const sectionRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<SVGGElement>(null);
  const layout = useHeroLayout(sectionRef, topRef, bottomRef);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const [logoScope, animateLogo] = useAnimate<SVGGElement>();

  const [focus, setFocus] = useState<EngineId | null>(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [received, setReceived] = useState(0);
  const [last, setLast] = useState<EngineId | null>(null);
  const lastInteraction = useRef(0);
  const nextId = useRef(1);

  // Pointer: normalised (-1..1) for parallax, SVG units for the light.
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const sx = useSpring(nx, { stiffness: 60, damping: 18, mass: 0.6 });
  const sy = useSpring(ny, { stiffness: 60, damping: 18, mass: 0.6 });
  const lx = useSpring(CX, { stiffness: 140, damping: 22 });
  const ly = useSpring(CY, { stiffness: 140, damping: 22 });
  const lightOpacity = useSpring(0, { stiffness: 80, damping: 20 });
  const logoX = useTransform(sx, (v) => v * -6);
  const logoY = useTransform(sy, (v) => v * -6);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const group = orbitRef.current;
    const svg = group?.ownerSVGElement;
    const ctm = group?.getScreenCTM();
    if (!group || !svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
  }, []);

  const emit = useCallback((x: number, y: number, engine: EngineId) => {
    setPulses((ps) => [...ps.slice(-8), { id: nextId.current++, x, y, engine }]);
  }, []);

  /** A signal born on a random point of one orbit (used by the button and by autoplay). */
  const emitRandom = useCallback(
    (engine?: EngineId) => {
      const o = ORBITS.find((orb) => orb.engine === (engine ?? ENGINES[Math.floor(Math.random() * 3)])) ?? ORBITS[0];
      const a = Math.random() * Math.PI * 2;
      emit(CX + Math.cos(a) * o.radius, CY + Math.sin(a) * o.radius, o.engine);
    },
    [emit]
  );

  const onArrive = useCallback(
    (p: Pulse) => {
      setPulses((ps) => ps.filter((q) => q.id !== p.id));
      setReceived((n) => n + 1);
      setLast(p.engine);
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
    const p = toSvg(e.clientX, e.clientY);
    if (p) {
      lx.set(p.x);
      ly.set(p.y);
    }
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
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    lastInteraction.current = Date.now();
    // One demo interaction per press. Emitted imperatively here (not via trackProps) because the
    // tracked event is the pointer press itself — a press that becomes a drag never fires a `click`,
    // and we must count it exactly once without the delegated click listener also counting it.
    trackUi(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_send' });
    const dist = Math.hypot(p.x - CX, p.y - CY);
    // The logo is drawn at its own scale; convert its radius into orbit units for the hit test.
    if (dist < (LOGO / 2 + 10) * (layout.logoScale / layout.orbitScale)) {
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

  const outer = ORBITS[ORBITS.length - 1].radius;

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
      {/* Ambient: a slow, symmetric aurora behind everything */}
      {!reduce && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background: `conic-gradient(from 0deg, ${ENGINE_META.engagement.soft}, ${ENGINE_META.rhythm.soft}, ${ENGINE_META.meaning.soft}, ${ENGINE_META.engagement.soft})`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Orbits: full-bleed background layer, measured so the logo sits in the free band below the
          text with a guaranteed gap, while the (larger) orbits may run behind the headline. */}
      <motion.svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: layout.ready ? 1 : 0, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.35, ease: EASE }}
      >
        <defs>
            <radialGradient id="hero-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.2" />
              <stop offset="45%" stopColor={BRAND.silver} stopOpacity="0.05" />
              <stop offset="100%" stopColor={BRAND.ink} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="hero-light" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
          </defs>
        <g ref={orbitRef} transform={`translate(${layout.cx} ${layout.cy}) scale(${layout.orbitScale}) translate(${-CX} ${-CY})`}>

            <circle cx={CX} cy={CY} r={outer + 24} fill="url(#hero-halo)" />

            {SPOKES.map((a, i) => (
              <line
                key={i}
                x1={CX + Math.cos(a) * (ORBITS[0].radius - 22)}
                y1={CY + Math.sin(a) * (ORBITS[0].radius - 22)}
                x2={CX + Math.cos(a) * (outer + 14)}
                y2={CY + Math.sin(a) * (outer + 14)}
                stroke="rgba(255,255,255,0.05)"
              />
            ))}

            {!reduce && <motion.circle r={150} fill="url(#hero-light)" cx={lx} cy={ly} style={{ opacity: lightOpacity }} pointerEvents="none" />}

            {ORBITS.map((o, i) => (
              <g key={o.engine}>
                <Orbit index={i} sx={sx} sy={sy} reduce={reduce} dim={focus !== null && focus !== o.engine} lift={focus === o.engine} />
              </g>
            ))}

            {pulses.map((p) => (
              <g key={p.id}>
                <PulseSpark pulse={p} reduce={reduce} onArrive={onArrive} />
              </g>
            ))}

        </g>
        <g transform={`translate(${layout.cx} ${layout.cy}) scale(${layout.logoScale}) translate(${-CX} ${-CY})`}>
            {/* The one — counter-parallax so it feels anchored while the orbits float */}
            <motion.g style={reduce ? undefined : { x: logoX, y: logoY }}>
              <g ref={logoScope} style={{ transformOrigin: 'center', transformBox: 'fill-box' }}>
                <circle cx={CX} cy={CY} r={LOGO / 2 + 10} fill="none" stroke="rgba(255,255,255,0.18)" />
                {!reduce && (
                  <motion.circle
                    cx={CX}
                    cy={CY}
                    fill="none"
                    stroke="rgba(255,255,255,0.25)"
                    initial={{ r: LOGO / 2 + 10, opacity: 0.5 }}
                    animate={{ r: LOGO / 2 + 40, opacity: 0 }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <image href={BRAND.logo} x={CX - LOGO / 2} y={CY - LOGO / 2} width={LOGO} height={LOGO} />
              </g>
            </motion.g>
        </g>
      </motion.svg>

      {/* Legibility scrim: the orbits may pass behind the headline, so soften them there. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[5]"
        style={{
          height: layout.ready ? Math.max(0, layout.cy - (LOGO / 2 + 10) * layout.logoScale) : '40%',
          background: `radial-gradient(70% 85% at 50% 38%, ${BRAND.ink}e6 0%, ${BRAND.ink}99 45%, transparent 100%)`,
          maskImage: 'linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)',
        }}
      />

      {/* Top: title block (sized to the viewport, never pushes the diagram off-screen) */}
      <div ref={topRef} className="relative z-10 mx-auto w-full max-w-6xl shrink-0 pt-[clamp(1.25rem,5vh,3.5rem)] text-center">
        <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Kicker dark>OneHook Intelligence</Kicker>
        </motion.div>
        <div className="mt-[clamp(0.75rem,2.5vh,1.75rem)]">
          <RevealHeadline reduce={reduce} />
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

      {/* Middle: free band for the logo (the orbit layer itself is full-bleed, above) */}
      <div className="min-h-0 flex-1" />

      {/* Bottom: legend (interactive), live counter, CTAs — always inside the viewport */}
      <div ref={bottomRef} className="relative z-10 mx-auto min-w-0 w-full max-w-4xl shrink-0 pb-[clamp(1rem,4vh,2.5rem)]">
        <ul className="grid grid-cols-3 gap-2" aria-label="The three minds">
          {ENGINES.map((id) => {
            const meta = ENGINE_META[id];
            const on = focus === id;
            return (
              <li key={id}>
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
                  className="group flex w-full flex-col items-center gap-1.5 rounded-2xl px-2 py-2 text-center transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <motion.span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.color, boxShadow: on ? `0 0 12px ${meta.color}` : 'none' }}
                    animate={{ scale: on ? 1.8 : 1 }}
                  />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.18em] sm:text-[10px] sm:tracking-[0.3em]" style={{ color: on ? meta.color : 'rgba(255,255,255,0.7)' }}>
                    {meta.name}
                  </span>
                  <span className="hidden text-xs font-light text-white/40 sm:block">{meta.role}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-[clamp(0.5rem,2vh,1.25rem)] flex flex-col items-center justify-center gap-3">
          <div className="grid min-w-0 w-full max-w-sm grid-cols-2 gap-2 [&>button]:min-w-0 sm:flex sm:w-auto sm:max-w-none sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() => {
                lastInteraction.current = Date.now();
                emitRandom();
              }}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_send' })}
              className={`${pillClass('ghost-light')} whitespace-nowrap px-3 sm:px-6`}
            >
              <Radio className="hidden h-3.5 w-3.5 sm:inline" aria-hidden="true" /> Send a signal
            </button>
            <button type="button" onClick={onFollow} {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_signal_send' })} className={`${pillClass('solid-light')} whitespace-nowrap px-3 sm:px-6`}>
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
          </div>
          <p className="flex items-center gap-2 font-mono text-[11px] text-white/45" aria-live="polite">
            <span className="tabular-nums text-white/80">{String(received).padStart(3, '0')}</span>
            <span>signals received</span>
            <AnimatePresence mode="wait">
              {last && (
                <motion.span
                  key={`${last}-${received}`}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  style={{ color: ENGINE_META[last].color }}
                >
                  · {ENGINE_META[last].name}
                </motion.span>
              )}
            </AnimatePresence>
          </p>
        </div>
      </div>
    </section>
  );
}
