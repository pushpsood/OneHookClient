import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arrivalMode,
  bandIndex,
  createStoryPlayer,
  MIN_SHOW_MS,
  isRepeatedAttempt,
  isStoryComplete,
  NUDGE_AFTER_MS,
  NUDGE_RESET_MS,
  makeEqualBands,
  scrollLimit,
  storyTrackHeight,
  type StoryPlayerDeps,
} from '../components/messenger/storyTimeline';

const bands = makeEqualBands(8);
const seconds = [3.9, 8.9, 6.1, 5.4, 3.0, 3.2, 3.9, 1.8];
/** Scroll progress in the middle of screen `i`'s band. */
const mid = (i: number) => (i + 0.5) / 8;

/** A player on fake time: runs complete when the clock passes their duration. */
function harness(startAt = 0) {
  let p = startAt;
  const value = () => ({ v: 0, set(x: number) { this.v = x; } });
  const play = Array.from({ length: 8 }, value);
  const line = Array.from({ length: 8 }, value);
  const changes: { index: number; instant: boolean }[] = [];
  const skips: boolean[] = [];
  const deps: StoryPlayerDeps = {
    bands,
    seconds,
    play,
    line,
    progress: () => p,
    now: () => Date.now(),
    run: (target, duration, onComplete) => {
      const id = setTimeout(() => {
        target.set(1);
        onComplete?.();
      }, duration * 1000);
      return () => clearTimeout(id);
    },
    setSkip: (on) => skips.push(on),
    onChange: (index, instant) => changes.push({ index, instant }),
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (id) => clearTimeout(id),
  };
  const player = createStoryPlayer(deps);
  return {
    player,
    play,
    line,
    changes,
    skips,
    /** The reader scrolls to progress `to`. */
    scrollTo(to: number) {
      p = to;
      player.onScroll();
    },
  };
}

describe('Messenger story timeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives every screen exactly the same scroll exposure', () => {
    bands.len.forEach((length) => expect(length).toBeCloseTo(1 / 8, 12));
    expect(bandIndex(bands, 1)).toBe(7);
    expect(storyTrackHeight(8, 73)).toBe('calc(900lvh - 73px)');
    expect(isStoryComplete(0.9999)).toBe(true);
  });

  it('plays a screen once, going forward, and shows it finished every other time', () => {
    const played = new Set<number>();
    expect(arrivalMode(2, 3, played)).toBe('play');
    expect(arrivalMode(4, 3, played)).toBe('show'); // scrolling up: never animate
    played.add(3);
    expect(arrivalMode(2, 3, played)).toBe('show'); // already played
  });

  it('plays each animation at its own pace, whatever the scroll speed', () => {
    const h = harness(mid(1));
    h.player.begin();
    expect(h.player.playingScene).toBe(1);
    // the reader scrolls on to screen 3 one second in: screen 2 keeps playing, not sped up or cut
    vi.advanceTimersByTime(1000);
    h.scrollTo(mid(3));
    expect(h.player.index).toBe(1);
    expect(h.play[1].v).toBe(0);
    vi.advanceTimersByTime(7800);
    expect(h.player.index).toBe(1); // still 0.1 s of its 8.9 s left
    vi.advanceTimersByTime(200);
    // done: on to the NEXT screen (never skipping), which then plays
    expect(h.play[1].v).toBe(1);
    expect(h.player.index).toBe(2);
    expect(h.player.playingScene).toBe(2);
    expect(h.changes.at(-1)).toEqual({ index: 2, instant: false });
  });

  it('scrolling back up leaves the stage on the furthest screen, finished, and never replays it', () => {
    const h = harness(mid(2));
    h.player.begin();
    vi.advanceTimersByTime(6100);
    h.scrollTo(mid(3));
    expect(h.changes.at(-1)).toEqual({ index: 3, instant: false });
    vi.advanceTimersByTime(300); // mid-way through screen 4's first play
    const before = h.changes.length;
    // up: the page shows the loaded screens; the stage stays on screen 4 and finishes it at once
    h.scrollTo(mid(1));
    expect(h.player.index).toBe(3);
    expect(h.play[3].v).toBe(1);
    expect(h.player.playingScene).toBeNull();
    // back down to it: nothing replays, nothing switches
    h.scrollTo(mid(3));
    expect(h.player.index).toBe(3);
    expect(h.changes.length).toBe(before);
  });

  it('after scrolling back, the next new screen still gets the first-play rules', () => {
    const h = harness(mid(2));
    h.player.begin();
    vi.advanceTimersByTime(6100);
    h.scrollTo(mid(3));
    vi.advanceTimersByTime(300);
    h.scrollTo(mid(0));
    h.scrollTo(mid(4)); // screen 4 has been on stage only 0.3 s: it keeps its minimum time
    expect(h.player.index).toBe(3);
    vi.advanceTimersByTime(MIN_SHOW_MS - 300 - 1);
    expect(h.player.index).toBe(3);
    vi.advanceTimersByTime(1);
    expect(h.player.index).toBe(4);
    expect(h.changes.at(-1)).toEqual({ index: 4, instant: false }); // a first play, animated
    expect(h.player.playingScene).toBe(4);
  });

  it('never skips a screen: a fast scroll from the top plays every screen in order, each in full', () => {
    const h = harness(mid(0));
    h.player.begin();
    h.scrollTo(mid(7)); // straight to the bottom on first load
    const visits: number[] = [];
    let at = 0;
    const order = [h.player.index];
    for (let i = 0; i < 7; i += 1) {
      // each screen holds for its full animation (and at least MIN_SHOW_MS), then the next plays
      const held = Math.max(seconds[i] * 1000, MIN_SHOW_MS);
      vi.advanceTimersByTime(held - 1);
      expect(h.player.index).toBe(i);
      vi.advanceTimersByTime(1);
      at += held;
      visits.push(at);
      order.push(h.player.index);
      expect(h.player.playingScene).toBe(i + 1);
    }
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(h.changes.every((c) => !c.instant)).toBe(true); // all first visits: all played
  });

  it('first plays are never shortened by scrolling on', () => {
    const h = harness(mid(6));
    h.player.begin();
    h.scrollTo(mid(7)); // screen 8 has never played: screen 7 plays its full 3.9 s first
    vi.advanceTimersByTime(3899);
    expect(h.player.index).toBe(6);
    vi.advanceTimersByTime(1);
    expect(h.player.index).toBe(7);
  });

  it('runs the progress line on the same clock: animation done at 70%, the rest is look time', () => {
    const h = harness(mid(6));
    h.player.begin();
    vi.advanceTimersByTime(3900);
    expect(h.play[6].v).toBe(1);
    expect(h.line[6].v).toBe(0); // look time still running
    vi.advanceTimersByTime(3900 / 0.7 - 3900);
    expect(h.line[6].v).toBe(1);
  });

  it('caps the scroll at the end of the next section, and lifts the cap on the last screen', () => {
    // screen 2 on stage: the reader may scroll through screen 3's section, not into screen 4's
    const cap = scrollLimit(bands, 1)!;
    expect(bandIndex(bands, cap)).toBe(2);
    expect(cap).toBeGreaterThan(mid(2));
    expect(cap).toBeLessThan(3 / 8);
    // the cap moves on with the stage, and is gone once screen 8 is up
    expect(bandIndex(bands, scrollLimit(bands, 5)!)).toBe(6);
    expect(scrollLimit(bands, 6)!).toBeLessThan(1);
    expect(scrollLimit(bands, 7)).toBeNull();
  });

  it('only counts repeated, sustained scroll attempts against the hold as "trying repeatedly"', () => {
    expect(isRepeatedAttempt([])).toBe(false);
    expect(isRepeatedAttempt([0, 16, 32, 48])).toBe(false); // one quick flick
    expect(isRepeatedAttempt([0, 200, 400, NUDGE_AFTER_MS])).toBe(true); // kept trying
    // a pause longer than the reset starts the count again
    expect(isRepeatedAttempt([0, NUDGE_AFTER_MS, NUDGE_AFTER_MS + NUDGE_RESET_MS + 1])).toBe(false);
  });

  it('stops cleanly', () => {
    const h = harness(mid(1));
    h.player.begin();
    h.player.dispose();
    vi.advanceTimersByTime(20_000);
    expect(h.play[1].v).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
