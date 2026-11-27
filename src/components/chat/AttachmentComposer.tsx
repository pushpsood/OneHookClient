import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { Film, ImageIcon, MapPin, Mic, Paperclip, Pause, Play, RotateCcw, Send, Square, Trash2, UserRound } from 'lucide-react';
import type { AttachmentKind } from '../../lib/chat-attachments';
import { downsampleWaveform } from '../../lib/attachment-media';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

/**
 * Composer controls for attachments: a picker (image / video / file, plus location and contact cards
 * when the conversation offers them) and a voice-note recorder.
 *
 * The voice-note affordance is feature-detected and HIDDEN where MediaRecorder or getUserMedia is
 * unavailable (older Safari, insecure contexts), rather than shown and then failing at click time — a
 * dead button is worse than an absent one.
 */

interface AttachmentComposerProps {
  disabled?: boolean;
  onPickFile: (file: File, kind: AttachmentKind) => void;
  onVoiceNote: (blob: Blob, mime: string, durationMs: number, waveform: number[]) => void;
  /** Opens the location sheet (current location or a live share). Hidden when absent. */
  onPickLocation?: () => void;
  /** Opens the contact flow. Hidden when absent. */
  onPickContact?: () => void;
}

/** MediaRecorder + microphone access are required to record; both must exist for the mic to appear. */
function voiceNotesSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function AttachmentComposer({ disabled, onPickFile, onVoiceNote, onPickLocation, onPickContact }: AttachmentComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pick = (ref: RefObject<HTMLInputElement | null>) => {
    setMenuOpen(false);
    ref.current?.click();
  };

  const handleChange =
    (kind: AttachmentKind) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input value so picking the same file twice in a row still fires a change event.
      event.target.value = '';
      if (file) onPickFile(file, kind);
    };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Add an attachment"
          {...trackProps(UiElement.CHAT_ATTACH_BUTTON)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-accent hover:opacity-60 transition-opacity disabled:opacity-30 cursor-pointer"
        >
          <Paperclip className={ICON_SECTION.composer.triggerIcon} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" data-track-exempt="backdrop: click-away that closes the attachment menu." />
            <div
              role="menu"
              className="absolute bottom-full left-0 mb-2 w-44 bg-surface-card border border-border shadow-xl z-40 py-1 rounded-xl text-text overflow-hidden"
            >
              <MenuItem icon={<ImageIcon className={ICON_SECTION.composer.menuItemIcon} />} label="Photo" onClick={() => pick(imageInputRef)} trackAttrs={trackProps(UiElement.CHAT_ATTACH_OPTION, { value: 'photo_video' })} />
              <MenuItem icon={<Film className={ICON_SECTION.composer.menuItemIcon} />} label="Video" onClick={() => pick(videoInputRef)} trackAttrs={trackProps(UiElement.CHAT_ATTACH_OPTION, { value: 'photo_video' })} />
              <MenuItem icon={<Paperclip className={ICON_SECTION.composer.menuItemIcon} />} label="File" onClick={() => pick(fileInputRef)} trackAttrs={trackProps(UiElement.CHAT_ATTACH_OPTION, { value: 'file' })} />
              {onPickLocation && (
                <MenuItem
                  icon={<MapPin className={ICON_SECTION.composer.menuItemIcon} />}
                  label="Location"
                  onClick={() => {
                    setMenuOpen(false);
                    onPickLocation();
                  }}
                  trackAttrs={trackProps(UiElement.CHAT_ATTACH_OPTION, { value: 'location' })}
                />
              )}
              {onPickContact && (
                <MenuItem
                  icon={<UserRound className={ICON_SECTION.composer.menuItemIcon} />}
                  label="Contact"
                  onClick={() => {
                    setMenuOpen(false);
                    // Called inside the click: the browser only opens its contact picker on a gesture.
                    onPickContact();
                  }}
                  trackAttrs={trackProps(UiElement.CHAT_ATTACH_OPTION, { value: 'contact' })}
                />
              )}
            </div>
          </>
        )}
      </div>

      {voiceNotesSupported() && <VoiceRecorderButton disabled={disabled} onVoiceNote={onVoiceNote} />}

      {/* Hidden inputs — the accept filters are hints; the real kind is fixed by which control opened. */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange('image')} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleChange('video')} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleChange('file')} />
    </div>
  );
}

function MenuItem({ icon, label, onClick, trackAttrs }: { icon: ReactNode; label: string; onClick: () => void; trackAttrs?: Record<string, string> }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      {...trackAttrs}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-hover transition-colors text-text cursor-pointer"
    >
      {icon}
      {label}
    </button>
  );
}

/** Chooses the best-supported Opus/WebM container, falling back to the browser default. */
function pickAudioMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function VoiceRecorderButton({
  disabled,
  onVoiceNote,
}: {
  disabled?: boolean;
  onVoiceNote: (blob: Blob, mime: string, durationMs: number, waveform: number[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [preview, setPreview] = useState<{
    blob: Blob;
    mime: string;
    durationMs: number;
    waveform: number[];
    url: string;
  } | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewPositionMs, setPreviewPositionMs] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const samplesRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    // Closing the AudioContext releases the mic-analysis graph; a leaked context keeps the tab's
    // audio hardware active and eventually exhausts the browser's context budget.
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);

  const start = async () => {
    setPreview(null);
    setPreviewPlaying(false);
    setPreviewPositionMs(0);
    cancelledRef.current = false;
    chunksRef.current = [];
    samplesRef.current = [];
    setElapsedMs(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Permission denied or no device — stay silent rather than throwing; the user simply cannot
      // record, and the picker remains available.
      return;
    }
    streamRef.current = stream;

    const mimeType = pickAudioMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const blobType = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: blobType });
      teardown();
      setRecording(false);
      if (!cancelledRef.current && blob.size > 0) {
        const waveform = downsampleWaveform(samplesRef.current);
        const url = URL.createObjectURL(blob);
        setPreview({ blob, mime: blobType, durationMs, waveform, url });
      }
    };

    // Analyser taps the live signal to build the waveform buckets AND to animate the timer bar.
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioCtx();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const sample = () => {
      analyser.getByteTimeDomainData(buffer);
      // Peak deviation from the 128 midpoint, normalised to 0..1 — a compact amplitude proxy.
      let peak = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const deviation = Math.abs(buffer[i] - 128) / 128;
        if (deviation > peak) peak = deviation;
      }
      samplesRef.current.push(peak);
      setElapsedMs(Date.now() - startedAtRef.current);
      rafRef.current = requestAnimationFrame(sample);
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setRecording(true);
    rafRef.current = requestAnimationFrame(sample);
  };

  const stop = () => {
    recorderRef.current?.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  };

  const discardPreview = () => {
    previewAudioRef.current?.pause();
    setPreviewPlaying(false);
    setPreviewPositionMs(0);
    setPreview(null);
  };

  const sendPreview = () => {
    if (!preview) return;
    const current = preview;
    previewAudioRef.current?.pause();
    setPreviewPlaying(false);
    setPreviewPositionMs(0);
    setPreview(null);
    onVoiceNote(current.blob, current.mime, current.durationMs, current.waveform);
  };

  const togglePreviewPlayback = () => {
    const el = previewAudioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  if (preview) {
    const sec = Math.max(1, Math.round((previewPlaying || previewPositionMs > 0 ? previewPositionMs : preview.durationMs) / 1000));
    const fraction = preview.durationMs > 0 ? Math.min(1, previewPositionMs / preview.durationMs) : 0;
    const bars = preview.waveform.length ? preview.waveform : Array.from({ length: 24 }, () => 8);

    return (
      <div
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1"
        role="group"
        aria-label="Preview recorded voice note"
      >
        <audio
          ref={previewAudioRef}
          src={preview.url}
          preload="metadata"
          onPlay={() => setPreviewPlaying(true)}
          onPause={() => setPreviewPlaying(false)}
          onEnded={() => {
            setPreviewPlaying(false);
            setPreviewPositionMs(0);
          }}
          onTimeUpdate={(e) => setPreviewPositionMs(e.currentTarget.currentTime * 1000)}
        />
        <button
          type="button"
          onClick={discardPreview}
          aria-label="Discard recorded voice note"
          {...trackProps(UiElement.CHAT_VOICE_RECORD_CANCEL)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-red-500 cursor-pointer"
        >
          <Trash2 className={ICON_SECTION.composer.inlineActionIcon} />
        </button>
        <button
          type="button"
          onClick={togglePreviewPlayback}
          aria-label={previewPlaying ? 'Pause voice preview' : 'Play voice preview'}
          // TODO(telemetry-parity): switch to UiElement.CHAT_VOICE_PREVIEW_PLAY once enabled on web.
          data-track-exempt="disabled: pending telemetry web parity enablement for chat.voice_preview_play"
          className="w-7 h-7 rounded-full border border-accent text-accent flex items-center justify-center hover:bg-accent/10 cursor-pointer"
        >
          {previewPlaying ? (
            <Pause className={ICON_SECTION.composer.inlineActionIcon} />
          ) : (
            <Play className={ICON_SECTION.composer.inlineActionIcon} />
          )}
        </button>
        <div className="flex items-end gap-0.5 h-5 w-20" aria-hidden="true">
          {bars.slice(0, 24).map((amp, i) => (
            <span
              key={i}
              className={`w-0.5 rounded-full ${i / Math.min(24, bars.length) <= fraction ? 'bg-accent' : 'bg-border'}`}
              style={{ height: `${Math.max(15, (amp / 31) * 100)}%` }}
            />
          ))}
        </div>
        <span className="text-[10px] tabular-nums text-text-secondary">
          {Math.floor(sec / 60)}:{(sec % 60).toString().padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={() => void start()}
          aria-label="Re-record voice note"
          {...trackProps(UiElement.CHAT_VOICE_RECORD_START)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-text cursor-pointer"
        >
          <RotateCcw className={ICON_SECTION.composer.inlineActionIcon} />
        </button>
        <button
          type="button"
          onClick={sendPreview}
          aria-label="Send voice note"
          {...trackProps(UiElement.CHAT_VOICE_SEND)}
          className="w-7 h-7 rounded-full bg-accent text-bg flex items-center justify-center hover:opacity-90 cursor-pointer"
        >
          <Send className={ICON_SECTION.composer.inlineActionIcon} />
        </button>
      </div>
    );
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled}
        aria-label="Record a voice note"
        {...trackProps(UiElement.CHAT_VOICE_RECORD_START)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-accent hover:opacity-60 transition-opacity disabled:opacity-30 cursor-pointer"
      >
        <Mic className={ICON_SECTION.composer.triggerIcon} />
      </button>
    );
  }

  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Recording a voice note">
      <button
        type="button"
        onClick={cancel}
        aria-label="Discard voice note"
        {...trackProps(UiElement.CHAT_VOICE_RECORD_CANCEL)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-accent hover:opacity-60 transition-opacity cursor-pointer"
      >
        <Trash2 className={ICON_SECTION.composer.triggerIcon} />
      </button>
      <span className="flex items-center gap-1 text-[10px] tabular-nums text-red-500" aria-live="polite">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop and preview voice note"
        // TODO(telemetry-parity): switch to UiElement.CHAT_VOICE_RECORD_STOP once enabled on web.
        data-track-exempt="disabled: pending telemetry web parity enablement for chat.voice_record_stop"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-accent hover:opacity-60 transition-opacity cursor-pointer"
      >
        <Square className={`${ICON_SECTION.composer.triggerIcon} fill-current`} />
      </button>
    </div>
  );
}
