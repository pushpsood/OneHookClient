import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * autoplay element paused when srcObject is set after mount or a track is added later.
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

/**
 * The full-screen in-call surface. Web has no earpiece/speaker toggle (browsers route audio to the
 * default output), so there is deliberately no speaker control. The 4-emoji safety code is shown with
 * its "Compare these with your match" explanation (§8.1). The screen-share button appears only when
 * the device can capture a screen; an incoming share request is accepted or declined inline (§11.5).
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

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-neutral-950 text-white pt-[env(safe-area-inset-top)]"
      role="dialog"
      aria-modal="true"
      aria-label={`${isVideo ? 'Video' : 'Audio'} call with ${peerName}`}
    >
      <p className="sr-only" aria-live="polite">
        {stateLabel(state, media)}
      </p>

      {/* Main stage */}
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
        {viewingShare ? (
          <VideoTile
            stream={screenStream}
            muted
            className="w-full h-full object-contain bg-black"
            label={`${peerName}'s shared screen`}
          />
        ) : isVideo && remoteVideoLive ? (
          <VideoTile
            stream={remoteStream}
            muted
            className="w-full h-full object-cover"
            label={`${peerName}'s video`}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center text-4xl font-semibold">
              {peerName.charAt(0).toUpperCase()}
            </div>
            <p className="text-xl font-medium break-words max-w-full">{peerName}</p>
            <p className="text-sm text-white/60">{stateLabel(state, media)}</p>
          </div>
        )}

        {/* Remote audio is always played by its own element, for audio and video calls alike. */}
        <RemoteAudio stream={remoteStream} />

        {/* Local picture-in-picture (video calls only, when the camera is on). Mirrored like a mirror. */}
        {isVideo && !cameraOff && localStream && (
          <div className="absolute bottom-3 right-3 w-24 sm:w-28 md:w-40 aspect-[3/4] sm:aspect-video rounded-xl overflow-hidden border border-white/20 shadow-lg">
            <VideoTile
              stream={localStream}
              muted
              className="w-full h-full object-cover -scale-x-100"
              label="Your video"
            />
          </div>
        )}

        {/* Safety code (SAS) — out-of-band MITM check. */}
        {sas && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-1.5rem)] bg-black/50 rounded-xl px-4 py-2 text-center">
            <div className="text-2xl tracking-widest" aria-label={`Safety code: ${sas.join(', ')}`}>
              {sas.join(' ')}
            </div>
            <p className="mt-1 text-[11px] text-white/70">Compare these with your match</p>
          </div>
        )}

        {/* Incoming screen-share request (§11.5: the receiver must accept each share). */}
        {screenRequest && (
          <div
            className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-surface-card text-text rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] max-w-xs text-center"
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
      </div>

      {/*
        Live caption overlay (§12). In-memory only, dropped when the call ends (D9). Each line shows
        the translation as the main line with the original underneath, marked as on-device machine
        translation; an untranslatable pair shows the original with "Translation unavailable". No
        caption text is ever logged or sent to the backend — it only rode the E2EE control channel.
      */}
      {showCaptionControls && captions && (captionsOn || peerCaptioning || captions.lines.length > 0) && (
        <div
          className="shrink-0 max-h-40 overflow-y-auto px-6 py-3 bg-black/50 text-sm space-y-1.5"
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
      )}

      {/* Controls. Wraps onto a second row on narrow phones instead of spilling off both edges
          (a centred, non-wrapping row pushed Mute and Hang up off-screen at 360 px). */}
      <div className="shrink-0 w-full flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 bg-black/40">
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
