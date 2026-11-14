import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  Captions,
  CaptionsOff,
  Languages,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import type { CallMedia } from '../../api/calls';
import type { CallSessionState, ScreenShareState } from '../../lib/call-session';
import type { CaptionUiState } from '../../lib/call-captions';
import { UiElement, trackProps, trackUi, type UiElementId } from '../../lib/analytics/analytics';
import {
  ControlsVisibilityController,
  DEFAULT_PIP_CORNER,
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
  type BigFeed,
  type ControlsTimer,
  type FeedView,
  type PipCorner,
  type PipLayout,
  type Point,
} from '../../lib/call-video-layout';

/**
 * Target languages offered in the in-call caption menu (§12.5 / D12). The viewer's target defaults to
 * the device locale; this list lets them change it in-call. The on-device translation engine decides
 * whether a pair is actually available — an unsupported pick just shows the original with a note, it
 * never reaches a cloud translator. Codes are BCP-47 base subtags.
 */
const CAPTION_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ur', label: 'اردو (Urdu)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'pt', label: 'Português (Portuguese)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'ja', label: '日本語 (Japanese)' },
];

/** The base (ISO 639) subtag, lowercased, so an `en-US` target still matches the `en` menu option. */
function baseSubtag(code: string): string {
  return (code ?? '').toLowerCase().split('-')[0];
}

/**
 * Attaches a MediaStream to a <video>. Calls play() explicitly: Safari (and iOS WebKit) often leave an
 * autoplay element paused when srcObject is set after mount or a track is added later. A swap only
 * changes which stream an element shows; the tracks themselves are never touched.
 */
function VideoTile({
  stream,
  muted,
  className,
  label,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play?.()?.catch(() => undefined);
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      className={className}
    />
  );
}

/**
 * Plays the remote audio for EVERY call, audio-only or video. The remote <video> tile is muted so
 * sound never depends on whether the video tile is mounted (it falls back to the avatar until frames
 * arrive) and is never played twice.
 */
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play?.()?.catch(() => undefined);
  }, [stream]);
  return <audio ref={ref} autoPlay aria-hidden="true" className="hidden" />;
}

/**
 * True while the stream carries a remote video track that is actually receiving frames. A remote
 * track exists (muted) as soon as the answer is applied, long before media flows; showing it then is
 * what made the call look like "only my own video is visible" over a black screen.
 */
function useHasLiveVideo(stream: MediaStream | null): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!stream) {
      setLive(false);
      return;
    }
    const tracks = stream.getVideoTracks();
    const update = () =>
      setLive(tracks.some((t) => t.readyState === 'live' && !t.muted && t.enabled !== false));
    update();
    for (const t of tracks) {
      t.addEventListener?.('mute', update);
      t.addEventListener?.('unmute', update);
      t.addEventListener?.('ended', update);
    }
    return () => {
      for (const t of tracks) {
        t.removeEventListener?.('mute', update);
        t.removeEventListener?.('unmute', update);
        t.removeEventListener?.('ended', update);
      }
    };
  }, [stream]);
  return live;
}

interface Size {
  width: number;
  height: number;
}

/** Callback ref + the element's layout size (offset box, so fade/slide transforms do not affect it). */
function useMeasuredSize<T extends HTMLElement>(): [(el: T | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setSize({ width: 0, height: 0 });
      return;
    }
    const read = () =>
      setSize((prev) =>
        prev.width === el.offsetWidth && prev.height === el.offsetHeight
          ? prev
          : { width: el.offsetWidth, height: el.offsetHeight }
      );
    read();
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(read);
      observer.current.observe(el);
    }
  }, []);
  return [ref, size];
}

interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
  rtl: boolean;
}

/** Reads env(safe-area-inset-*) (and the text direction) from an invisible probe element. */
function useSafeArea(): [(el: HTMLDivElement | null) => void, SafeArea] {
  const [area, setArea] = useState<SafeArea>({ top: 0, bottom: 0, left: 0, right: 0, rtl: false });
  const detach = useRef<(() => void) | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el || typeof window === 'undefined') return;
    const read = () => {
      const style = window.getComputedStyle(el);
      const next: SafeArea = {
        top: parseFloat(style.paddingTop) || 0,
        bottom: parseFloat(style.paddingBottom) || 0,
        left: parseFloat(style.paddingLeft) || 0,
        right: parseFloat(style.paddingRight) || 0,
        rtl: style.direction === 'rtl',
      };
      setArea((prev) =>
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.left === next.left &&
        prev.right === next.right &&
        prev.rtl === next.rtl
          ? prev
          : next
      );
    };
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    detach.current = () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
    };
  }, []);
  return [ref, area];
}

/** Show / hide state of the controls, driven by {@link ControlsVisibilityController}. */
function useControlsVisibility(allowed: boolean, timer?: ControlsTimer) {
  const [visible, setVisible] = useState(true);
  const [controller] = useState(() => new ControlsVisibilityController({ onChange: setVisible, timer }));
  useEffect(() => {
    controller.setAllowed(allowed);
  }, [controller, allowed]);
  useEffect(() => () => controller.dispose(), [controller]);
  return { visible, controller };
}

/**
 * Focus inside the controls pins them visible when it is keyboard focus (`:focus-visible`) or the
 * caption-language menu. A mouse click leaves focus on the button it pressed; that must not stop the
 * controls from auto-hiding.
 */
function focusPinsControls(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.tagName === 'SELECT') return true;
  try {
    return target.matches(':focus-visible');
  } catch {
    return true;
  }
}

function stateLabel(state: CallSessionState, media: CallMedia): string {
  switch (state) {
    case 'ringing':
      return 'Ringing…';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return media === 'VIDEO' ? 'Video call connected' : 'Call connected';
    case 'ended':
      return 'Call ended';
    default:
      return 'Starting…';
  }
}

/** Fade + slight slide for the controls / top strip. Reduced motion: no animation. */
const FADE_TRANSITION =
  'motion-safe:transition motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none';

/**
 * The full-screen in-call surface. Web has no earpiece/speaker toggle (browsers route audio to the
 * default output), so there is deliberately no speaker control. The 4-emoji safety code is shown with
 * its "Compare these with your match" explanation (§8.1). The screen-share button appears only when
 * the device can capture a screen; an incoming share request is accepted or declined inline (§11.5).
 *
 * VIDEO calls: the big video is full-bleed and the controls float over it. My own camera shows in a
 * small window from the moment it starts; tapping the window swaps the two feeds, dragging it snaps
 * it to the nearest corner. Once the peer's video is showing, the controls and the top strip hide
 * after a few seconds without interaction and a tap on the video toggles them.
 */
export function InCallScreen({
  peerName,
  media,
  state,
  localStream,
  remoteStream,
  screenStream,
  sas,
  muted,
  cameraOff,
  canSendScreen,
  screenShareState,
  screenRequest,
  captions,
  captionsSupported,
  onToggleMute,
  onToggleCamera,
  onStartScreenShare,
  onStopScreenShare,
  onAcceptScreenShare,
  onDeclineScreenShare,
  onEnableCaptions,
  onDisableCaptions,
  onSelectCaptionLanguage,
  onHangup,
  controlsTimer,
}: {
  peerName: string;
  media: CallMedia;
  state: CallSessionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  sas: string[] | null;
  muted: boolean;
  cameraOff: boolean;
  canSendScreen: boolean;
  screenShareState: ScreenShareState;
  screenRequest: string | null;
  /** On-device caption / translation state (§12), or null before the control channel is open. */
  captions: CaptionUiState | null;
  /** Whether this browser can do on-device captions at all (drives the disabled toggle). */
  captionsSupported: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onAcceptScreenShare: () => void;
  onDeclineScreenShare: () => void;
  onEnableCaptions: () => void;
  onDisableCaptions: () => void;
  onSelectCaptionLanguage: (lang: string) => void;
  onHangup: () => void;
  /** Auto-hide timer; injectable for tests (defaults to setTimeout). */
  controlsTimer?: ControlsTimer;
}) {
  const isVideo = media === 'VIDEO';
  const remoteVideoLive = useHasLiveVideo(remoteStream);
  const sharing = screenShareState === 'sending';
  const viewingShare = screenShareState === 'receiving' && screenStream;
  const captionsOn = Boolean(captions?.localEnabled);
  const peerCaptioning = Boolean(captions?.peerCaptioning);
  // Captions are offered while connected (the control channel is up). The toggle is disabled with a
  // reason when on-device recognition is not usable here (§12.2) — it NEVER falls back to the cloud.
  const showCaptionControls = captionsSupported && state === 'connected';
  const captionDisabledReason = !captions
    ? 'Preparing captions…'
    : captions.localAvailable
      ? undefined
      : (captions.localNeedsInstall
          ? captions.localUnavailableReason ?? 'Download the language pack'
          : captions.localUnavailableReason ?? 'Not supported on this device');

  // ── Which feed is big, which is small (swap moves renderers only, never media) ──────────────────
  const [bigFeed, setBigFeed] = useState<BigFeed>('peer');
  const localVideoTrack = localStream?.getVideoTracks?.()[0];
  const localVideoOn = Boolean(localVideoTrack) && !cameraOff;
  // Camera off (or the stream came up without video): show the camera-off icon. Before the camera
  // has started at all the self view is an empty tile.
  const selfCameraOff = cameraOff || Boolean(localStream && !localVideoTrack);
  const localMirrored = shouldMirrorLocal(localVideoTrack?.getSettings?.().facingMode);
  const canSwap = isVideo && !viewingShare;
  const feeds = assignFeeds<MediaStream>({
    bigFeed: canSwap ? bigFeed : 'peer',
    localStream,
    remoteStream,
    screenStream: viewingShare ? screenStream : null,
    localVideoOn,
    remoteVideoLive: isVideo && remoteVideoLive,
    localMirrored,
  });

  // ── Controls visibility ───────────────────────────────────────────────────────────────────────
  const [focusPinned, setFocusPinned] = useState(false);
  const autoHideAllowed = controlsMayAutoHide({
    isVideo,
    state,
    peerVideoShowing: remoteVideoLive,
    screenShareState,
    screenRequestOpen: Boolean(screenRequest),
    focusWithinControls: focusPinned,
    // Browsers do not expose whether a screen reader is running; keyboard / screen-reader focus in
    // the controls pins them instead (focusPinned), and hidden controls stay in the a11y tree.
    screenReaderActive: false,
  });
  const { visible: controlsVisible, controller } = useControlsVisibility(autoHideAllowed, controlsTimer);
  const controlsHidden = isVideo && !controlsVisible;

  // Any pointer / keyboard activity keeps shown controls up; a key press also brings them back.
  const rootEl = useRef<HTMLDivElement | null>(null);
  const controlsEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootEl.current;
    if (!root || !isVideo) return;
    const onActivity = () => controller.activity();
    const onKey = () => controller.reveal();
    root.addEventListener('pointerdown', onActivity);
    root.addEventListener('pointermove', onActivity);
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('pointerdown', onActivity);
      root.removeEventListener('pointermove', onActivity);
      window.removeEventListener('keydown', onKey);
    };
  }, [controller, isVideo]);

  // A mouse click leaves focus on a control; drop it when the controls hide so a later Space / Enter
  // cannot press an invisible button.
  useEffect(() => {
    if (!controlsHidden) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active instanceof HTMLElement && controlsEl.current?.contains(active)) active.blur();
  }, [controlsHidden]);

  const onStageTap = () => {
    const next = controller.toggle();
    if (next) trackUi(UiElement.CALL_CONTROLS_TOGGLE, { value: next });
  };

  const onControlsFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (focusPinsControls(e.target)) setFocusPinned(true);
  };
  const onControlsBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusPinned(false);
  };

  // ── Measurements for the small window's corners ─────────────────────────────────────────────────
  const [rootSizeRef, stage] = useMeasuredSize<HTMLDivElement>();
  const [controlsSizeRef, controlsSize] = useMeasuredSize<HTMLDivElement>();
  const [stripSizeRef, stripSize] = useMeasuredSize<HTMLDivElement>();
  const [captionsSizeRef, captionsSize] = useMeasuredSize<HTMLDivElement>();
  const [safeAreaRef, safe] = useSafeArea();
  const setRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      rootEl.current = el;
      rootSizeRef(el);
    },
    [rootSizeRef]
  );
  const setControlsRef = useCallback(
    (el: HTMLDivElement | null) => {
      controlsEl.current = el;
      controlsSizeRef(el);
    },
    [controlsSizeRef]
  );

  const captionsBottom = controlsVisible ? Math.max(controlsSize.height, safe.bottom) : safe.bottom;
  const layout: PipLayout = {
    stageWidth: stage.width,
    stageHeight: stage.height,
    pipWidth: PIP_WIDTH,
    pipHeight: PIP_HEIGHT,
    margin: PIP_MARGIN,
    topInset: pipTopInset({
      stripVisible: controlsVisible && stripSize.height > 0,
      stripHeight: stripSize.height,
      safeAreaTop: safe.top,
    }),
    bottomInset: pipBottomInset({
      controlsVisible,
      controlsHeight: controlsSize.height,
      safeAreaBottom: safe.bottom,
      captionsHeight: captionsSize.height,
    }),
    leftInset: safe.left,
    rightInset: safe.right,
    rtl: safe.rtl,
  };
  const measured = stage.width > 0 && stage.height > 0;

  // ── Small window: drag to move (snaps to the nearest corner), tap to swap ──────────────────────
  const hintId = useId();
  const [corner, setCorner] = useState<PipCorner>(DEFAULT_PIP_CORNER);
  const [dragPos, setDragPos] = useState<Point | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const pipPos = dragPos ?? pipCornerPosition(corner, layout);

  const dropPosition = (d: NonNullable<typeof drag.current>, e: PointerEvent<HTMLElement>): Point =>
    clampPipPosition({ x: d.origin.x + e.clientX - d.startX, y: d.origin.y + e.clientY - d.startY }, layout);

  const onPipPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, origin: pipPos, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPipPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && isTapGesture(e.clientX - d.startX, e.clientY - d.startY)) return;
    d.moved = true;
    setDragPos(dropPosition(d, e));
  };
  const onPipPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return; // a tap: the click handler swaps
    suppressClick.current = true;
    setCorner(nearestPipCorner(dropPosition(d, e), layout));
    setDragPos(null);
  };
  const onPipPointerCancel = () => {
    drag.current = null;
    setDragPos(null);
  };
  const onPipClick = (e: MouseEvent<HTMLButtonElement>) => {
    // A drag ends with a click on the captured element; that is not a tap. Keyboard and
    // screen-reader activation (detail 0) always swap.
    if (suppressClick.current && e.detail !== 0) {
      suppressClick.current = false;
      return;
    }
    suppressClick.current = false;
    if (!canSwap) return;
    const next = swapBigFeed(bigFeed);
    setBigFeed(next);
    trackUi(UiElement.CALL_VIDEO_SWAP, { value: next });
  };

  const pipLabel = feeds.pip.kind !== 'share' && feeds.pip.who === 'peer' ? `${peerName}'s video` : 'Your video';
  const showNameInStrip = isVideo && !(feeds.main.kind === 'placeholder' && feeds.main.who === 'peer');

  const captionPanel =
    showCaptionControls && captions && (captionsOn || peerCaptioning || captions.lines.length > 0) ? (
      /*
        Live caption overlay (§12). In-memory only, dropped when the call ends (D9). Each line shows
        the translation as the main line with the original underneath, marked as on-device machine
        translation; an untranslatable pair shows the original with "Translation unavailable". No
        caption text is ever logged or sent to the backend — it only rode the E2EE control channel.
      */
      <div
        className="max-h-40 overflow-y-auto px-6 py-3 bg-black/50 text-sm space-y-1.5"
        aria-live="polite"
        aria-label="Live captions"
      >
        {captions.lines.length === 0 ? (
          <p className="text-white/50 text-xs">Listening…</p>
        ) : (
          captions.lines.slice(-6).map((line) => {
            const translated =
              line.translationState === 'done' && line.translatedText && line.translatedText !== line.text;
            return (
              <div key={`${line.source}:${line.seq}`} className="leading-snug">
                <span className="mr-2 text-[10px] uppercase tracking-wide text-white/40">
                  {line.source === 'local' ? 'You' : peerName}
                </span>
                <span className={line.final ? 'text-white' : 'text-white/70 italic'}>
                  {translated ? line.translatedText : line.text}
                </span>
                {translated && (
                  <span className="block pl-1 text-[11px] text-white/45">
                    {line.text}
                    <span className="ml-1 text-white/30">· Translated on your device · may be inaccurate</span>
                  </span>
                )}
                {line.translationState === 'unavailable' && (
                  <span className="block pl-1 text-[11px] text-white/35">Translation unavailable</span>
                )}
              </div>
            );
          })
        )}
      </div>
    ) : null;

  return (
    <div
      ref={setRootRef}
      className={`fixed inset-0 z-[100] flex flex-col overflow-hidden bg-neutral-950 text-white ${
        isVideo ? '' : 'pt-[env(safe-area-inset-top)]'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`${isVideo ? 'Video' : 'Audio'} call with ${peerName}`}
      data-controls-visible={controlsVisible ? 'true' : 'false'}
    >
      {/* Reads env(safe-area-inset-*) for the small window's corner math. */}
      <div
        ref={safeAreaRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 w-0 h-0 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      />

      <p className="sr-only" aria-live="polite">
        {stateLabel(state, media)}
      </p>

      {/* Main stage. Video calls: full-bleed under the floating controls; a tap toggles them. */}
      <div
        className={
          isVideo
            ? 'absolute inset-0 z-0 flex items-center justify-center overflow-hidden'
            : 'relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden'
        }
        onClick={onStageTap}
        data-testid="call-stage"
        data-big-feed={feeds.main.kind === 'share' ? 'share' : feeds.main.who}
        data-track-exempt="duplicate: a tap on the call video shows or hides the controls; call.controls_toggle is emitted via trackUi in the handler only when a user tap toggles them."
      >
        <MainView view={feeds.main} peerName={peerName} state={state} media={media} selfCameraOff={selfCameraOff} />
      </div>

      {/* Remote audio is always played by its own element, for audio and video calls alike. */}
      <RemoteAudio stream={remoteStream} />

      {/* Top strip: the peer's name over their video, and the safety code (SAS, MITM check). */}
      {(sas || showNameInStrip) && (
        <div
          ref={stripSizeRef}
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] ${FADE_TRANSITION} ${
            controlsHidden ? 'opacity-0 -translate-y-2 motion-reduce:translate-y-0' : 'opacity-100'
          }`}
          data-testid="call-top-strip"
        >
          {showNameInStrip && (
            <p className="max-w-full truncate text-sm font-medium text-white drop-shadow">{peerName}</p>
          )}
          {sas && (
            <div className="max-w-full bg-black/50 rounded-xl px-4 py-2 text-center">
              <div className="text-2xl tracking-widest" aria-label={`Safety code: ${sas.join(', ')}`}>
                {sas.join(' ')}
              </div>
              <p className="mt-1 text-[11px] text-white/70">Compare these with your match</p>
            </div>
          )}
        </div>
      )}

      {/* Small window (video calls only): me by default, the peer after a swap. */}
      {isVideo && (
        <button
          type="button"
          className={`absolute z-20 overflow-hidden rounded-xl border border-white/30 bg-neutral-800 shadow-lg touch-none select-none cursor-grab active:cursor-grabbing ${
            measured ? 'left-0 top-0' : 'top-[calc(env(safe-area-inset-top)+12px)] right-3'
          } ${
            dragPos
              ? ''
              : 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none'
          }`}
          style={{
            width: PIP_WIDTH,
            height: PIP_HEIGHT,
            ...(measured ? { transform: `translate3d(${pipPos.x}px, ${pipPos.y}px, 0)` } : {}),
          }}
          aria-label={pipLabel}
          aria-describedby={canSwap ? hintId : undefined}
          data-testid="call-pip"
          data-pip-corner={corner}
          data-pip-feed={feeds.pip.kind === 'share' ? 'share' : feeds.pip.who}
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp}
          onPointerCancel={onPipPointerCancel}
          onClick={onPipClick}
          data-track-exempt="continuous: dragging the small video window moves it (a pointer stream, not tracked); a tap swaps the feeds and emits call.video_swap via trackUi in onClick."
        >
          <PipView view={feeds.pip} peerName={peerName} selfCameraOff={selfCameraOff} />
          {canSwap && (
            <span id={hintId} className="sr-only">
              Double-tap to swap
            </span>
          )}
        </button>
      )}

      {/* Incoming screen-share request (§11.5: the receiver must accept each share). */}
      {screenRequest && (
        <div
          className="absolute z-40 left-1/2 -translate-x-1/2 bg-surface-card text-text rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] max-w-xs text-center"
          style={{ bottom: (controlsSize.height || 84) + 12 }}
          role="dialog"
          aria-label="Screen share request"
        >
          <p className="text-sm font-medium">{peerName} wants to share their screen.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              {...trackProps(UiElement.CALL_SCREEN_SHARE_RESPOND, { value: 'decline' })}
              onClick={onDeclineScreenShare}
              className="flex-1 h-10 rounded-lg bg-surface-hover text-text font-semibold hover:bg-surface transition-colors cursor-pointer"
            >
              Decline
            </button>
            <button
              type="button"
              {...trackProps(UiElement.CALL_SCREEN_SHARE_RESPOND, { value: 'accept' })}
              onClick={onAcceptScreenShare}
              className="flex-1 h-10 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-colors cursor-pointer"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* Captions: in flow above the controls on audio calls; floating above them on video calls
          (they stay on screen when the controls hide). */}
      {captionPanel &&
        (isVideo ? (
          <div
            ref={captionsSizeRef}
            className="absolute inset-x-0 z-10 motion-safe:transition-[bottom] motion-safe:duration-300 motion-reduce:transition-none"
            style={{ bottom: captionsBottom }}
          >
            {captionPanel}
          </div>
        ) : (
          <div className="shrink-0">{captionPanel}</div>
        ))}

      {/* Controls. Wraps onto a second row on narrow phones instead of spilling off both edges
          (a centred, non-wrapping row pushed Mute and Hang up off-screen at 360 px). On video calls
          they float translucently over the full-bleed video and fade away once it is showing; hidden
          controls take no taps (the tap reaches the video and shows them) but stay reachable by
          keyboard and screen reader (focus brings them back). */}
      <div
        ref={setControlsRef}
        onFocus={onControlsFocus}
        onBlur={onControlsBlur}
        data-testid="call-controls"
        className={
          isVideo
            ? `absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pt-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/40 backdrop-blur-md ${FADE_TRANSITION} ${
                controlsHidden ? 'opacity-0 translate-y-4 motion-reduce:translate-y-0 pointer-events-none' : 'opacity-100'
              }`
            : 'shrink-0 w-full flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 bg-black/40'
        }
      >
        <ControlButton
          onClick={onToggleMute}
          active={muted}
          label={muted ? 'Unmute microphone' : 'Mute microphone'}
          trackId={UiElement.CALL_MUTE}
          trackValue={muted ? 'off' : 'on'}
        >
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </ControlButton>

        {isVideo && (
          <ControlButton
            onClick={onToggleCamera}
            active={cameraOff}
            label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            trackId={UiElement.CALL_CAMERA}
            trackValue={cameraOff ? 'on' : 'off'}
          >
            {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </ControlButton>
        )}

        {canSendScreen && screenShareState !== 'receiving' && (
          <ControlButton
            onClick={sharing ? onStopScreenShare : onStartScreenShare}
            active={sharing}
            label={sharing ? 'Stop sharing your screen' : 'Share your screen'}
            trackId={UiElement.CALL_SCREEN_SHARE}
            trackValue={sharing ? 'off' : 'on'}
          >
            {sharing ? <MonitorX className="w-6 h-6" /> : <MonitorUp className="w-6 h-6" />}
          </ControlButton>
        )}

        {screenShareState === 'receiving' && (
          <ControlButton
            onClick={onStopScreenShare}
            active
            label="Stop viewing the shared screen"
            trackId={UiElement.CALL_SCREEN_SHARE}
            trackValue="off"
          >
            <MonitorX className="w-6 h-6" />
          </ControlButton>
        )}

        {showCaptionControls && (
          <>
            <ControlButton
              onClick={captionsOn ? onDisableCaptions : onEnableCaptions}
              active={captionsOn}
              disabled={Boolean(captionDisabledReason)}
              label={
                captionDisabledReason
                  ? `Live captions unavailable: ${captionDisabledReason}`
                  : captionsOn
                    ? 'Turn live captions off'
                    : 'Turn live captions on'
              }
              trackId={UiElement.CALL_CAPTIONS}
              trackValue={captionsOn ? 'off' : 'on'}
            >
              {captionsOn ? <Captions className="w-6 h-6" /> : <CaptionsOff className="w-6 h-6" />}
            </ControlButton>

            {/* Target-language menu (§12.5 / D12). A menu_item: the chosen language code rides as the
                telemetry targetId — never caption text. The on-device engine decides availability. */}
            <label className="relative flex items-center" title="Caption language">
              <span className="sr-only">Caption translation language</span>
              <Languages className="pointer-events-none absolute left-2 w-5 h-5 text-white/70" aria-hidden="true" />
              <select
                value={captions ? baseSubtag(captions.targetLang) : 'en'}
                onChange={(e) => {
                  trackUi(UiElement.CALL_CAPTION_LANGUAGE_SELECT, { targetId: e.target.value });
                  onSelectCaptionLanguage(e.target.value);
                }}
                aria-label="Caption translation language"
                className="h-12 sm:h-14 max-w-[9rem] sm:max-w-none truncate pl-9 pr-3 rounded-full bg-white/15 text-white text-sm outline-none cursor-pointer hover:bg-white/25 transition-colors appearance-none"
              >
                {CAPTION_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="text-neutral-900">
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <button
          type="button"
          {...trackProps(UiElement.CALL_END)}
          onClick={onHangup}
          className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
          aria-label="Hang up"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

/** The big area: the shared screen, a video (peer or me), or the peer's / my placeholder. */
function MainView({
  view,
  peerName,
  state,
  media,
  selfCameraOff,
}: {
  view: FeedView<MediaStream>;
  peerName: string;
  state: CallSessionState;
  media: CallMedia;
  selfCameraOff: boolean;
}) {
  if (view.kind === 'share') {
    return (
      <VideoTile
        stream={view.stream}
        muted
        className="w-full h-full object-contain bg-black"
        label={`${peerName}'s shared screen`}
      />
    );
  }
  if (view.kind === 'video') {
    return (
      <VideoTile
        stream={view.stream}
        muted
        className={`w-full h-full object-cover ${view.mirrored ? '-scale-x-100' : ''}`}
        label={view.who === 'self' ? 'Your video' : `${peerName}'s video`}
      />
    );
  }
  if (view.who === 'self') {
    return (
      <div className="flex flex-col items-center gap-3 px-6 text-center text-white/70">
        {selfCameraOff ? (
          <VideoOff className="w-12 h-12" aria-hidden="true" />
        ) : (
          <Video className="w-12 h-12" aria-hidden="true" />
        )}
        <p className="text-sm">{selfCameraOff ? 'Your camera is off' : 'Starting your camera…'}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 px-6 text-center">
      <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center text-4xl font-semibold">
        {peerName.charAt(0).toUpperCase()}
      </div>
      <p className="text-xl font-medium break-words max-w-full">{peerName}</p>
      <p className="text-sm text-white/60">{stateLabel(state, media)}</p>
    </div>
  );
}

/** The small window's content: a video (mirrored only for my user-facing camera), or a fallback. */
function PipView({
  view,
  peerName,
  selfCameraOff,
}: {
  view: FeedView<MediaStream>;
  peerName: string;
  selfCameraOff: boolean;
}) {
  if (view.kind === 'share' || view.kind === 'video') {
    const mirrored = view.kind === 'video' && view.mirrored;
    return (
      <VideoTile
        stream={view.stream}
        muted
        className={`pointer-events-none w-full h-full object-cover ${mirrored ? '-scale-x-100' : ''}`}
        label={view.kind === 'video' && view.who === 'peer' ? `${peerName}'s video` : 'Your video'}
      />
    );
  }
  if (view.who === 'self') {
    return (
      <span className="pointer-events-none flex w-full h-full items-center justify-center text-white/70">
        {selfCameraOff && <VideoOff className="w-8 h-8" aria-hidden="true" data-testid="pip-camera-off" />}
      </span>
    );
  }
  return (
    <span className="pointer-events-none flex w-full h-full items-center justify-center">
      <span className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-2xl font-semibold">
        {peerName.charAt(0).toUpperCase()}
      </span>
    </span>
  );
}

function ControlButton({
  onClick,
  active,
  disabled,
  label,
  trackId,
  trackValue,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  trackId: UiElementId;
  trackValue?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...trackProps(trackId, trackValue !== undefined ? { value: trackValue } : {})}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-white text-neutral-900' : 'bg-white/15 text-white hover:bg-white/25'
      }`}
    >
      {children}
    </button>
  );
}
