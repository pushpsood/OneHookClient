import { describe, expect, it, vi } from 'vitest';
import { GraphQLOperationError } from '../api/graphql-error';
import { parseLiveLocationUpdate, type LocationFix } from '../lib/chat-structured';
import { MAX_LIVE_SHARE_MS, liveSessionKey, mergeLiveSession, type LiveSessions } from '../lib/live-location';
import {
  DISTANCE_FILTER_M,
  LIVE_DURATIONS,
  LiveLocationSharing,
  MAX_LIVE_CIPHERTEXT_CHARS,
  MAX_RETRIES_PER_FIX,
  MIN_PUBLISH_INTERVAL_MS,
  STATIONARY_AFTER_MS,
  TAB_BOUND_COPY,
  UNLOAD_AUTH_REFRESH_MS,
  endNotice,
  isSignificantMove,
  makeLiveWindow,
  newLiveSessionId,
  publishOutcomeFromError,
  withLocalEnds,
  type BeginShareInput,
  type EndedShare,
  type LocationWatchOptions,
} from '../lib/live-location-sharing';

/**
 * The web sharer's engine (lib/live-location-sharing.ts) against fake transport, location, clock and
 * page: the 5-s throttle, coalescing, the 25-m filter, the contract's error table, expiry, Stop, the
 * end events (another device, State, sign-out) and the best-effort stop when the tab closes.
 */

const T0 = 1_794_700_000_000;
const MATCH = 'match-1';
const ME = 'me-id';
const SESSION = '3f6d2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const SESSION_2 = 'aaaaaaaa-1111-2222-3333-444444444444';
const METRES_PER_DEG_LAT = 111_195;

const BASE: LocationFix = { lat: 12.9716, lon: 77.5946, accuracyM: 5, at: T0 };

/** `fix` moved `metres` north. */
function north(fix: LocationFix, metres: number, extra: Partial<LocationFix> = {}): LocationFix {
  return { ...fix, lat: fix.lat + metres / METRES_PER_DEG_LAT, ...extra };
}

interface Watch {
  onFix: (fix: LocationFix) => void;
  onDenied: () => void;
  options: LocationWatchOptions;
  stopped: boolean;
}

function harness() {
  let now = T0;
  let publishImpl: () => Promise<unknown> = async () => ({});
  let unloadAttempted = true;
  const published: { matchId: string; sessionId: string; ciphertext: string; expiresAt: number }[] = [];
  const subscriptions = new Map<string, (row: { matchId: string; userId: string; sessionId: string; ended: boolean }) => void>();
  const watches: Watch[] = [];
  const pageHide = new Set<() => void>();
  const intervals = new Set<unknown>();
  const transport = {
    publish: vi.fn(async (matchId: string, sessionId: string, ciphertext: string, expiresAt: number) => {
      published.push({ matchId, sessionId, ciphertext, expiresAt });
      return publishImpl();
    }),
    stop: vi.fn(async () => ({})),
    stopOnUnload: vi.fn(() => unloadAttempted),
    subscribe: vi.fn((matchId: string, onRow: (row: { matchId: string; userId: string; sessionId: string; ended: boolean }) => void) => {
      subscriptions.set(matchId, onRow);
      return () => {
        subscriptions.delete(matchId);
      };
    }),
    primeUnloadAuth: vi.fn(async () => undefined),
    clearUnloadAuth: vi.fn(),
  };
  const engine = new LiveLocationSharing({
    transport,
    location: {
      watch(onFix, onDenied, options) {
        const watch: Watch = { onFix, onDenied, options, stopped: false };
        watches.push(watch);
        return () => {
          watch.stopped = true;
        };
      },
    },
    clock: {
      now: () => now,
      setInterval: () => {
        const handle = {};
        intervals.add(handle);
        return handle;
      },
      clearInterval: (handle) => {
        intervals.delete(handle);
      },
    },
    page: {
      onPageHide(fn) {
        pageHide.add(fn);
        return () => {
          pageHide.delete(fn);
        };
      },
    },
  });
  const ends: EndedShare[] = [];
  engine.onEnd((end) => ends.push(end));

  const seal = vi.fn(async (plaintext: string) => `sealed:${plaintext}`);
  const input = (overrides: Partial<BeginShareInput> = {}): BeginShareInput => ({
    matchId: MATCH,
    sessionId: SESSION,
    startedAt: now,
    expiresAt: now + 15 * 60_000,
    userId: ME,
    peerName: 'Riya',
    seal,
    ...overrides,
  });

  return {
    engine,
    transport,
    published,
    subscriptions,
    watches,
    pageHide,
    intervals,
    ends,
    seal,
    input,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
    setPublish: (fn: () => Promise<unknown>) => {
      publishImpl = fn;
    },
    setUnloadAttempted: (value: boolean) => {
      unloadAttempted = value;
    },
    /** The live_location_update inside a published ciphertext. */
    update: (index: number) => {
      const entry = published[index];
      const plaintext = entry.ciphertext.replace(/^sealed:/, '');
      return parseLiveLocationUpdate(plaintext, entry.sessionId);
    },
    activeWatch: () => watches.filter((w) => !w.stopped),
  };
}

const graphqlError = (errorType: string) => new GraphQLOperationError('refused', errorType);

describe('starting a share', () => {
  it('publishes the first position at once, sealed for the conversation, with the share expiry', async () => {
    const h = harness();
    const start = h.input();
    await h.engine.begin(start, BASE);
    expect(h.published).toHaveLength(1);
    expect(h.published[0]).toMatchObject({ matchId: MATCH, sessionId: SESSION, expiresAt: start.expiresAt });
    expect(h.update(0)).toMatchObject({ type: 'live_location_update', sessionId: SESSION, lat: 12.9716, lon: 77.5946, accuracyM: 5, at: T0 });
    expect(h.seal).toHaveBeenCalledTimes(1);
    expect(h.engine.share(MATCH)).toMatchObject({ sessionId: SESSION, peerName: 'Riya', latest: BASE });
    expect(h.engine.isRunning(SESSION)).toBe(true);
  });

  it('starts the position watch at high accuracy, the tick, the pagehide hook and the end subscription', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    expect(h.activeWatch()).toHaveLength(1);
    expect(h.activeWatch()[0].options.highAccuracy).toBe(true);
    expect(h.intervals.size).toBe(1);
    expect(h.pageHide.size).toBe(1);
    expect(h.subscriptions.has(MATCH)).toBe(true);
    expect(h.transport.primeUnloadAuth).toHaveBeenCalled();
  });

  it('never runs past the backend 8-hour ceiling and ignores a share that already expired', async () => {
    const h = harness();
    await h.engine.begin(h.input({ expiresAt: h.now() + MAX_LIVE_SHARE_MS + 60_000 }), BASE);
    expect(h.engine.share(MATCH)?.expiresAt).toBe(T0 + MAX_LIVE_SHARE_MS);

    const late = harness();
    await late.engine.begin(late.input({ expiresAt: late.now() - 1 }), BASE);
    expect(late.published).toHaveLength(0);
    expect(late.engine.share(MATCH)).toBeUndefined();
  });

  it('stops the previous share in the same conversation before running a new one', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(10_000);
    await h.engine.begin(h.input({ sessionId: SESSION_2 }), BASE);
    expect(h.transport.stop).toHaveBeenCalledWith(MATCH, SESSION);
    expect(h.ends.map((e) => [e.sessionId, e.reason])).toEqual([[SESSION, 'stopped']]);
    expect(h.engine.share(MATCH)?.sessionId).toBe(SESSION_2);
    expect(h.published.map((p) => p.sessionId)).toEqual([SESSION, SESSION_2]);
  });
});

describe('throttle, coalescing and the distance filter', () => {
  it('holds a move inside the 5-s window and sends it when the window opens', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(2_000);
    await h.engine.handleFix(north(BASE, 40, { at: h.now() }));
    expect(h.published).toHaveLength(1);
    h.advance(2_000);
    await h.engine.tick();
    expect(h.published).toHaveLength(1);
    h.advance(MIN_PUBLISH_INTERVAL_MS - 4_000);
    await h.engine.tick();
    expect(h.published).toHaveLength(2);
  });

  it('coalesces: of several moves inside one window only the newest goes out', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    const a = north(BASE, 40, { at: T0 + 1_000 });
    const b = north(BASE, 80, { at: T0 + 2_000 });
    const c = north(BASE, 120, { at: T0 + 3_000 });
    for (const fix of [a, b, c]) {
      h.advance(1_000);
      await h.engine.handleFix(fix);
    }
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.tick();
    await h.engine.tick();
    expect(h.published).toHaveLength(2);
    expect(h.update(1)?.lat).toBeCloseTo(c.lat, 5);
    expect(h.update(1)?.at).toBe(c.at);
  });

  it('sends a move straight away once 5 s have passed since the last publish', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.handleFix(north(BASE, 30, { at: h.now() }));
    expect(h.published).toHaveLength(2);
  });

  it('ignores movement under 25 m, and jitter inside the accuracy radius', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.handleFix(north(BASE, DISTANCE_FILTER_M - 5));
    await h.engine.handleFix(north(BASE, 40, { accuracyM: 60 }));
    await h.engine.tick();
    expect(h.published).toHaveLength(1);
  });

  it('measures from the last position that counted, so slow drift still adds up', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.handleFix(north(BASE, 15));
    await h.engine.handleFix(north(BASE, 30));
    expect(h.published).toHaveLength(2);
  });

  it('a fix arriving while a publish is in flight goes out after the window, not in parallel', async () => {
    const h = harness();
    let release: () => void = () => undefined;
    h.setPublish(() => new Promise((resolve) => (release = () => resolve({}))));
    const first = h.engine.begin(h.input(), BASE);
    await vi.waitFor(() => expect(h.transport.publish).toHaveBeenCalledTimes(1));
    h.advance(MIN_PUBLISH_INTERVAL_MS + 1);
    await h.engine.handleFix(north(BASE, 50, { at: h.now() }));
    expect(h.transport.publish).toHaveBeenCalledTimes(1);
    h.setPublish(async () => ({}));
    release();
    await first;
    await h.engine.tick();
    expect(h.transport.publish).toHaveBeenCalledTimes(2);
  });

  it('switches to low accuracy after standing still, and back to high on the next move', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(STATIONARY_AFTER_MS);
    await h.engine.tick();
    expect(h.activeWatch()).toHaveLength(1);
    expect(h.activeWatch()[0].options.highAccuracy).toBe(false);
    expect(h.engine.getSnapshot().lowPower).toBe(true);
    await h.engine.handleFix(north(BASE, 100, { at: h.now() }));
    expect(h.activeWatch()).toHaveLength(1);
    expect(h.activeWatch()[0].options.highAccuracy).toBe(true);
    expect(h.engine.getSnapshot().lowPower).toBe(false);
  });

  it('refreshes the token copy for the unload stop while standing still', async () => {
    const h = harness();
    await h.engine.begin(h.input({ expiresAt: h.now() + 60 * 60_000 }), BASE);
    const before = h.transport.primeUnloadAuth.mock.calls.length;
    h.advance(UNLOAD_AUTH_REFRESH_MS);
    await h.engine.tick();
    expect(h.transport.primeUnloadAuth.mock.calls.length).toBe(before + 1);
    await h.engine.tick();
    expect(h.transport.primeUnloadAuth.mock.calls.length).toBe(before + 1);
  });
});

describe('the contract error table', () => {
  it('maps every errorType to what the sharer does', () => {
    expect(publishOutcomeFromError(graphqlError('Throttled'))).toEqual({ kind: 'throttled' });
    expect(publishOutcomeFromError(graphqlError('LIVE_LOCATION_ENDED'))).toEqual({ kind: 'ended', reason: 'ended_elsewhere' });
    expect(publishOutcomeFromError(graphqlError('CONVERSATION_SUSPENDED'))).toEqual({ kind: 'ended', reason: 'suspended' });
    expect(publishOutcomeFromError(graphqlError('Unauthorized'))).toEqual({ kind: 'ended', reason: 'released' });
    expect(publishOutcomeFromError(graphqlError('BadRequest'))).toEqual({ kind: 'ended', reason: 'rejected' });
    expect(publishOutcomeFromError(new Error('network down'))).toEqual({ kind: 'failed' });
  });

  it('Throttled drops that update (no retry); the next move goes out', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.setPublish(async () => {
      throw graphqlError('Throttled');
    });
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.handleFix(north(BASE, 40, { at: h.now() }));
    expect(h.published).toHaveLength(2);
    h.setPublish(async () => ({}));
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.tick();
    expect(h.published).toHaveLength(2);
    await h.engine.handleFix(north(BASE, 90, { at: h.now() }));
    expect(h.published).toHaveLength(3);
    expect(h.engine.share(MATCH)).toBeDefined();
  });

  it('a transport failure retries the same position a few times, one per window', async () => {
    const h = harness();
    h.setPublish(async () => {
      throw new Error('offline');
    });
    await h.engine.begin(h.input({ expiresAt: h.now() + 60 * 60_000 }), BASE);
    for (let i = 0; i < MAX_RETRIES_PER_FIX + 2; i += 1) {
      h.advance(MIN_PUBLISH_INTERVAL_MS);
      await h.engine.tick();
    }
    expect(h.published).toHaveLength(1 + MAX_RETRIES_PER_FIX);
    expect(h.engine.share(MATCH)).toBeDefined();
  });

  it.each([
    ['LIVE_LOCATION_ENDED', 'ended_elsewhere'],
    ['CONVERSATION_SUSPENDED', 'suspended'],
    ['Unauthorized', 'released'],
    ['BadRequest', 'rejected'],
  ])('%s ends the share (%s) and stops watching', async (errorType, reason) => {
    const h = harness();
    h.setPublish(async () => {
      throw graphqlError(errorType);
    });
    await h.engine.begin(h.input(), BASE);
    expect(h.ends).toEqual([{ matchId: MATCH, sessionId: SESSION, expiresAt: expect.any(Number), reason }]);
    expect(h.engine.share(MATCH)).toBeUndefined();
    expect(h.activeWatch()).toHaveLength(0);
    expect(h.intervals.size).toBe(0);
    expect(h.pageHide.size).toBe(0);
    expect(h.subscriptions.has(MATCH)).toBe(false);
    // The server already ended it: no stop call.
    expect(h.transport.stop).not.toHaveBeenCalled();
  });

  it('a sealed update over 16 KB is never sent', async () => {
    const h = harness();
    const seal = vi.fn(async () => 'x'.repeat(MAX_LIVE_CIPHERTEXT_CHARS + 1));
    await h.engine.begin(h.input({ seal }), BASE);
    expect(h.transport.publish).not.toHaveBeenCalled();
    expect(h.ends[0]?.reason).toBe('rejected');
  });
});

describe('ending a share', () => {
  it('ends at expiresAt without publishing again', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.advance(15 * 60_000);
    await h.engine.handleFix(north(BASE, 200, { at: h.now() }));
    await h.engine.tick();
    expect(h.published).toHaveLength(1);
    expect(h.ends.map((e) => e.reason)).toEqual(['expired']);
    expect(h.activeWatch()).toHaveLength(0);
  });

  it('Stop ends it here at once and tells the server; later fixes publish nothing', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    await h.engine.stop(MATCH);
    expect(h.transport.stop).toHaveBeenCalledWith(MATCH, SESSION);
    expect(h.ends.map((e) => e.reason)).toEqual(['stopped']);
    expect(h.engine.getSnapshot().ended[SESSION]?.reason).toBe('stopped');
    h.advance(MIN_PUBLISH_INTERVAL_MS);
    await h.engine.handleFix(north(BASE, 300));
    expect(h.published).toHaveLength(1);
  });

  it('a share stopped while its publish is in flight stays stopped', async () => {
    const h = harness();
    let release: () => void = () => undefined;
    h.setPublish(() => new Promise((resolve) => (release = () => resolve({}))));
    const begun = h.engine.begin(h.input(), BASE);
    await vi.waitFor(() => expect(h.transport.publish).toHaveBeenCalledTimes(1));
    await h.engine.stop(MATCH);
    release();
    await begun;
    expect(h.engine.share(MATCH)).toBeUndefined();
    expect(h.engine.getSnapshot().shares).toEqual({});
  });

  it('can stop one of the member’s shares that this tab does not run', async () => {
    const h = harness();
    await h.engine.stopRemote(MATCH, SESSION_2);
    expect(h.transport.stop).toHaveBeenCalledWith(MATCH, SESSION_2);
    expect(h.engine.getSnapshot().ended[SESSION_2]?.reason).toBe('stopped');
  });

  it('an ended event for this share (stopped on another device) ends it; other rows do not', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    const onRow = h.subscriptions.get(MATCH)!;
    onRow({ matchId: MATCH, userId: 'peer-id', sessionId: SESSION, ended: true });
    onRow({ matchId: MATCH, userId: ME, sessionId: SESSION_2, ended: true });
    onRow({ matchId: MATCH, userId: ME, sessionId: SESSION, ended: false });
    expect(h.engine.share(MATCH)).toBeDefined();
    onRow({ matchId: MATCH, userId: ME, sessionId: SESSION, ended: true });
    expect(h.ends.map((e) => e.reason)).toEqual(['ended_elsewhere']);
  });

  it('follows State: a hook that is gone ends as released, a suspended one as suspended', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    await h.engine.begin(h.input({ matchId: 'match-2', sessionId: SESSION_2 }), BASE);
    h.engine.reconcile(null);
    h.engine.reconcile(undefined);
    expect(h.ends).toEqual([]);
    h.engine.reconcile([{ matchId: 'match-2', suspended: true }]);
    expect(h.ends.map((e) => [e.matchId, e.reason])).toEqual([
      [MATCH, 'released'],
      ['match-2', 'suspended'],
    ]);
    expect(h.transport.stop).not.toHaveBeenCalled();
  });

  it('location access revoked ends the share and stops it on the server', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.activeWatch()[0].onDenied();
    expect(h.ends.map((e) => e.reason)).toEqual(['location_denied']);
    expect(h.transport.stop).toHaveBeenCalledWith(MATCH, SESSION);
  });
});

describe('the tab owns the share', () => {
  it('pagehide sends a keepalive stop for every running share and ends them here', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    await h.engine.begin(h.input({ matchId: 'match-2', sessionId: SESSION_2 }), BASE);
    for (const fn of [...h.pageHide]) fn();
    expect(h.transport.stopOnUnload).toHaveBeenCalledWith(MATCH, SESSION);
    expect(h.transport.stopOnUnload).toHaveBeenCalledWith('match-2', SESSION_2);
    // Nothing can be awaited while the page goes away: the Amplify stop is not used.
    expect(h.transport.stop).not.toHaveBeenCalled();
    expect(h.ends.map((e) => e.reason)).toEqual(['tab_closed', 'tab_closed']);
    expect(h.pageHide.size).toBe(0);
    expect(h.activeWatch()).toHaveLength(0);
  });

  it('when the unload stop cannot even be attempted, the share is still ended here (expiry ends it on the server)', async () => {
    const h = harness();
    h.setUnloadAttempted(false);
    await h.engine.begin(h.input(), BASE);
    for (const fn of [...h.pageHide]) fn();
    expect(h.ends.map((e) => e.reason)).toEqual(['tab_closed']);
    expect(h.transport.stop).not.toHaveBeenCalled();
  });

  it('signing out ends every share through the keepalive stop, falling back to the API call', async () => {
    const h = harness();
    await h.engine.begin(h.input(), BASE);
    h.engine.endAll('signed_out');
    expect(h.transport.stopOnUnload).toHaveBeenCalledWith(MATCH, SESSION);
    expect(h.transport.stop).not.toHaveBeenCalled();
    expect(h.transport.clearUnloadAuth).toHaveBeenCalled();

    const fallback = harness();
    fallback.setUnloadAttempted(false);
    await fallback.engine.begin(fallback.input(), BASE);
    fallback.engine.endAll('signed_out');
    expect(fallback.transport.stop).toHaveBeenCalledWith(MATCH, SESSION);
    expect(fallback.ends.map((e) => e.reason)).toEqual(['signed_out']);
  });

  it('says plainly that closing the tab stops updates', () => {
    expect(TAB_BOUND_COPY).toBe("Location won't update if you close this tab.");
  });
});

describe('helpers', () => {
  it('offers 15 minutes, 1 hour and 8 hours with their telemetry values', () => {
    expect(LIVE_DURATIONS.map((d) => [d.value, d.ms])).toEqual([
      ['min_15', 15 * 60_000],
      ['hour_1', 60 * 60_000],
      ['hour_8', 8 * 60 * 60_000],
    ]);
  });

  it('makeLiveWindow starts now and caps at 8 hours', () => {
    expect(makeLiveWindow(60_000, T0)).toEqual({ startedAt: T0, expiresAt: T0 + 60_000 });
    expect(makeLiveWindow(24 * 60 * 60_000, T0).expiresAt).toBe(T0 + MAX_LIVE_SHARE_MS);
  });

  it('newLiveSessionId makes a UUID the backend accepts, with or without randomUUID', () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newLiveSessionId()).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    const noUuid = { getRandomValues: <T extends ArrayBufferView | null>(a: T) => globalThis.crypto.getRandomValues(a) };
    expect(newLiveSessionId(noUuid as unknown as Crypto)).toMatch(pattern);
  });

  it('isSignificantMove: first fix, 25 m, accuracy radius, much better accuracy', () => {
    expect(isSignificantMove(undefined, BASE)).toBe(true);
    expect(isSignificantMove(BASE, north(BASE, 24))).toBe(false);
    expect(isSignificantMove(BASE, north(BASE, 26))).toBe(true);
    expect(isSignificantMove(BASE, north(BASE, 40, { accuracyM: 50 }))).toBe(false);
    expect(isSignificantMove({ ...BASE, accuracyM: 80 }, north(BASE, 5, { accuracyM: 10 }))).toBe(true);
  });

  it('explains ends the member did not cause, and stays quiet for the ones they did', () => {
    expect(endNotice('stopped')).toBeNull();
    expect(endNotice('tab_closed')).toBeNull();
    expect(endNotice('signed_out')).toBeNull();
    expect(endNotice('expired')).toBe('Live location ended');
    expect(endNotice('suspended')).toMatch(/read only/);
  });

  it('withLocalEnds marks a share ended here as ended in the conversation state at once', () => {
    const key = liveSessionKey(ME, SESSION);
    const sessions: LiveSessions = {
      [key]: { userId: ME, sessionId: SESSION, at: T0, expiresAt: T0 + 60_000, ended: false, position: { lat: 1, lon: 2, updatedAt: T0 } },
    };
    const ended = { [SESSION]: { matchId: MATCH, sessionId: SESSION, expiresAt: T0 + 60_000, reason: 'stopped' as const } };
    const out = withLocalEnds(sessions, ended, MATCH, ME, T0 + 1_000, mergeLiveSession);
    expect(out[key].ended).toBe(true);
    expect(out[key].position).toBeUndefined();
    // Ends in another conversation do not touch this one.
    expect(withLocalEnds(sessions, ended, 'other-match', ME, T0 + 1_000, mergeLiveSession)).toBe(sessions);
  });
});
