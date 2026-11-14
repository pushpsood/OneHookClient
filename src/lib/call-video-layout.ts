/**
 * Pure layout / visibility logic for the VIDEO call surface (InCallScreen). No React and no DOM, so it
 * runs under the Node test runner:
 *
 *  - the small self-view window (picture-in-picture): its four snap corners, clamping while dragging,
 *    nearest-corner snapping on release, and the tap-vs-drag decision;
 *  - which feed is shown big and which small (swap), including mirroring;
 *  - when the controls may auto-hide, and a small timer-driven controller for show / hide / toggle.
 *
 * Swapping only changes which MediaStream each <video> element renders. It never touches the tracks,
 * the peer connection or the session, so it can never restart or renegotiate media.
 */
import type { CallSessionState, ScreenShareState } from './call-session';

// ── Small window geometry ─────────────────────────────────────────────────────────────────────────

export type PipCorner = 'top-leading' | 'top-trailing' | 'bottom-leading' | 'bottom-trailing';

export const PIP_CORNERS: readonly PipCorner[] = [
  'top-leading',
  'top-trailing',
  'bottom-leading',
  'bottom-trailing',
];

/** Where the small window starts on every call. */
export const DEFAULT_PIP_CORNER: PipCorner = 'top-trailing';
/** Small window size in CSS px (portrait, like a phone camera). */
export const PIP_WIDTH = 100;
export const PIP_HEIGHT = 150;
/** Gap between the small window and the screen edge / top strip / controls. */
export const PIP_MARGIN = 12;
/** A press that moves less than this (px, either axis) is a tap (swap), not a drag. */
export const TAP_SLOP_PX = 8;

export interface Point {
  x: number;
  y: number;
}

export interface PipLayout {
  stageWidth: number;
  stageHeight: number;
  pipWidth: number;
  pipHeight: number;
  margin: number;
  /** Space reserved at the top: the safe area plus the top strip while it is shown. */
  topInset: number;
  /** Space reserved at the bottom: the controls (+ captions) while shown, else the bottom safe area. */
  bottomInset: number;
  leftInset?: number;
  rightInset?: number;
  /** Right-to-left layout: "leading" is the right edge. */
  rtl?: boolean;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The area the small window's top-left corner may occupy. When the stage is too small for the insets
 * the bounds collapse onto the screen itself, so the window can never leave the screen.
 */
function pipBounds(layout: PipLayout): Bounds {
  const screenMaxX = Math.max(0, layout.stageWidth - layout.pipWidth);
  const screenMaxY = Math.max(0, layout.stageHeight - layout.pipHeight);
  const minX = clamp((layout.leftInset ?? 0) + layout.margin, 0, screenMaxX);
  const maxX = clamp(layout.stageWidth - (layout.rightInset ?? 0) - layout.margin - layout.pipWidth, minX, screenMaxX);
  const minY = clamp(layout.topInset + layout.margin, 0, screenMaxY);
  const maxY = clamp(layout.stageHeight - layout.bottomInset - layout.margin - layout.pipHeight, minY, screenMaxY);
  return { minX, maxX, minY, maxY };
}

/** Top-left position (stage px) of the small window when it sits in `corner`. */
export function pipCornerPosition(corner: PipCorner, layout: PipLayout): Point {
  const b = pipBounds(layout);
  const leading = corner.endsWith('-leading');
  const left = layout.rtl ? !leading : leading;
  return {
    x: left ? b.minX : b.maxX,
    y: corner.startsWith('top-') ? b.minY : b.maxY,
  };
}

/** Keep a dragged position on screen (and clear of the top strip / controls). */
export function clampPipPosition(position: Point, layout: PipLayout): Point {
  const b = pipBounds(layout);
  return { x: clamp(position.x, b.minX, b.maxX), y: clamp(position.y, b.minY, b.maxY) };
}

/** The corner whose snap position is closest to where the window was released. */
export function nearestPipCorner(position: Point, layout: PipLayout): PipCorner {
  let best: PipCorner = DEFAULT_PIP_CORNER;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const corner of PIP_CORNERS) {
    const p = pipCornerPosition(corner, layout);
    const distance = (p.x - position.x) ** 2 + (p.y - position.y) ** 2;
    if (distance < bestDistance) {
      best = corner;
      bestDistance = distance;
    }
  }
  return best;
}

/** True when a press moved so little that it is a tap (swap) rather than a drag. */
export function isTapGesture(dx: number, dy: number, slop: number = TAP_SLOP_PX): boolean {
  return Math.abs(dx) < slop && Math.abs(dy) < slop;
}

/**
 * Space to keep clear at the bottom. Bottom corners sit just above the controls while they are shown
 * and just above the bottom safe area while they are hidden. Captions stay on screen either way, so
 * they are always kept clear.
 */
export function pipBottomInset(input: {
  controlsVisible: boolean;
  controlsHeight: number;
  safeAreaBottom: number;
  captionsHeight?: number;
}): number {
  const base = input.controlsVisible ? Math.max(input.controlsHeight, input.safeAreaBottom) : input.safeAreaBottom;
  return base + (input.captionsHeight ?? 0);
}

/** Space to keep clear at the top: the safe area, plus the top strip while it is shown. */
export function pipTopInset(input: { stripVisible: boolean; stripHeight: number; safeAreaTop: number }): number {
  return input.stripVisible ? Math.max(input.stripHeight, input.safeAreaTop) : input.safeAreaTop;
}

// ── Swap: which feed is big, which is small ───────────────────────────────────────────────────────

/** Whose video fills the big area. Also the `call.video_swap` telemetry value. */
export type BigFeed = 'peer' | 'self';

export function swapBigFeed(current: BigFeed): BigFeed {
  return current === 'peer' ? 'self' : 'peer';
}

/**
 * Mirror the local preview only for a user-facing camera. Desktop webcams usually report no
 * facingMode; they face the user, so they are mirrored too.
 */
export function shouldMirrorLocal(facingMode: string | undefined | null): boolean {
  return facingMode !== 'environment';
}

export type FeedView<S> =
  | { kind: 'share'; stream: S }
  | { kind: 'video'; who: BigFeed; stream: S; mirrored: boolean }
  | { kind: 'placeholder'; who: BigFeed };

export interface FeedAssignment<S> {
  main: FeedView<S>;
  pip: FeedView<S>;
}

/**
 * Decide what the big area and the small window show. Only the stream each view renders changes on
 * a swap; mirroring follows the feed (my user-facing camera is mirrored wherever it shows, the peer
 * and a shared screen never are). While a shared screen is being viewed it owns the big area and the
 * small window shows me.
 */
export function assignFeeds<S>(input: {
  bigFeed: BigFeed;
  localStream: S | null;
  remoteStream: S | null;
  screenStream: S | null;
  /** My camera is on and the local stream carries video. */
  localVideoOn: boolean;
  /** The peer's camera track is actually receiving frames. */
  remoteVideoLive: boolean;
  localMirrored: boolean;
}): FeedAssignment<S> {
  const self: FeedView<S> =
    input.localVideoOn && input.localStream
      ? { kind: 'video', who: 'self', stream: input.localStream, mirrored: input.localMirrored }
      : { kind: 'placeholder', who: 'self' };
  const peer: FeedView<S> =
    input.remoteVideoLive && input.remoteStream
      ? { kind: 'video', who: 'peer', stream: input.remoteStream, mirrored: false }
      : { kind: 'placeholder', who: 'peer' };
  if (input.screenStream) return { main: { kind: 'share', stream: input.screenStream }, pip: self };
  return input.bigFeed === 'peer' ? { main: peer, pip: self } : { main: self, pip: peer };
}

// ── Controls auto-hide ────────────────────────────────────────────────────────────────────────────

/** Controls hide after this long without interaction. */
export const CONTROLS_AUTO_HIDE_MS = 4000;

export interface ControlsAutoHideContext {
  isVideo: boolean;
  state: CallSessionState;
  /** The peer's video is showing (receiving frames). */
  peerVideoShowing: boolean;
  screenShareState: ScreenShareState;
  /** An incoming screen-share request dialog is open. */
  screenRequestOpen: boolean;
  /** Keyboard focus (or an open caption-language menu) is inside the controls. */
  focusWithinControls: boolean;
  /** A screen reader is known to be running. Browsers cannot report this, so web passes false. */
  screenReaderActive?: boolean;
}

/**
 * Controls may auto-hide (and be tap-toggled) only on a connected video call with the peer's video
 * showing, and never while a screen share is being requested / sent / viewed, a share request is
 * open, focus or a menu is inside the controls, a screen reader is running, or the call has ended.
 * In every other state the controls are pinned visible.
 */
export function controlsMayAutoHide(ctx: ControlsAutoHideContext): boolean {
  return (
    ctx.isVideo &&
    ctx.state === 'connected' &&
    ctx.peerVideoShowing &&
    ctx.screenShareState === 'none' &&
    !ctx.screenRequestOpen &&
    !ctx.focusWithinControls &&
    !ctx.screenReaderActive
  );
}

/** Injectable timer (tests pass a fake). */
export interface ControlsTimer {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const browserControlsTimer: ControlsTimer = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Show / hide state of the call controls. While auto-hide is allowed, the controls hide after
 * {@link CONTROLS_AUTO_HIDE_MS} without activity; activity re-arms the timer; a tap toggles them.
 * When auto-hide stops being allowed the controls are shown and stay shown.
 */
export class ControlsVisibilityController {
  private visible = true;
  private allowed = false;
  private handle: unknown = null;
  private readonly timer: ControlsTimer;
  private readonly delayMs: number;
  private readonly onChange: (visible: boolean) => void;

  constructor(opts: { onChange: (visible: boolean) => void; timer?: ControlsTimer; delayMs?: number }) {
    this.onChange = opts.onChange;
    this.timer = opts.timer ?? browserControlsTimer;
    this.delayMs = opts.delayMs ?? CONTROLS_AUTO_HIDE_MS;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Feed the latest {@link controlsMayAutoHide} result. */
  setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    if (!allowed) {
      this.disarm();
      this.setVisible(true);
      return;
    }
    if (this.visible) this.arm();
  }

  /** Pointer / keyboard activity: keeps shown controls up for another full delay. */
  activity(): void {
    if (this.allowed && this.visible) this.arm();
  }

  /** Show the controls without a tap (keyboard use). */
  reveal(): void {
    this.setVisible(true);
    if (this.allowed) this.arm();
  }

  /**
   * A user tap on the big video. Returns the new state for telemetry, or null when the controls are
   * pinned (nothing toggled, nothing to track).
   */
  toggle(): 'shown' | 'hidden' | null {
    if (!this.allowed) return null;
    if (this.visible) {
      this.disarm();
      this.setVisible(false);
      return 'hidden';
    }
    this.setVisible(true);
    this.arm();
    return 'shown';
  }

  dispose(): void {
    this.disarm();
  }

  private arm(): void {
    this.disarm();
    this.handle = this.timer.set(() => {
      this.handle = null;
      if (this.allowed) this.setVisible(false);
    }, this.delayMs);
  }

  private disarm(): void {
    if (this.handle !== null) this.timer.clear(this.handle);
    this.handle = null;
  }

  private setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.onChange(visible);
  }
}
