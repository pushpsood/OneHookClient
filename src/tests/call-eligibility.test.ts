import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CALL_LOCK_FALLBACK_MESSAGE,
  CallEligibilityTracker,
  callButtonLabel,
  callLockMessage,
  handleCallTap,
  type CallEligibilityState,
} from '../lib/call-eligibility';
import type { CallEligibility } from '../api/calls';

/**
 * The "calling is locked until you've both messaged" gate.
 *
 * Exercises the framework-free engine through injected fakes (no React, no AppSync), the same way
 * call-session.test.ts drives CallSession. Covers the four behaviours the feature promises: locked by
 * default when the server says `allowed: false`, unlocking after a re-check flips to `allowed: true`,
 * failing OPEN on any error, and a tap on a locked button showing the explanation WITHOUT starting a
 * call. A static guard pins the telemetry + wiring contract that can't be reached through the engine.
 */

/** Flush pending microtasks (the tracker's async request) under real timers. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const MESSAGE_FIRST: CallEligibility = {
  allowed: false,
  reason: 'MESSAGE_FIRST',
  message: 'Calling unlocks once you have both sent a message',
};
const ALLOWED: CallEligibility = { allowed: true, reason: null, message: null };

function trackerWith(
  getEligibility: (matchId: string) => Promise<CallEligibility | null>,
  now: () => number = () => 0
) {
  const states: CallEligibilityState[] = [];
  const tracker = new CallEligibilityTracker({
    matchId: 'm1',
    getEligibility,
    onChange: (s) => states.push(s),
    now,
    throttleMs: 3000,
  });
  return { tracker, states };
}

describe('call eligibility engine', () => {
  it('is locked by default once the server returns allowed: false', async () => {
    const getEligibility = vi.fn(async () => MESSAGE_FIRST);
    const { tracker, states } = trackerWith(getEligibility);

    tracker.start();
    await flush();

    expect(getEligibility).toHaveBeenCalledTimes(1);
    const last = states.at(-1)!;
    expect(last.allowed).toBe(false);
    expect(last.reason).toBe('MESSAGE_FIRST');
    // The buttons derive their lock copy from the server message.
    expect(callLockMessage(last)).toBe('Calling unlocks once you have both sent a message');
    tracker.dispose();
  });

  it('unlocks after a re-check returns allowed: true, then stops checking', async () => {
    let nowValue = 0;
    const getEligibility = vi
      .fn<(matchId: string) => Promise<CallEligibility | null>>()
      .mockResolvedValueOnce(MESSAGE_FIRST)
      .mockResolvedValueOnce(ALLOWED);
    const { tracker, states } = trackerWith(getEligibility, () => nowValue);

    tracker.start();
    await flush();
    expect(states.at(-1)!.allowed).toBe(false);

    // Past the throttle window → the re-check fires immediately and flips to allowed.
    nowValue = 5000;
    tracker.recheck();
    await flush();

    expect(states.at(-1)!.allowed).toBe(true);
    expect(getEligibility).toHaveBeenCalledTimes(2);

    // Once unlocked, further re-checks are a no-op — no extra requests.
    nowValue = 20000;
    tracker.recheck();
    await flush();
    expect(getEligibility).toHaveBeenCalledTimes(2);
    tracker.dispose();
  });

  it('throttles to at most one request per window, coalescing a burst', async () => {
    vi.useFakeTimers();
    try {
      let nowValue = 0;
      const getEligibility = vi.fn(async () => MESSAGE_FIRST);
      const { tracker } = trackerWith(getEligibility, () => nowValue);

      tracker.start(); // request #1 at t=0
      await vi.advanceTimersByTimeAsync(0);
      expect(getEligibility).toHaveBeenCalledTimes(1);

      // Three rapid re-checks inside the window: none fire now; they coalesce into ONE trailing call.
      nowValue = 500;
      tracker.recheck();
      tracker.recheck();
      tracker.recheck();
      expect(getEligibility).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(getEligibility).toHaveBeenCalledTimes(2);
      tracker.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails open when the eligibility request throws (never blocks calling on an error)', async () => {
    const getEligibility = vi.fn(async () => {
      throw new Error('network down');
    });
    const { tracker, states } = trackerWith(getEligibility);

    tracker.start();
    await flush();

    expect(states.at(-1)!.allowed).toBe(true);
    tracker.dispose();
  });

  it('fails open (allowed) when the server has no eligibility row yet', async () => {
    const getEligibility = vi.fn(async () => null);
    const { tracker, states } = trackerWith(getEligibility);

    tracker.start();
    await flush();

    expect(states.at(-1)!.allowed).toBe(true);
    tracker.dispose();
  });

  it('makes no request after dispose', async () => {
    let nowValue = 0;
    const getEligibility = vi.fn(async () => MESSAGE_FIRST);
    const { tracker } = trackerWith(getEligibility, () => nowValue);
    tracker.start();
    await flush();
    tracker.dispose();

    nowValue = 10000;
    tracker.recheck();
    await flush();
    expect(getEligibility).toHaveBeenCalledTimes(1);
  });
});

describe('call button tap routing', () => {
  it('a tap on a LOCKED button shows the explanation and does NOT start a call', () => {
    const start = vi.fn();
    const explain = vi.fn();
    handleCallTap({ locked: true, start, explain });
    expect(explain).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('a tap on an UNLOCKED button starts the call', () => {
    const start = vi.fn();
    const explain = vi.fn();
    handleCallTap({ locked: false, start, explain });
    expect(start).toHaveBeenCalledTimes(1);
    expect(explain).not.toHaveBeenCalled();
  });
});

describe('call button accessibility labels', () => {
  it('conveys WHY a locked button is locked', () => {
    const msg = 'Calling unlocks once you have both sent a message';
    expect(callButtonLabel('audio', 'Alex', true, msg)).toBe(`Voice call, locked. ${msg}`);
    expect(callButtonLabel('video', 'Alex', true, msg)).toBe(`Video call, locked. ${msg}`);
  });

  it('is a plain start-call label when unlocked', () => {
    expect(callButtonLabel('audio', 'Alex', false, '')).toBe('Start an audio call with Alex');
    expect(callButtonLabel('video', 'Alex', false, '')).toBe('Start a video call with Alex');
  });

  it('falls back to the product copy when the server sent no message', () => {
    expect(callLockMessage({ allowed: false, reason: 'MESSAGE_FIRST', message: null })).toBe(
      CALL_LOCK_FALLBACK_MESSAGE
    );
  });
});

/**
 * Static guard for the parts the engine can't reach: the telemetry + wiring contract. A locked button
 * MUST stay a real, tracked press — if it were `disabled` (or `aria-disabled`) the delegated telemetry
 * tracker would drop the click, silently losing the deliberate `chat.call` / `chat.video_call` press.
 */
describe('call button + ChatView wiring contract', () => {
  const SRC = new URL('../', import.meta.url).pathname;
  const buttons = readFileSync(`${SRC}components/call/CallButtons.tsx`, 'utf8');
  const chatView = readFileSync(`${SRC}features/chat/ChatView.tsx`, 'utf8');

  it('keeps emitting chat.call / chat.video_call telemetry on the buttons', () => {
    expect(buttons).toContain('trackProps(UiElement.CHAT_CALL)');
    expect(buttons).toContain('trackProps(UiElement.CHAT_VIDEO_CALL)');
  });

  it('never marks a locked button disabled or aria-disabled (that would drop telemetry)', () => {
    // `disabled={disabled}` (an in-progress call) is fine; `disabled={locked}` / aria-disabled is not.
    expect(buttons).not.toMatch(/disabled=\{\s*locked\s*\}/);
    expect(buttons).not.toContain('aria-disabled');
  });

  it('wires eligibility into the call buttons and re-checks on send + peer message', () => {
    expect(chatView).toContain('useCallEligibility');
    expect(chatView).toContain('locked={eligibility.locked}');
    expect(chatView).toContain('lockMessage={eligibility.lockMessage}');
    // Re-check after the local send and when a peer message arrives.
    expect(chatView).toContain('eligibility.recheck()');
    expect((chatView.match(/eligibility\.recheck\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
