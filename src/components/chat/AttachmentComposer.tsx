import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { Film, ImageIcon, Mic, Paperclip, Square, Trash2 } from 'lucide-react';
import type { AttachmentKind } from '../../lib/chat-attachments';
import { downsampleWaveform } from '../../lib/attachment-media';

/**
 * Composer controls for attachments: a picker (image / video / file) and a voice-note recorder.
 *
 * The voice-note affordance is feature-detected and HIDDEN where MediaRecorder or getUserMedia is
 * unavailable (older Safari, insecure contexts), rather than shown and then failing at click time — a
 * dead button is worse than an absent one.
 */

interface AttachmentComposerProps {
  disabled?: boolean;
  onPickFile: (file: File, kind: AttachmentKind) => void;
  onVoiceNote: (blob: Blob, mime: string, durationMs: number, waveform: number[]) => void;
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

export function AttachmentComposer({ disabled, onPickFile, onVoiceNote }: AttachmentComposerProps) {
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
          className="p-2 text-accent hover:opacity-60 transition-opacity disabled:opacity-30"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div
              role="menu"
              className="absolute bottom-full left-0 mb-2 w-40 bg-white border border-border shadow-xl z-40 py-1"
            >
              <MenuItem icon={<ImageIcon className="w-4 h-4" />} label="Photo" onClick={() => pick(imageInputRef)} />
              <MenuItem icon={<Film className="w-4 h-4" />} label="Video" onClick={() => pick(videoInputRef)} />
              <MenuItem icon={<Paperclip className="w-4 h-4" />} label="File" onClick={() => pick(fileInputRef)} />
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

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg transition-colors text-accent"
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

  const start = async () => {
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
        onVoiceNote(blob, blobType, durationMs, downsampleWaveform(samplesRef.current));
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

  if (!recording) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled}
        aria-label="Record a voice note"
        className="p-2 text-accent hover:opacity-60 transition-opacity disabled:opacity-30"
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  }

  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Recording a voice note">
      <button
        type="button"
        onClick={cancel}
        aria-label="Discard voice note"
        className="p-2 text-accent hover:opacity-60 transition-opacity"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <span className="flex items-center gap-1 text-[10px] tabular-nums text-red-500" aria-live="polite">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop and send voice note"
        className="p-2 text-accent hover:opacity-60 transition-opacity"
      >
        <Square className="w-4 h-4 fill-current" />
      </button>
    </div>
  );
}
