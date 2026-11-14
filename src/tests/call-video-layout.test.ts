import { describe, expect, it } from 'vitest';
import {
  CONTROLS_AUTO_HIDE_MS,
  ControlsVisibilityController,
  DEFAULT_PIP_CORNER,
  PIP_CORNERS,
  PIP_HEIGHT,
  PIP_MARGIN,
  PIP_WIDTH,
  assignFeeds,
  clampPipPosition,
  controlsMayAutoHide,
  isTapGesture,
  nearestPipCorner,
  pipBottomInset,
  pipCornerPosition,
  pipTopInset,
  shouldMirrorLocal,
  swapBigFeed,
  type ControlsAutoHideContext,
  type ControlsTimer,
  type PipCorner,
  type PipLayout,
} from '../lib/call-video-layout';
import { UI_ELEMENTS, UiElement } from '../lib/analytics/generated/telemetryCatalog';

/**
 * Pure logic behind the video-call layout (InCallScreen): small-window corners and snapping at
 * several phone widths, the swap assignment (renderers only, never media), and the controls
 * auto-hide rules + timer. No DOM.
 */

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;
const STRIP_HEIGHT = 120; // safe area + name + safety code
const CONTROLS_HEIGHT = 90; // compact bar incl. bottom safe area

function layoutFor(width: number, height: number, controlsVisible: boolean, rtl = false): PipLayout {
  return {
    stageWidth: width,
    stageHeight: height,
    pipWidth: PIP_WIDTH,
    pipHeight: PIP_HEIGHT,
    margin: PIP_MARGIN,
    topInset: pipTopInset({ stripVisible: controlsVisible, stripHeight: STRIP_HEIGHT, safeAreaTop: SAFE_TOP }),
    bottomInset: pipBottomInset({
      controlsVisible,
      controlsHeight: CONTROLS_HEIGHT,
      safeAreaBottom: SAFE_BOTTOM,
    }),
    rtl,
  };
}

// iPhone SE (1st gen) / iPhone 8-ish / Pro Max-ish CSS viewports.
const VIEWPORTS: ReadonlyArray<[number, number]> = [
  [320, 568],
  [375, 667],
  [430, 932],
];

describe('small window corners', () => {
  it('defaults to top-trailing at about 100x150', () => {
    expect(DEFAULT_PIP_CORNER).toBe('top-trailing');
    expect([PIP_WIDTH, PIP_HEIGHT]).toEqual([100, 150]);
    expect(PIP_CORNERS).toHaveLength(4);
  });

  describe.each(VIEWPORTS)('at %ipx x %ipx', (width, height) => {
    it.each([true, false])('every corner stays fully on screen (controls visible: %s)', (visible) => {
      const layout = layoutFor(width, height, visible);
      for (const corner of PIP_CORNERS) {
        const p = pipCornerPosition(corner, layout);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + PIP_WIDTH).toBeLessThanOrEqual(width);
        expect(p.y + PIP_HEIGHT).toBeLessThanOrEqual(height);
      }
    });

    it('places leading on the left and trailing on the right (LTR)', () => {
      const layout = layoutFor(width, height, true);
      expect(pipCornerPosition('top-leading', layout).x).toBe(PIP_MARGIN);
      expect(pipCornerPosition('top-trailing', layout).x).toBe(width - PIP_MARGIN - PIP_WIDTH);
    });

    it('top corners sit just below the top strip, or the safe area when it is hidden', () => {
      expect(pipCornerPosition('top-trailing', layoutFor(width, height, true)).y).toBe(STRIP_HEIGHT + PIP_MARGIN);
      expect(pipCornerPosition('top-leading', layoutFor(width, height, false)).y).toBe(SAFE_TOP + PIP_MARGIN);
    });

    it('bottom corners sit just above the controls, and move down when the controls hide', () => {
      const shown = pipCornerPosition('bottom-trailing', layoutFor(width, height, true));
      const hidden = pipCornerPosition('bottom-trailing', layoutFor(width, height, false));
      // Bottom edge of the window is a margin above the top of the controls bar.
      expect(shown.y + PIP_HEIGHT).toBe(height - CONTROLS_HEIGHT - PIP_MARGIN);
      // Controls hidden: just above the bottom safe area.
      expect(hidden.y + PIP_HEIGHT).toBe(height - SAFE_BOTTOM - PIP_MARGIN);
      expect(hidden.y).toBeGreaterThan(shown.y);
      expect(hidden.x).toBe(shown.x);
    });

    it.each(PIP_CORNERS)('snaps a release near %s to that corner', (corner: PipCorner) => {
      const layout = layoutFor(width, height, true);
      const target = pipCornerPosition(corner, layout);
      const nudgedX = corner.endsWith('leading') ? target.x + 30 : target.x - 30;
      const nudgedY = corner.startsWith('top') ? target.y + 40 : target.y - 40;
      expect(nearestPipCorner({ x: nudgedX, y: nudgedY }, layout)).toBe(corner);
    });

    it('snaps by quadrant: just past the middle goes to the far side', () => {
      const layout = layoutFor(width, height, true);
      const midX = (width - PIP_WIDTH) / 2;
      const midY = (STRIP_HEIGHT + PIP_MARGIN + (height - CONTROLS_HEIGHT - PIP_MARGIN - PIP_HEIGHT)) / 2;
      expect(nearestPipCorner({ x: midX + 5, y: midY + 5 }, layout)).toBe('bottom-trailing');
      expect(nearestPipCorner({ x: midX - 5, y: midY - 5 }, layout)).toBe('top-leading');
    });

    it('a drag can never leave the screen or cover the controls', () => {
      const layout = layoutFor(width, height, true);
      const far = clampPipPosition({ x: 10_000, y: 10_000 }, layout);
      expect(far).toEqual(pipCornerPosition('bottom-trailing', layout));
      const negative = clampPipPosition({ x: -500, y: -500 }, layout);
      expect(negative).toEqual(pipCornerPosition('top-leading', layout));
    });
  });

  it('mirrors leading / trailing in RTL', () => {
    const layout = layoutFor(375, 667, true, true);
    expect(pipCornerPosition('top-leading', layout).x).toBe(375 - PIP_MARGIN - PIP_WIDTH);
    expect(pipCornerPosition('top-trailing', layout).x).toBe(PIP_MARGIN);
    expect(nearestPipCorner({ x: 0, y: 0 }, layout)).toBe('top-trailing');
  });

  it('collapses onto the screen when the stage is too short for the insets', () => {
    const layout = layoutFor(320, 260, true);
    for (const corner of PIP_CORNERS) {
      const p = pipCornerPosition(corner, layout);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + PIP_HEIGHT).toBeLessThanOrEqual(260);
    }
  });

  it('keeps captions clear of the bottom corners', () => {
    expect(pipBottomInset({ controlsVisible: true, controlsHeight: 90, safeAreaBottom: 34, captionsHeight: 60 })).toBe(150);
    expect(pipBottomInset({ controlsVisible: false, controlsHeight: 90, safeAreaBottom: 34, captionsHeight: 60 })).toBe(94);
  });

  it('a small movement is a tap (swap); a real drag is not', () => {
    expect(isTapGesture(0, 0)).toBe(true);
    expect(isTapGesture(5, -5)).toBe(true);
    expect(isTapGesture(12, 0)).toBe(false);
    expect(isTapGesture(0, -30)).toBe(false);
  });
});

describe('swap', () => {
  /** A stream that records ANY access: proves the assignment never touches media. */
  const touched: string[] = [];
  const untouchable = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, prop) => {
          touched.push(`${name}.${String(prop)}`);
          return undefined;
        },
      }
    );
  const local = untouchable('local');
  const remote = untouchable('remote');
  const share = untouchable('share');

  const base = {
    localStream: local,
    remoteStream: remote,
    screenStream: null,
    localVideoOn: true,
    remoteVideoLive: true,
    localMirrored: true,
  };

  it('toggles between peer and self (the call.video_swap value)', () => {
    expect(swapBigFeed('peer')).toBe('self');
    expect(swapBigFeed('self')).toBe('peer');
    expect(UI_ELEMENTS[UiElement.CALL_VIDEO_SWAP].values).toEqual(['peer', 'self']);
  });

  it('moves the same streams between the big area and the small window, untouched', () => {
    touched.length = 0;
    const before = assignFeeds({ ...base, bigFeed: 'peer' });
    const after = assignFeeds({ ...base, bigFeed: swapBigFeed('peer') });
    // No property of any stream (tracks, enabled, stop…) was read or changed by the swap.
    expect(touched).toEqual([]);
    // Identity, not copies: the very same MediaStream objects are re-pointed.
    expect(before.main.kind === 'video' && before.main.stream).toBe(remote);
    expect(before.pip.kind === 'video' && before.pip.stream).toBe(local);
    expect(after.main.kind === 'video' && after.main.stream).toBe(local);
    expect(after.pip.kind === 'video' && after.pip.stream).toBe(remote);
    expect(before).toEqual({
      main: { kind: 'video', who: 'peer', stream: remote, mirrored: false },
      pip: { kind: 'video', who: 'self', stream: local, mirrored: true },
    });
    expect(after).toEqual({
      main: { kind: 'video', who: 'self', stream: local, mirrored: true },
      pip: { kind: 'video', who: 'peer', stream: remote, mirrored: false },
    });
  });

  it('mirroring follows my feed; the peer is never mirrored', () => {
    const unmirrored = assignFeeds({ ...base, bigFeed: 'self', localMirrored: false });
    expect(unmirrored.main).toMatchObject({ who: 'self', mirrored: false });
    expect(shouldMirrorLocal('user')).toBe(true);
    expect(shouldMirrorLocal(undefined)).toBe(true); // desktop webcams report no facingMode
    expect(shouldMirrorLocal('environment')).toBe(false);
  });

  it('shows placeholders when a camera is off or the peer video has not arrived', () => {
    const noPeer = assignFeeds({ ...base, bigFeed: 'self', remoteVideoLive: false });
    expect(noPeer.pip).toEqual({ kind: 'placeholder', who: 'peer' });
    const camOff = assignFeeds({ ...base, bigFeed: 'peer', localVideoOn: false });
    expect(camOff.pip).toEqual({ kind: 'placeholder', who: 'self' });
    const ringing = assignFeeds({ ...base, bigFeed: 'peer', remoteStream: null, remoteVideoLive: false });
    expect(ringing).toEqual({
      main: { kind: 'placeholder', who: 'peer' },
      pip: { kind: 'video', who: 'self', stream: local, mirrored: true },
    });
  });

  it('a viewed shared screen owns the big area; the small window shows me', () => {
    const viewing = assignFeeds({ ...base, bigFeed: 'self', screenStream: share });
    expect(viewing.main).toEqual({ kind: 'share', stream: share });
    expect(viewing.pip).toMatchObject({ kind: 'video', who: 'self' });
  });
});

describe('controls auto-hide rules', () => {
  const allowed: ControlsAutoHideContext = {
    isVideo: true,
    state: 'connected',
    peerVideoShowing: true,
    screenShareState: 'none',
    screenRequestOpen: false,
    focusWithinControls: false,
    screenReaderActive: false,
  };

  it('may auto-hide on a connected video call with the peer video showing', () => {
    expect(controlsMayAutoHide(allowed)).toBe(true);
    expect(CONTROLS_AUTO_HIDE_MS).toBe(4000);
  });

  it.each<[string, Partial<ControlsAutoHideContext>]>([
    ['voice call', { isVideo: false }],
    ['idle', { state: 'idle' }],
    ['ringing', { state: 'ringing' }],
    ['connecting', { state: 'connecting' }],
    ['ended', { state: 'ended' }],
    ['peer video not showing', { peerVideoShowing: false }],
    ['screen share requested', { screenShareState: 'requesting' }],
    ['sending a screen share', { screenShareState: 'sending' }],
    ['viewing a screen share', { screenShareState: 'receiving' }],
    ['incoming share request dialog', { screenRequestOpen: true }],
    ['focus / caption menu inside the controls', { focusWithinControls: true }],
    ['screen reader running', { screenReaderActive: true }],
  ])('never auto-hides: %s', (_label, patch) => {
    expect(controlsMayAutoHide({ ...allowed, ...patch })).toBe(false);
  });
});

/** Manual timer: `advance(ms)` fires due callbacks. */
function fakeTimer() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timer: ControlsTimer = {
    set: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => {
      pending.delete(id as number);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, entry] of [...pending.entries()].sort((a, b) => a[1].at - b[1].at)) {
      if (entry.at <= now) {
        pending.delete(id);
        entry.fn();
      }
    }
  };
  return { timer, advance, pendingCount: () => pending.size };
}

describe('ControlsVisibilityController', () => {
  function setup() {
    const t = fakeTimer();
    const changes: boolean[] = [];
    const c = new ControlsVisibilityController({ timer: t.timer, onChange: (v) => changes.push(v) });
    return { ...t, c, changes };
  }

  it('starts shown and never hides while auto-hide is not allowed', () => {
    const { c, advance, pendingCount } = setup();
    c.setAllowed(false);
    advance(60_000);
    expect(c.isVisible()).toBe(true);
    expect(pendingCount()).toBe(0);
  });

  it('hides 4 s after auto-hide becomes allowed', () => {
    const { c, advance, changes } = setup();
    c.setAllowed(true);
    advance(3999);
    expect(c.isVisible()).toBe(true);
    advance(1);
    expect(c.isVisible()).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('any interaction resets the 4 s timer', () => {
    const { c, advance } = setup();
    c.setAllowed(true);
    advance(3000);
    c.activity();
    advance(3000);
    expect(c.isVisible()).toBe(true);
    advance(1000);
    expect(c.isVisible()).toBe(false);
  });

  it('a tap toggles (returning the telemetry value) and showing re-arms the timer', () => {
    const { c, advance } = setup();
    c.setAllowed(true);
    expect(c.toggle()).toBe('hidden');
    expect(c.isVisible()).toBe(false);
    expect(c.toggle()).toBe('shown');
    expect(c.isVisible()).toBe(true);
    advance(CONTROLS_AUTO_HIDE_MS);
    expect(c.isVisible()).toBe(false);
    expect(UI_ELEMENTS[UiElement.CALL_CONTROLS_TOGGLE].values).toEqual(['shown', 'hidden']);
  });

  it('a tap does nothing (and tracks nothing) while the controls are pinned', () => {
    const { c } = setup();
    c.setAllowed(false);
    expect(c.toggle()).toBeNull();
    expect(c.isVisible()).toBe(true);
  });

  it('shows the controls again, and keeps them, when auto-hide stops being allowed', () => {
    const { c, advance } = setup();
    c.setAllowed(true);
    advance(CONTROLS_AUTO_HIDE_MS);
    expect(c.isVisible()).toBe(false);
    c.setAllowed(false); // e.g. the peer video dropped, or a share request arrived
    expect(c.isVisible()).toBe(true);
    advance(60_000);
    expect(c.isVisible()).toBe(true);
  });

  it('activity while hidden does not show them; a key press does', () => {
    const { c, advance } = setup();
    c.setAllowed(true);
    advance(CONTROLS_AUTO_HIDE_MS);
    c.activity();
    expect(c.isVisible()).toBe(false);
    c.reveal();
    expect(c.isVisible()).toBe(true);
    advance(CONTROLS_AUTO_HIDE_MS);
    expect(c.isVisible()).toBe(false);
  });

  it('dispose cancels the pending hide', () => {
    const { c, advance, pendingCount } = setup();
    c.setAllowed(true);
    c.dispose();
    expect(pendingCount()).toBe(0);
    advance(CONTROLS_AUTO_HIDE_MS);
    expect(c.isVisible()).toBe(true);
  });
});
