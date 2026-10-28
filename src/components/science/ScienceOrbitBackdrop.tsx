import {
  useCallback,
  useEffect,
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
import { AURORA, ENGINE_ORDER } from './ScienceUi';
import { CX, CY, ORBITS } from './ScienceDiagrams';
import { ScienceDisc, useScienceHeroDisc, type Pulse } from './ScienceHero';
import type { EngineId } from './science-model';

const ENGINES: EngineId[] = ENGINE_ORDER;
/**
 * The science hero's tilted orbit disc (aurora, six rotating minds, the OneHook logo and travelling
 * signals), as a decorative background for another section. Its geometry (size, lean, logo) is the
 * one the /science hero computes for the same screen, so in focus it looks exactly like the hero.
 *
 * - Its centre (the logo) follows the pointer anywhere over `pointerTarget`, on a soft spring, and
 *   eases back to the middle of the section when the pointer leaves.
 * - It sits blurred and dimmed, so it reads as texture behind the foreground content. While
 *   blurred the rings hold still: a moving layer under a blur is re-blurred on every frame.
 * - `revealed` brings it into focus (blur clears, rings spin) and pins its centre on
 *   `anchor` (the "Explore the science" button), whether reached by pointer or keyboard.
 * - Signals fire on their own while the section is on screen, so it never looks static.
 *
 * Every moving part is a composited layer (CSS spin, transform-only following), as on the hero.
 * Purely decorative: aria-hidden, pointer-events none. Reduced motion: static, no blur transition
 * animation and no autoplay.
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
  const [logoScope, animateLogo] = useAnimate<HTMLDivElement>();
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

  // The /science hero's own disc for this screen (measured from an invisible copy of the hero).
  const { layout: hero, frame } = useScienceHeroDisc();
  const disc = { cx: 0, cy: 0, tilt: hero.tilt, orbitScale: hero.orbitScale, logoR: hero.logoR };

  // Centre of the system, in section pixels.
  const centerX = useMotionValue(0);
  const centerY = useMotionValue(0);
  const cx = useSpring(centerX, { stiffness: 110, damping: 22, mass: 0.7 });
  const cy = useSpring(centerY, { stiffness: 110, damping: 22, mass: 0.7 });
  // Parallax is replaced by following the pointer; the rings still take motion values.
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
          ORBITS.find(
            (orb) => orb.engine === ENGINES[Math.floor(Math.random() * ENGINES.length)]
          ) ?? ORBITS[0];
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

  const spin = !reduce && inView && revealed;

  return (
    <>
      {frame}
      <div
        ref={rootRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden transition-[filter,opacity] duration-700 ease-out motion-reduce:transition-none ${className}`}
        style={{
          ...style,
          filter: revealed ? 'blur(0px)' : 'blur(10px)',
          opacity: revealed ? 1 : 0.6,
        }}
      >
        {size.w > 0 && hero.ready && (
          <motion.div className="absolute left-0 top-0" style={{ x: cx, y: cy }}>
            {/* The hero's aurora, centred on the disc. Static: a moving blurred layer would be
                re-blurred on every frame. */}
            {!reduce && (
              <div
                className="absolute h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
                style={{ background: AURORA }}
              />
            )}
            <ScienceDisc
              layout={disc}
              sx={still}
              sy={still}
              spin={spin}
              reduce={reduce}
              pulses={pulses}
              onArrive={onArrive}
              logoScope={logoScope}
              shade="var(--color-accent)"
            />
          </motion.div>
        )}
      </div>
    </>
  );
}
