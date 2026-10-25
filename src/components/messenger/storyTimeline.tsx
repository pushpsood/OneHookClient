/**
 * Scroll-scrubbed story timeline for the Messenger page.
 *
 * The page always scrolls natively; nothing here intercepts input. Instead:
 *
 * 1. Scroll progress through the story track (0..1) is the TARGET.
 * 2. A "visual" progress follows it every frame: almost instantly for normal scrolling (so the
 *    animation feels scrubbed to the wheel), but never faster than MAX_SCENES_PER_SECOND. A hard
 *    flick therefore still plays every screen in order, just quickly, instead of skipping them.
 * 3. The track is split into bands, one per screen, sized by how much choreography each screen has.
 *    Inside its band a screen has a short entrance, a play window and a short rest on its end state.
 * 4. Screens read their own 0..1 play progress (`useSceneProgress`) and map their old second-based
 *    choreography onto it (`useTimeline`), so the existing timing is kept, just driven by scroll.
 *
 * With reduced motion the visual progress simply equals the scroll progress (no catch-up motion).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';

/** Fraction of each band spent entering, and resting on the finished state. */
const ENTER = 0.1;
const REST = 0.15;
/** The visual story never moves faster than this many screens per second. */
const MAX_SCENES_PER_SECOND = 1.4;
/** How quickly the visual story catches up with the scroll position (per second, exponential). */
const FOLLOW_RATE = 14;

export type Bands = { start: readonly number[]; len: readonly number[] };

/** Bands proportional to `weights` (e.g. each screen's choreography length), summing to 1. */
export function makeBands(weights: readonly number[]): Bands {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const len = weights.map((w) => w / total);
  const start: number[] = [];
  len.reduce((acc, l) => {
    start.push(acc);
    return acc + l;
  }, 0);
  return { start, len };
}

/** Which band a progress value falls in (the last band includes 1). */
export function bandIndex(bands: Bands, p: number) {
  for (let i = bands.start.length - 1; i >= 0; i -= 1) if (p >= bands.start[i]) return i;
  return 0;
}

/** Visual story progress: follows `target`, rate-limited so a hard flick still plays every screen. */
export function useVisualProgress(target: MotionValue<number>, bands: Bands, reduce: boolean) {
  const visual = useMotionValue(target.get());
  useEffect(() => {
    if (reduce) {
      visual.set(target.get());
      return target.on('change', (v) => visual.set(v));
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const t = target.get();
      const p = visual.get();
      const diff = t - p;
      if (Math.abs(diff) < 0.00005) {
        visual.set(t);
        raf = 0;
        last = 0;
        return;
      }
      const cap = bands.len[bandIndex(bands, p)] * MAX_SCENES_PER_SECOND * dt;
      const follow = diff * (1 - Math.exp(-FOLLOW_RATE * dt));
      visual.set(p + Math.max(-cap, Math.min(cap, follow)));
      raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    kick();
    const off = target.on('change', kick);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [target, visual, bands, reduce]);
  return visual;
}

type StoryValue = { progress: MotionValue<number>; bands: Bands; reduce: boolean };
const StoryContext = createContext<StoryValue | null>(null);

export function StoryTimelineProvider({ value, children }: { value: StoryValue; children: ReactNode }) {
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

/**
 * 0..1 progress through scene `i`'s play window (0 while it enters, 1 while it rests). With reduced
 * motion it is always 1: every screen simply shows its finished state.
 */
export function useSceneProgress(i: number): MotionValue<number> {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error('useSceneProgress must be used inside StoryTimelineProvider');
  const { progress, bands, reduce } = ctx;
  const a = bands.start[i] + bands.len[i] * ENTER;
  const b = bands.start[i] + bands.len[i] * (1 - REST);
  const local = useTransform(progress, [a, b], [0, 1], { clamp: true });
  const done = useMotionValue(1);
  return reduce ? done : local;
}

/**
 * Converts a screen's old second-based choreography onto its scroll progress.
 * `t(start, end)` returns the [from, to] progress range for something that used to run from
 * `start` to `end` seconds into a `totalSeconds`-long screen.
 */
export function useTimeline(totalSeconds: number) {
  return useMemo(
    () => ({
      t: (start: number, end: number): [number, number] => [
        Math.min(1, start / totalSeconds),
        Math.min(1, Math.max(start + 0.0001, end) / totalSeconds),
      ],
    }),
    [totalSeconds]
  );
}

/**
 * How many of `marks` (sorted progress values) `p` has passed. Re-renders only when that count
 * changes, so discrete story beats (a message arriving, a checkpoint lighting up) follow scroll in
 * both directions without re-rendering every frame.
 */
export function usePassed(p: MotionValue<number>, marks: readonly number[]) {
  const count = (v: number) => marks.reduce((n, m) => (v >= m ? n + 1 : n), 0);
  const [passed, setPassed] = useState(() => count(p.get()));
  useMotionValueEvent(p, 'change', (v) => {
    const c = count(v);
    setPassed((prev) => (prev === c ? prev : c));
  });
  // a new MotionValue (e.g. reduced motion switching) must be read once immediately
  useEffect(() => setPassed(count(p.get())), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return passed;
}
