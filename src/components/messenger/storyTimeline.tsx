/**
 * Story timeline for the Messenger page: scroll picks the screen, time plays it — once.
 *
 * The page always scrolls natively; nothing here moves the page or intercepts input.
 *
 * 1. The story track is split into equal bands, one per screen; the scroll position decides which
 *    screen the stage is heading for.
 * 2. The stage never skips: it walks there ONE SCREEN AT A TIME, however far or fast the reader scrolls.
 * 3. The first time a screen arrives going FORWARD, its choreography plays at its own authored pace
 *    (a 0..1 playhead animated over the screen's seconds), and the stage stays on it until that is
 *    done. Scroll speed never changes the pace or cuts it short.
 * 4. A screen plays once. Arriving on it again — or arriving by scrolling UP — switches to its
 *    finished state (playhead at 1, entrance/exit animations skipped). How long it stays up follows
 *    the reader's scroll speed (about the time they take to scroll one screen), never less than
 *    SHOW_MIN_MS, so a fast scroll through loaded screens still shows each one.
 *
 * Cost: a playhead only changes during its one playthrough, so finished screens do no per-frame work;
 * there is no follower loop and no scroll-driven re-computation of choreography. Screens shown
 * finished also start their ambient loops stopped (they are mounted while animations are skipped).
 *
 * With reduced motion every screen is simply shown finished.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import {
  MotionGlobalConfig,
  animate,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from 'motion/react';

/** A screen that is playing for the first time stays at least this long (its animation usually longer). */
export const MIN_SHOW_MS = 2000;
/** A loaded screen stays about as long as the reader takes to scroll one screen, within these bounds. */
export const SHOW_MIN_MS = 700;
export const SHOW_MAX_MS = 2000;
/** Scroll speed is measured over this recent window. */
const SPEED_WINDOW_MS = 400;
/** The scroll cap sits this far inside the next section, so the cap itself never selects the one after. */
const LIMIT_EPSILON = 0.0005;
/** A 'show' switch skips every animation started this soon after it (covers AnimatePresence's
 *  exit-then-enter hand-off). A forward 'play' switch ends it at once. */
const SHOW_SKIP_MS = 250;
/** Share of the progress line the animation takes; the rest of the line is time to look. */
export const ANIMATION_SHARE = 0.7;

export type Bands = { start: readonly number[]; len: readonly number[] };

/** Bands proportional to `weights`, summing to 1. */
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

/** Equal progress bands ensure every screen receives exactly the same scroll exposure. */
export function makeEqualBands(sceneCount: number): Bands {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new RangeError('sceneCount must be a positive integer');
  }
  return makeBands(Array.from({ length: sceneCount }, () => 1));
}

/**
 * One stable large-viewport scroll length per scene, plus the sticky stage itself. With a stage of
 * `100lvh - headerHeight`, the resulting scrollable distance is exactly `sceneCount * 100lvh`.
 */
export function storyTrackHeight(sceneCount: number, headerHeight: number): string {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new RangeError('sceneCount must be a positive integer');
  }
  return `calc(${(sceneCount + 1) * 100}lvh - ${Math.max(0, Math.round(headerHeight))}px)`;
}

/** The reader has reached the end of the story track (tiny tolerance for sub-pixel scroll). */
export function isStoryComplete(progress: number): boolean {
  return progress >= 1 - 0.0001;
}

/** Which band a progress value falls in (the last band includes 1). */
export function bandIndex(bands: Bands, p: number) {
  for (let i = bands.start.length - 1; i >= 0; i -= 1) if (p >= bands.start[i]) return i;
  return 0;
}

/**
 * How a screen arrives: 'play' its animation (first visit, going forward) or 'show' it finished
 * (going backward, or it has already played).
 */
export function arrivalMode(prev: number, next: number, played: ReadonlySet<number>): 'play' | 'show' {
  return next > prev && !played.has(next) ? 'play' : 'show';
}

/**
 * How long a loaded screen stays on stage at a scroll speed of `screensPerSecond`: the time it takes
 * to scroll one screen at that speed, kept between SHOW_MIN_MS and SHOW_MAX_MS.
 */
export function showDwellMs(screensPerSecond: number): number {
  const speed = Math.abs(screensPerSecond);
  if (!(speed > 0)) return SHOW_MAX_MS;
  return Math.min(SHOW_MAX_MS, Math.max(SHOW_MIN_MS, 1000 / speed));
}

/**
 * The reader's recent scroll speed, in screens per second, over the last SPEED_WINDOW_MS. It counts
 * scroll INTENT, not only movement: wheel and finger input are measured even when the scroll cap
 * blocks them, so pushing against the cap still reads as fast. Scroll movement from elsewhere
 * (scrollbar, keys, momentum after a swipe) is measured from the page itself.
 */
export function useScrollSpeed(enabled: boolean) {
  const meter = useMemo(() => {
    const samples: { at: number; px: number }[] = [];
    return {
      add(px: number, at = performance.now()) {
        samples.push({ at, px: Math.abs(px) });
        while (samples.length && at - samples[0].at > SPEED_WINDOW_MS) samples.shift();
      },
      screensPerSecond(at = performance.now()) {
        while (samples.length && at - samples[0].at > SPEED_WINDOW_MS) samples.shift();
        const px = samples.reduce((sum, x) => sum + x.px, 0);
        const screen = typeof window === 'undefined' ? 1 : window.innerHeight || 1;
        return px / screen / (SPEED_WINDOW_MS / 1000);
      },
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let lastY = window.scrollY;
    let lastInput = 0; // wheel/touch already counted: their scroll movement isn't counted twice
    let touchY = 0;
    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      meter.add(e.deltaY * unit);
      lastInput = performance.now();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchY;
      meter.add(touchY - y);
      touchY = y;
      lastInput = performance.now();
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (performance.now() - lastInput > 100) meter.add(y - lastY);
      lastY = y;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled, meter]);
  return meter;
}

/** What the playback controller needs from the outside world (Motion and the DOM in the app, fakes in tests). */
export type StoryPlayerDeps = {
  bands: Bands;
  seconds: readonly number[];
  play: readonly { set(v: number): void }[];
  line: readonly { set(v: number): void }[];
  /** Current scroll progress (0..1). */
  progress: () => number;
  /** The reader's recent scroll speed (screens per second), for how long loaded screens stay. */
  speed: () => number;
  /** Current time in ms. */
  now: () => number;
  /** Run `value` 0 → 1 linearly over `duration` s; call `onComplete` at the end. Returns a stop function. */
  run: (value: { set(v: number): void }, duration: number, onComplete?: () => void) => () => void;
  /** Skip every animation for a moment (a 'show' switch), or stop skipping (a 'play' switch). */
  setSkip: (on: boolean) => void;
  onChange: (index: number, instant: boolean) => void;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
};

/**
 * The story's playback rules (see `useStoryPlayback`), independent of React and Motion.
 *
 * The stage walks toward the screen the reader has scrolled to, one screen at a time:
 * - Forward onto a screen that has not played: it plays at its own pace, and the next forward step
 *   waits until its animation is done (it stays at least MIN_SHOW_MS either way).
 * - Backward, or onto a screen that has played: it is shown finished, animations skipped, and stays
 *   for `showDwellMs(speed)` — shorter the faster the reader scrolls, never under SHOW_MIN_MS. The
 *   speed is re-read on every scroll, so speeding up mid-wait moves on sooner.
 * - A screen left going backward before its animation finished counts as loaded.
 * - Everything before the screen on stage is in the past of the story, so it is finished too.
 */
export function createStoryPlayer(d: StoryPlayerDeps) {
  const { bands, seconds, play, line } = d;
  let committed = bandIndex(bands, d.progress());
  const played = new Set<number>();
  let playing: { scene: number; stop: () => void } | null = null;
  let dwell = 0; // timer: the screen on stage still has time to serve
  let shownAt = 0;
  let shownMode: 'play' | 'show' = 'play';

  const finish = (i: number) => {
    play[i].set(1);
    line[i].set(1);
  };
  /** Leaving a screen mid-animation (only possible going backward): it counts as loaded. */
  const finishPlaying = () => {
    if (!playing) return;
    playing.stop();
    finish(playing.scene);
    playing = null;
  };
  const start = (i: number) => {
    const duration = seconds[i] ?? 0;
    if (!(duration > 0)) return finish(i);
    play[i].set(0);
    line[i].set(0);
    const stopLine = d.run(line[i], duration / ANIMATION_SHARE);
    const stopPlay = d.run(play[i], duration, () => {
      if (playing?.scene !== i) return;
      playing = null;
      step(); // the animation is done: carry on toward wherever the reader has scrolled
    });
    playing = {
      scene: i,
      stop: () => {
        stopPlay();
        stopLine();
      },
    };
  };
  const commit = (next: number, mode: 'play' | 'show') => {
    finishPlaying();
    for (let i = 0; i < next; i += 1) finish(i);
    played.add(next);
    committed = next;
    if (mode === 'play') {
      d.setSkip(false);
      start(next);
    } else {
      finish(next);
      d.setSkip(true);
    }
    d.onChange(next, mode === 'show');
    shownAt = d.now();
    shownMode = mode;
    step(); // arms the dwell timer for this screen
  };
  /** One screen toward the scroll position, unless the screen on stage still needs its time. */
  const step = () => {
    const target = bandIndex(bands, d.progress());
    if (target === committed) return;
    // every screen gets its time: a first play MIN_SHOW_MS, a loaded screen as long as the scroll speed asks
    const need = shownMode === 'play' ? MIN_SHOW_MS : showDwellMs(d.speed());
    const left = need - (d.now() - shownAt);
    d.clearTimer(dwell);
    dwell = 0;
    if (left > 0) {
      dwell = d.setTimer(() => {
        dwell = 0;
        step();
      }, left);
      return;
    }
    if (target > committed && playing) return; // forward waits for the animation to finish
    const next = committed + (target > committed ? 1 : -1);
    commit(next, arrivalMode(committed, next, played));
  };

  return {
    /** The screen the page opens on plays (every visit starts by going forward). */
    begin: () => commit(committed, 'play'),
    onScroll: () => step(),
    /** Which screen is on stage, and whether one is still playing (for tests and debugging). */
    get index() {
      return committed;
    },
    get playingScene() {
      return playing?.scene ?? null;
    },
    dispose: () => {
      d.clearTimer(dwell);
      dwell = 0;
      playing?.stop();
      playing = null;
    },
  };
}

/**
 * Drives the story in the app: which screen is on stage, each screen's play-once playhead, and the
 * progress line (see `createStoryPlayer` for the rules).
 *
 * A 'show' switch turns on Motion's global `skipAnimations` for SHOW_SKIP_MS, so the entrances of the
 * screen switched to (and the previous screen's exits) land on their final frame instead of playing.
 * The progress line runs on the same clock as the animation: the animation is done at ANIMATION_SHARE
 * of it, the rest is time to look.
 */
export function useStoryPlayback(
  scroll: MotionValue<number>,
  bands: Bands,
  seconds: readonly number[],
  reduce: boolean,
  speed: { screensPerSecond(): number }
) {
  const n = bands.start.length;
  const play = useMemo(() => Array.from({ length: n }, () => motionValue(0)), [n]);
  const line = useMemo(() => Array.from({ length: n }, () => motionValue(0)), [n]);
  const [state, setState] = useState(() => ({ index: bandIndex(bands, scroll.get()), instant: false }));

  useEffect(() => {
    if (reduce) {
      play.forEach((v) => v.set(1));
      line.forEach((v) => v.set(1));
      return scroll.on('change', (p) => {
        const band = bandIndex(bands, p);
        setState((s) => (s.index === band ? s : { index: band, instant: false }));
      });
    }
    let skipTimer = 0;
    const player = createStoryPlayer({
      bands,
      seconds,
      play,
      line,
      progress: () => scroll.get(),
      speed: () => speed.screensPerSecond(),
      now: () => performance.now(),
      run: (value, duration, onComplete) => {
        const controls = animate(value as MotionValue<number>, 1, { duration, ease: 'linear', onComplete });
        return () => controls.stop();
      },
      setSkip: (on) => {
        window.clearTimeout(skipTimer);
        MotionGlobalConfig.skipAnimations = on;
        if (on) skipTimer = window.setTimeout(() => (MotionGlobalConfig.skipAnimations = false), SHOW_SKIP_MS);
      },
      onChange: (index, instant) => setState({ index, instant }),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
    });
    player.begin();
    const off = scroll.on('change', player.onScroll);
    return () => {
      off();
      player.dispose();
      window.clearTimeout(skipTimer);
      MotionGlobalConfig.skipAnimations = false;
    };
  }, [scroll, bands, seconds, reduce, play, line, speed]);

  return { index: state.index, instant: state.instant, play, line };
}

/**
 * The furthest the page may scroll (story progress) while screen `index` is on stage: the end of the
 * NEXT screen's section. The reader can scroll ahead into the next section while a screen plays, but
 * not past it — so the page never runs screens ahead of the stage. Null on the last screen (no cap).
 */
export function scrollLimit(bands: Bands, index: number): number | null {
  const next = index + 1;
  if (next >= bands.start.length) return null;
  return Math.min(1, bands.start[next] + bands.len[next]) - LIMIT_EPSILON;
}

/**
 * Holds the page at `maxProgress` (see `scrollLimit`). The wheel, a finger drag and the keyboard are
 * stopped at the limit before they scroll (no overshoot); anything else (scrollbar drag, momentum,
 * End key) is brought back to it. The stage is pinned, so the correction itself is invisible.
 */
export function useScrollLimit({
  trackRef,
  headerHeight,
  maxProgress,
  enabled,
}: {
  trackRef: RefObject<HTMLElement | null>;
  headerHeight: number;
  maxProgress: number | null;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled || maxProgress === null) return;
    /** scrollY of the limit: progress 0 → track top meets the header, 1 → track bottom meets the viewport bottom */
    const maxY = () => {
      const track = trackRef.current;
      if (!track) return Number.POSITIVE_INFINITY;
      const r = track.getBoundingClientRect();
      const top = window.scrollY + r.top - headerHeight;
      return top + maxProgress * (r.height + headerHeight - window.innerHeight);
    };
    const atLimit = () => window.scrollY >= maxY() - 1;
    const clamp = () => {
      const y = maxY();
      if (window.scrollY > y + 1) window.scrollTo({ top: y, behavior: 'instant' });
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0 && atLimit()) e.preventDefault();
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchY;
      const down = y < touchY; // finger moving up scrolls the page down
      touchY = y;
      if (down && atLimit() && e.cancelable) e.preventDefault();
    };
    const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar']);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (DOWN_KEYS.has(e.key) && !e.shiftKey && atLimit()) e.preventDefault();
    };
    clamp();
    window.addEventListener('scroll', clamp, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', clamp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [trackRef, headerHeight, maxProgress, enabled]);
}

type StoryValue = {
  /** Scroll progress through the story track (0..1). */
  scroll: MotionValue<number>;
  /** Each screen's play-once playhead (0..1). */
  play: readonly MotionValue<number>[];
  /** Each screen's progress line (0..1): animation, then look time. */
  line: readonly MotionValue<number>[];
  bands: Bands;
  reduce: boolean;
  /** The current screen was switched to finished (no animation). */
  instant: boolean;
};
const StoryContext = createContext<StoryValue | null>(null);

export function StoryTimelineProvider({ value, children }: { value: StoryValue; children: ReactNode }) {
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

function useStory(): StoryValue {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error('story hooks must be used inside StoryTimelineProvider');
  return ctx;
}

/** Whether the current screen was switched to without animation (CSS transitions can opt out too). */
export function useStoryInstant(): boolean {
  return useStory().instant;
}

/**
 * 0..1 playhead through scene `i`'s choreography: plays once at the screen's own pace, then stays at 1.
 * With reduced motion it is always 1: every screen simply shows its finished state.
 */
export function useSceneProgress(i: number): MotionValue<number> {
  const { play, reduce } = useStory();
  const done = useMotionValue(1);
  return reduce ? done : play[i];
}

/**
 * 0..1 progress line for scene `i`, on the screen's own clock: its animation fills the first
 * ANIMATION_SHARE, then the rest fills while everything stays on screen to look at.
 */
export function useSceneLine(i: number): MotionValue<number> {
  const { line, reduce } = useStory();
  const done = useMotionValue(1);
  return reduce ? done : line[i];
}

/**
 * Converts a screen's second-based choreography onto its playhead.
 * `t(start, end)` returns the [from, to] playhead range for something that runs from `start` to `end`
 * seconds into a `totalSeconds`-long screen.
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
 * How many of `marks` (sorted playhead values) `p` has passed. Re-renders only when that count
 * changes, so discrete story beats (a message arriving, a checkpoint lighting up) cost one render each.
 */
export function usePassed(p: MotionValue<number>, marks: readonly number[]) {
  const count = (v: number) => marks.reduce((n, m) => (v >= m ? n + 1 : n), 0);
  const [passed, setPassed] = useState(() => count(p.get()));
  useMotionValueEvent(p, 'change', (v) => {
    const c = count(v);
    setPassed((prev) => (prev === c ? prev : c));
  });
  // a new MotionValue (e.g. reduced motion switching) must be read once immediately
  useEffect(() => setPassed(count(p.get())), [p]);
  return passed;
}

/** Scene `i`'s playhead in its choreography seconds (0..totalSeconds) — real seconds since it arrived. */
export function useSceneClock(i: number, totalSeconds: number): MotionValue<number> {
  const p = useSceneProgress(i);
  return useTransform(p, (v) => v * totalSeconds);
}
