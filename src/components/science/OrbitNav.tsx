import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { BRAND, ENGINE_META, type ChapterDef } from './ScienceUi';

/**
 * Chapter scroller in the floating bottom bar: the original side "drum", turned horizontal.
 *
 * It takes the place of the "Get the app" bar and behaves exactly like it: it appears once you have
 * scrolled past the first screen and keep scrolling down, hides when you scroll up, and never sits
 * over the footer or an open Mr OneHook chat. Its width matches that bar at every screen size.
 *
 * The chapters sit on a ring that rotates sideways as you scroll. The current chapter is at the
 * front — centred and full size; its neighbours turn away to the left and right into the dark slot,
 * foreshortened, smaller and fainter. A tapered ribbon runs along the slot: hairline where chapters
 * disappear into it, widest at the front, which sells the depth.
 *
 * Drag it sideways, or scroll / swipe over it, to turn the drum and jump to that chapter. While the
 * bar is moving the page it stays on screen, even when that means scrolling back up.
 */

const BAR_H = 46; // height of the dark slot
const RIBBON_Y = BAR_H - 7; // the ribbon runs along the slot's lower edge
const WIDE = 6; // ribbon thickness at the front (px)
const THIN = 0.75; // ribbon thickness where it enters the slot (px)
const MAX_DEG = 84; // beyond this a chapter has rotated into the slot

/** While the bar itself is scrolling the page (drag, wheel, tap), keep it visible until this time. */
let holdVisibleUntil = 0;

/**
 * Same show/hide rule as the floating "Get the app" bar (StickyCta): visible only while scrolling
 * DOWN past the first screen; hidden when scrolling up, over the footer, or while Mr OneHook is open.
 */
function useBottomBarVisible(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY + 2; // small threshold to ignore jitter
      const goingUp = y < lastY - 2;
      lastY = y;
      const pastFirstScreen = y > window.innerHeight * 0.7;
      const footer = document.querySelector('footer');
      const footerVisible = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;
      const chatbotOpen = !!document.querySelector('.chatbot-window');
      // Gone for good once the section after Promises (the finale) comes into view.
      const finale = document.querySelector('[aria-labelledby="finale-title"]');
      const pastPromises = finale ? finale.getBoundingClientRect().top < window.innerHeight : false;
      if (chatbotOpen || footerVisible || pastPromises || !pastFirstScreen) setShow(false);
      else if (goingDown || Date.now() < holdVisibleUntil) setShow(true);
      else if (goingUp) setShow(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('chatbotToggle', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('chatbotToggle', onScroll);
    };
  }, []);
  return show;
}

/**
 * The floating bar's width at each screen size (measured): full width minus 2rem on phones; 737px
 * from md up in landscape, where its tagline shows; otherwise 393px.
 */
function useBarWidth(): number {
  const [width, setWidth] = useState(737);
  useLayoutEffect(() => {
    const portrait = window.matchMedia('(orientation: portrait)');
    const measure = () => {
      const w = window.innerWidth;
      setWidth(w < 640 ? w - 32 : w >= 768 && !portrait.matches ? Math.min(737, w - 32) : Math.min(393, w - 32));
    };
    measure();
    window.addEventListener('resize', measure);
    portrait.addEventListener('change', measure);
    return () => {
      window.removeEventListener('resize', measure);
      portrait.removeEventListener('change', measure);
    };
  }, []);
  return width;
}

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
  const shown = useBottomBarVisible();
  const barW = useBarWidth();
  const idKey = chapters.map((c) => c.id).join('|');
  const ids = useMemo(() => idKey.split('|'), [idKey]);
  const rawPos = useChapterPosition(ids);

  // Spring the ring so it turns like a physical drum instead of snapping.
  const spring = useSpring(rawPos, reduce ? { stiffness: 1000, damping: 100 } : { stiffness: 110, damping: 22, mass: 0.7 });
  const [pos, setPos] = useState(rawPos);
  useEffect(() => spring.set(rawPos), [rawPos, spring]);
  useMotionValueEvent(spring, 'change', setPos);

  const [hover, setHover] = useState(false);
  const visible = shown && rawPos > -0.6;

  // Drag / wheel navigation. While dragging, the drum follows the finger instead of the page.
  const slotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; start: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const targetRef = useRef<{ index: number; at: number } | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const last = chapters.length - 1;
  const clampPos = (v: number) => Math.min(last, Math.max(0, v));
  const go = (index: number) => {
    const i = Math.round(clampPos(index));
    targetRef.current = { index: i, at: Date.now() };
    holdVisibleUntil = Date.now() + 1500;
    onSelect(ids[i]);
  };

  // Scrolling over the bar (wheel, trackpad, either axis) steps one chapter at a time. Native,
  // non-passive listener: the page must not also scroll, and a horizontal swipe must not trigger the
  // browser's back gesture.
  const goRef = useRef(go);
  goRef.current = go;
  const activeRef = useRef(0);
  activeRef.current = Math.max(0, Math.min(last, Math.round(rawPos)));
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    let acc = 0;
    let lastStep = 0;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      acc += delta;
      const now = Date.now();
      if (Math.abs(acc) < 30 || now - lastStep < 420) return;
      const dir = Math.sign(acc);
      acc = 0;
      lastStep = now;
      // Keep stepping from where the last step was heading, even before the page has caught up.
      const t = targetRef.current;
      const base = t && now - t.at < 1200 ? t.index : activeRef.current;
      trackUi(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' });
      goRef.current(base + dir);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const accents = [ENGINE_META.engagement.color, BRAND.silver, ENGINE_META.meaning.color];
  const activeIndex = Math.max(0, Math.min(chapters.length - 1, Math.round(rawPos)));
  const activeAccent = accents[activeIndex % accents.length];

  // Ring geometry follows the slot: a narrow phone slot spaces chapters further apart on the ring,
  // so the front label never collides with its neighbours.
  const CX = barW / 2;
  const R = barW / 2 - 24;
  const STEP = barW < 520 ? 48 : 32;
  const pxPerStep = R * Math.sin((STEP * Math.PI) / 180); // drag distance that turns one chapter
  const drumPos = dragPos ?? pos;

  // After a drag the drum holds on the chosen chapter; let go once the page has arrived there.
  useEffect(() => {
    if (dragPos === null || dragRef.current) return;
    if (Math.round(rawPos) === dragPos) {
      setDragPos(null);
      return;
    }
    const t = window.setTimeout(() => setDragPos(null), 1600);
    return () => window.clearTimeout(t);
  }, [dragPos, rawPos]);

  // Tapered ribbon along the slot: its thickness follows the ring's foreshortening (cos), so it is a
  // hairline where it disappears into the slot and thickest at the front.
  const SAMPLES = 64;
  const upper: string[] = [];
  const lower: string[] = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const x = CX - R + (s / SAMPLES) * (2 * R);
    const c = Math.sqrt(Math.max(0, 1 - ((x - CX) / R) ** 2));
    const hh = (THIN + (WIDE - THIN) * c) / 2;
    upper.push(`${x.toFixed(2)},${(RIBBON_Y - hh).toFixed(2)}`);
    lower.unshift(`${x.toFixed(2)},${(RIBBON_Y + hh).toFixed(2)}`);
  }
  const ribbon = `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
  const fade = `linear-gradient(to right, transparent 0, #000 ${barW * 0.2}px, #000 ${barW * 0.8}px, transparent ${barW}px)`;

  return (
    <motion.nav
      aria-label="Science chapters"
      // Same spot and motion as the floating "Get the app" bar. Only the slot takes clicks.
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center"
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 24 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
      aria-hidden={!visible}
    >
      <div
        ref={slotRef}
        className={`relative select-none overflow-hidden rounded-full border border-white/[0.07] backdrop-blur-2xl ${dragPos === null ? 'cursor-grab' : 'cursor-grabbing'}`}
        data-track-exempt="gesture: dragging or scrolling the chapter drum emits landing.demo_interact (science_chapter) imperatively via trackUi when it lands on a chapter; taps are tracked on each chapter button."
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          dragRef.current = { x: e.clientX, start: clampPos(pos), moved: false, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          if (!d.moved) {
            if (Math.abs(dx) < 6) return; // a tap, not a drag
            d.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          setDragPos(clampPos(d.start - dx / pxPerStep));
        }}
        onPointerUp={(e) => {
          const d = dragRef.current;
          dragRef.current = null;
          if (!d?.moved) return;
          const landed = clampPos(d.start - (e.clientX - d.x) / pxPerStep);
          suppressClick.current = true;
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 60);
          setDragPos(Math.round(landed)); // hold on the chosen chapter until the page arrives
          trackUi(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' });
          go(landed);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragPos(null);
        }}
        style={{
          width: barW,
          height: BAR_H,
          touchAction: 'pan-y', // vertical swipes still scroll the page; sideways ones turn the drum
          pointerEvents: visible ? 'auto' : 'none',
          background: `linear-gradient(180deg, ${BRAND.ink}fa 0%, ${BRAND.ink}f0 100%)`,
          boxShadow: '0 18px 50px -24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocusCapture={() => setHover(true)}
        onBlurCapture={() => setHover(false)}
      >
        {/* tapered line along the slot; its ends fade into the dark */}
        <svg
          aria-hidden="true"
          width={barW}
          height={BAR_H}
          viewBox={`0 0 ${barW} ${BAR_H}`}
          className="pointer-events-none absolute inset-0"
          style={{ WebkitMaskImage: fade, maskImage: fade }}
        >
          <defs>
            <linearGradient id="rail-fill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={activeAccent} stopOpacity="0" />
              <stop offset="50%" stopColor={activeAccent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={activeAccent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={ribbon} fill="url(#rail-fill)" />
        </svg>

        {chapters.map((c, i) => {
          const deg = (i - drumPos) * STEP; // angle on the ring; 0 = front
          if (Math.abs(deg) > MAX_DEG) return null;
          const rad = (deg * Math.PI) / 180;
          const cos = Math.cos(rad); // 1 at the front, -> 0 as it rotates into the slot
          const x = CX + R * Math.sin(rad);
          const on = Math.round(drumPos) === i && visible;
          const accent = accents[i % accents.length];
          const dot = 3 + 4 * cos;
          const labelOpacity = Math.max(0, hover ? Math.max(0.45, cos) : cos ** 1.6);
          // Turned away while it emerges, facing you at the front.
          const labelTransform = `perspective(420px) rotateY(${deg}deg) scale(${(0.72 + 0.28 * cos).toFixed(3)})`;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (suppressClick.current) return;
                go(i);
              }}
              aria-current={on ? 'step' : undefined}
              aria-label={`Chapter ${c.number}: ${c.title}`}
              tabIndex={visible && cos >= 0.3 ? 0 : -1}
              {...trackProps(UiElement.LANDING_DEMO_INTERACT, { value: 'science_chapter' })}
              className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center rounded-full px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              style={{ left: x, pointerEvents: cos < 0.25 ? 'none' : 'auto', zIndex: Math.round(cos * 10) }}
            >
              {/* label: turned away at the sides, facing you at the front */}
              <span
                aria-hidden="true"
                className="-mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap leading-none"
                style={{ opacity: labelOpacity, transform: labelTransform, transformOrigin: 'center' }}
              >
                <span className="font-mono" style={{ fontSize: 8 + 2 * cos, color: on ? accent : 'rgba(255,255,255,0.5)' }}>
                  {c.number}
                </span>
                <span
                  className="font-semibold uppercase"
                  style={{
                    fontSize: 8 + 3.5 * cos,
                    letterSpacing: `${(0.04 + 0.14 * cos).toFixed(3)}em`,
                    color: on ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
                  }}
                >
                  {c.title}
                </span>
              </span>

              {/* dot on the ribbon, under its label */}
              <span className="absolute grid h-3 w-3 place-items-center" style={{ top: RIBBON_Y - 6 }} aria-hidden="true">
                {on && !reduce && (
                  <motion.span
                    className="absolute h-3 w-3 rounded-full border"
                    style={{ borderColor: accent }}
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <span
                  className="rounded-full transition-colors duration-300"
                  style={{
                    width: dot,
                    height: dot,
                    opacity: 0.35 + 0.65 * cos,
                    background: on ? '#FFFFFF' : accent,
                    boxShadow: on ? `0 0 0 2px rgba(10,11,16,0.5), 0 0 12px ${accent}` : '0 0 0 1.5px rgba(10,11,16,0.45)',
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
