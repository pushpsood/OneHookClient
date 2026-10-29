import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { motion, useAnimate, useInView, useMotionValue, useReducedMotion } from 'motion/react';
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
 * - It stays centred on `anchor` (the "Explore the science" button) at all times; it does not
 *   follow the pointer.
 * - It sits blurred and dimmed, so it reads as texture behind the foreground content. While
 *   blurred the rings hold still: a moving layer under a blur is re-blurred on every frame.
 * - `revealed` brings it into focus (blur clears, rings spin), whether the button is reached by
 *   pointer or keyboard.
 * - Signals fire on their own while the section is on screen, so it never looks static.
 *
 * Every moving part is a composited layer (CSS spin), as on the hero.
 * Purely decorative: aria-hidden, pointer-events none. Reduced motion: static, no blur transition
 * animation and no autoplay.
 */
export function ScienceOrbitBackdrop({
  revealed,
  anchor,
  className = '',
  style,
}: {
  revealed: boolean;
  /** Element the disc is centred on. */
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

  // Centre of the system, in section pixels: always on the anchor.
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  // The rings take parallax motion values; here they stay still.
  const still = useMotionValue(0);

  const pinToAnchor = useCallback(() => {
    const root = rootRef.current;
    const a = anchor.current;
    if (!root || !a) return;
    // Layout offsets, not on-screen rects: the button's section fades up into place (a transform),
    // and the disc should sit where the button settles, not where it is mid-animation.
    const base = root.offsetParent;
    let x = a.offsetWidth / 2;
    let y = a.offsetHeight / 2;
    let el: HTMLElement | null = a;
    while (el && el !== base) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    if (el === base) {
      cx.set(x - root.offsetLeft);
      cy.set(y - root.offsetTop);
      return;
    }
    const r = root.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    cx.set(ar.left + ar.width / 2 - r.left);
    cy.set(ar.top + ar.height / 2 - r.top);
  }, [anchor, cx, cy]);

  // Re-centre whenever the section or the button changes size (resize, fonts, layout).
  useLayoutEffect(() => {
    pinToAnchor();
    const a = anchor.current;
    if (!a) return;
    const ro = new ResizeObserver(pinToAnchor);
    ro.observe(a);
    return () => ro.disconnect();
  }, [size.w, size.h, anchor, pinToAnchor]);
  useEffect(() => {
    if (revealed) pinToAnchor();
  }, [revealed, pinToAnchor]);

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
