import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  motion,
  useAnimate,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import { BRAND, ENGINE_META } from './ScienceUi';
import { CX, CY, LOGO, ORBITS, SPOKES } from './ScienceDiagrams';
import { Orbit, PulseSpark, type Pulse } from './ScienceHero';
import type { EngineId } from './science-model';

const ENGINES: EngineId[] = ['engagement', 'rhythm', 'meaning'];
const OUTER = ORBITS[ORBITS.length - 1].radius;

/**
 * The science hero's orbit animation (aurora, three rotating minds, the OneHook logo and travelling
 * signals), as a decorative background for another section.
 *
 * - Its centre (the logo) follows the pointer anywhere over `pointerTarget`, on a soft spring, and
 *   eases back to the middle of the section when the pointer leaves.
 * - It sits blurred and dimmed, so it reads as texture behind the foreground content.
 * - `revealed` brings it into focus (blur clears, orbits lift) and pins its centre on `anchor`
 *   (the "Explore the science" button), whether reached by pointer or keyboard.
 * - Signals fire on their own while the section is on screen, so it never looks static.
 *
 * Purely decorative: aria-hidden, pointer-events none. Reduced motion: static, no blur transition
 * animation, no parallax and no autoplay.
 */
export function ScienceOrbitBackdrop({
  revealed,
  pointerTarget,
  anchor,
  className = '',
  style,
}: {
  revealed: boolean;
  pointerTarget: RefObject<HTMLElement | null>;
  /** Element the centre snaps onto while `revealed`. */
  anchor: RefObject<HTMLElement | null>;
  className?: string;
  /** Extra positioning / masking for the root (merged under the blur and opacity). */
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.15 });
  const [logoScope, animateLogo] = useAnimate<SVGGElement>();
  const ids = useId().replace(/:/g, '');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const nextId = useRef(1);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The system travels with the pointer, so keep it compact relative to the section.
  const orbitScale = size.w && size.h ? Math.min(size.h * 0.38, size.w * 0.32) / OUTER : 1;
  const logoScale = Math.min(1.2, Math.max(0.7, orbitScale));

  // Centre of the system, in section pixels (the SVG viewBox is the section's own pixel box).
  const centerX = useMotionValue(0);
  const centerY = useMotionValue(0);
  const cx = useSpring(centerX, { stiffness: 110, damping: 22, mass: 0.7 });
  const cy = useSpring(centerY, { stiffness: 110, damping: 22, mass: 0.7 });
  // Parallax is replaced by following the pointer; the orbits still take the motion values.
  const still = useMotionValue(0);

  const home = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    centerX.set(r.width / 2);
    centerY.set(r.height / 2);
  }, [centerX, centerY]);

  const pinToAnchor = useCallback(() => {
    const root = rootRef.current?.getBoundingClientRect();
    const a = anchor.current?.getBoundingClientRect();
    if (!root || !a) return;
    centerX.set(a.left + a.width / 2 - root.left);
    centerY.set(a.top + a.height / 2 - root.top);
  }, [anchor, centerX, centerY]);

  // Start in the middle without animating in from the corner.
  useLayoutEffect(() => {
    if (!size.w) return;
    if (centerX.get() === 0 && centerY.get() === 0) {
      cx.jump(size.w / 2);
      cy.jump(size.h / 2);
      home();
    }
  }, [size.w, size.h, cx, cy, centerX, centerY, home]);

  // Follow the pointer; while revealed, stay pinned on the anchor instead.
  useEffect(() => {
    const target = pointerTarget.current;
    if (!target || reduce) return;
    const onMove = (e: PointerEvent) => {
      if (revealed) return pinToAnchor();
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      centerX.set(e.clientX - r.left);
      centerY.set(e.clientY - r.top);
    };
    const onLeave = () => {
      if (!revealed) home();
    };
    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerleave', onLeave);
    return () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
    };
  }, [pointerTarget, reduce, revealed, pinToAnchor, home, centerX, centerY]);

  // Snap onto the button the moment it is revealed (covers keyboard focus too), and back home after.
  useEffect(() => {
    if (revealed) pinToAnchor();
    else if (reduce) home();
  }, [revealed, reduce, pinToAnchor, home]);

  const onArrive = useCallback(
    (p: Pulse) => {
      setPulses((ps) => ps.filter((q) => q.id !== p.id));
      if (!reduce && logoScope.current) {
        void animateLogo(
          logoScope.current,
          { scale: [1, 1.12, 0.97, 1] },
          { duration: 0.65, ease: 'easeOut' }
        );
      }
    },
    [reduce, animateLogo, logoScope]
  );

  // Autoplay: a signal every couple of seconds while on screen; quicker while revealed.
  useEffect(() => {
    if (reduce || !inView) return;
    const t = window.setInterval(
      () => {
        if (document.visibilityState !== 'visible') return;
        const o =
          ORBITS.find((orb) => orb.engine === ENGINES[Math.floor(Math.random() * 3)]) ?? ORBITS[0];
        const a = Math.random() * Math.PI * 2;
        setPulses((ps) => [
          ...ps.slice(-8),
          {
            id: nextId.current++,
            x: CX + Math.cos(a) * o.radius,
            y: CY + Math.sin(a) * o.radius,
            engine: o.engine,
          },
        ]);
      },
      revealed ? 1100 : 2600
    );
    return () => window.clearInterval(t);
  }, [reduce, inView, revealed]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden transition-[filter,opacity] duration-700 ease-out motion-reduce:transition-none ${className}`}
      style={{
        ...style,
        filter: revealed ? 'blur(0px)' : 'blur(10px)',
        opacity: revealed ? 0.9 : 0.6,
      }}
    >
      {!reduce && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-3xl"
          style={{
            background: `conic-gradient(from 0deg, ${ENGINE_META.engagement.soft}, ${ENGINE_META.rhythm.soft}, ${ENGINE_META.meaning.soft}, ${ENGINE_META.engagement.soft})`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {size.w > 0 && (
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${size.w} ${size.h}`}>
          <defs>
            <radialGradient id={`${ids}-halo`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.2" />
              <stop offset="45%" stopColor={BRAND.silver} stopOpacity="0.05" />
              <stop offset="100%" stopColor={BRAND.ink} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${ids}-light`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
          </defs>

          <motion.g style={{ x: cx, y: cy }}>
            <g transform={`scale(${orbitScale}) translate(${-CX} ${-CY})`}>
              <circle cx={CX} cy={CY} r={OUTER + 24} fill={`url(#${ids}-halo)`} />
              {SPOKES.map((a, i) => (
                <line
                  key={i}
                  x1={CX + Math.cos(a) * (ORBITS[0].radius - 22)}
                  y1={CY + Math.sin(a) * (ORBITS[0].radius - 22)}
                  x2={CX + Math.cos(a) * (OUTER + 14)}
                  y2={CY + Math.sin(a) * (OUTER + 14)}
                  stroke="rgba(255,255,255,0.05)"
                />
              ))}
              <circle r={150} fill={`url(#${ids}-light)`} cx={CX} cy={CY} />
              {ORBITS.map((o, i) => (
                <g key={o.engine}>
                  <Orbit
                    index={i}
                    sx={still}
                    sy={still}
                    reduce={reduce}
                    dim={false}
                    lift={revealed}
                  />
                </g>
              ))}
              {pulses.map((p) => (
                <g key={p.id}>
                  <PulseSpark pulse={p} reduce={reduce} onArrive={onArrive} />
                </g>
              ))}
            </g>
          </motion.g>

          <motion.g style={{ x: cx, y: cy }}>
            <g transform={`scale(${logoScale}) translate(${-CX} ${-CY})`}>
              <g>
                <g ref={logoScope} style={{ transformOrigin: 'center', transformBox: 'fill-box' }}>
                  <circle
                    cx={CX}
                    cy={CY}
                    r={LOGO / 2 + 10}
                    fill="none"
                    stroke="rgba(255,255,255,0.18)"
                  />
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
                  <image
                    href={BRAND.logo}
                    x={CX - LOGO / 2}
                    y={CY - LOGO / 2}
                    width={LOGO}
                    height={LOGO}
                  />
                </g>
              </g>
            </g>
          </motion.g>
        </svg>
      )}
    </div>
  );
}
