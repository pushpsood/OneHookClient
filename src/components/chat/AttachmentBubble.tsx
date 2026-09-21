import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Eye,
  FileText,
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { AttachmentEnvelope } from '../../lib/chat-attachments';
import type { AttachmentObjectUrlCache } from '../../lib/attachment-transport';
import type { AttachmentTransferState } from '../../hooks/use-api';

/**
 * Renders one attachment message: image, video, voice note (audio) or arbitrary file.
 *
 * SAFETY — peer image/video is blurred with click-to-reveal; the local user's own media never is.
 * Web browsers expose NO on-device sensitive-content API — Apple's SensitiveContentAnalysis (which the
 * iOS client uses) has no web equivalent, and bolting on a third-party ML model would mean shipping a
 * large, privacy-hostile dependency to fake a parity the platform cannot honestly provide. So the web
 * client's mitigation is exactly what the frozen contract specifies for the ML-free case: blur every
 * inbound image/video until the recipient chooses to reveal it, and route escalation through the
 * existing report/block flow. This asymmetry with iOS is deliberate and documented, not an oversight.
 */

interface AttachmentBubbleProps {
  envelope: AttachmentEnvelope;
  matchId: string;
  /** True when the local user sent this attachment — their own media is never blurred. */
  mine: boolean;
  cache: AttachmentObjectUrlCache;
  /** Present while this attachment is still uploading/sending or has failed to send. */
  transfer?: AttachmentTransferState;
  onRetry: () => void;
  /** Opens the existing report/block flow; shown on revealed peer media. */
  onReportPeerMedia?: () => void;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ResolvedState {
  status: LoadStatus;
  url?: string;
  progress: number;
  error?: string;
}

/**
 * Resolves an envelope to a decrypted object URL through the shared cache, tracking download progress.
 * Depends on the object key (a stable string), never the envelope object identity, so a re-render of
 * the parent list does not restart an in-flight download.
 */
function useAttachmentUrl(
  cache: AttachmentObjectUrlCache,
  envelope: AttachmentEnvelope,
  matchId: string,
  autoLoad: boolean
) {
  const [state, setState] = useState<ResolvedState>(() => {
    const existing = cache.peek(envelope.objectKey);
    return existing ? { status: 'ready', url: existing, progress: 1 } : { status: 'idle', progress: 0 };
  });

  // Keep the latest envelope in a ref so `load` can stay keyed only on the object key.
  const envelopeRef = useRef(envelope);
  envelopeRef.current = envelope;

  const objectKey = envelope.objectKey;
  const load = useCallback(() => {
    setState((prev) => {
      if (prev.status === 'loading' || prev.status === 'ready') return prev;
      const cached = cache.peek(objectKey);
      if (cached) return { status: 'ready', url: cached, progress: 1 };
      cache
        .resolve(envelopeRef.current, matchId, (fraction) =>
          setState((s) => (s.status === 'loading' ? { ...s, progress: fraction } : s))
        )
        .then((url) => setState({ status: 'ready', url, progress: 1 }))
        .catch((err: unknown) =>
          setState({
            status: 'error',
            progress: 0,
            error: err instanceof Error ? err.message : 'This attachment could not be opened.',
          })
        );
      return { status: 'loading', progress: 0 };
    });
  }, [cache, objectKey, matchId]);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load]);

  return { ...state, load };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** data: URL for the inline thumbnail, or undefined when the envelope carries none. */
function thumbnailSrc(envelope: AttachmentEnvelope): string | undefined {
  return envelope.thumbnail ? `data:image/jpeg;base64,${envelope.thumbnail}` : undefined;
}

/** The accessible label for a media attachment: caption first, then filename. */
function mediaLabel(envelope: AttachmentEnvelope): string {
  return envelope.caption || envelope.name;
}

export function AttachmentBubble({
  envelope,
  matchId,
  mine,
  cache,
  transfer,
  onRetry,
  onReportPeerMedia,
}: AttachmentBubbleProps) {
  const isVisual = envelope.kind === 'image' || envelope.kind === 'video';
  const blurByDefault = !mine && isVisual;
  const [revealed, setRevealed] = useState(!blurByDefault);

  // Auto-download only what is safe to show unprompted: the local user's own media, non-visual kinds
  // (audio/file), and already-revealed peer media. Blurred peer media is NOT fetched until revealed,
  // so unsolicited content is not silently pulled onto the device.
  const autoLoad = envelope.kind !== 'file' && (mine || !blurByDefault || revealed);
  const { status, url, progress, error, load } = useAttachmentUrl(cache, envelope, matchId, autoLoad);

  if (transfer) {
    return <OutgoingOverlay envelope={envelope} transfer={transfer} onRetry={onRetry} />;
  }

  const reveal = () => {
    setRevealed(true);
    load();
  };

  return (
    <div className="space-y-2">
      {envelope.kind === 'image' && (
        <ImageAttachment
          envelope={envelope}
          url={url}
          status={status}
          progress={progress}
          error={error}
          blurred={blurByDefault && !revealed}
          onReveal={reveal}
          onRetryLoad={load}
        />
      )}
      {envelope.kind === 'video' && (
        <VideoAttachment
          envelope={envelope}
          url={url}
          status={status}
          progress={progress}
          error={error}
          blurred={blurByDefault && !revealed}
          onReveal={reveal}
          onRetryLoad={load}
        />
      )}
      {envelope.kind === 'audio' && (
        <AudioAttachment envelope={envelope} url={url} status={status} error={error} />
      )}
      {envelope.kind === 'file' && (
        <FileAttachment
          envelope={envelope}
          url={url}
          status={status}
          error={error}
          onDownload={load}
        />
      )}

      {envelope.caption && <p className="text-sm leading-relaxed">{envelope.caption}</p>}

      {/* Escalation path for revealed peer media — the same report/block flow the header exposes. */}
      {blurByDefault && revealed && onReportPeerMedia && (
        <button
          type="button"
          onClick={onReportPeerMedia}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-black opacity-60 hover:opacity-100 transition-opacity"
        >
          <Flag className="w-3 h-3" aria-hidden="true" />
          Report
        </button>
      )}
    </div>
  );
}

/** Progress/retry overlay shown while the local user's attachment is uploading, sending, or failed. */
function OutgoingOverlay({
  envelope,
  transfer,
  onRetry,
}: {
  envelope: AttachmentEnvelope;
  transfer: AttachmentTransferState;
  onRetry: () => void;
}) {
  const thumb = thumbnailSrc(envelope);
  const percent = Math.round(transfer.progress * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {thumb ? (
          <img src={thumb} alt="" aria-hidden="true" className="w-12 h-12 object-cover rounded" />
        ) : (
          <FileText className="w-8 h-8 opacity-60" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs truncate">{envelope.name}</p>
          {transfer.phase === 'uploading' && (
            <div
              className="mt-1 h-1.5 w-full bg-black/10 rounded overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Uploading ${envelope.name}`}
            >
              <div className="h-full bg-current transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          )}
          {transfer.phase === 'sending' && (
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] opacity-70">Sending…</p>
          )}
          {transfer.phase === 'failed' && (
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-red-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              Didn&rsquo;t send
            </p>
          )}
        </div>
        {transfer.phase === 'failed' && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-black underline hover:opacity-70"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-500">
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message || 'This attachment could not be opened.'}</span>
      <button type="button" onClick={onRetry} className="underline font-black hover:opacity-70">
        Retry
      </button>
    </div>
  );
}

function DownloadProgress({ progress, label }: { progress: number; label: string }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex items-center gap-2 text-xs opacity-70">
      <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      <span
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        Loading… {percent}%
      </span>
    </div>
  );
}

function ImageAttachment({
  envelope,
  url,
  status,
  progress,
  error,
  blurred,
  onReveal,
  onRetryLoad,
}: {
  envelope: AttachmentEnvelope;
  url?: string;
  status: LoadStatus;
  progress: number;
  error?: string;
  blurred: boolean;
  onReveal: () => void;
  onRetryLoad: () => void;
}) {
  const thumb = thumbnailSrc(envelope);
  const label = mediaLabel(envelope);

  if (blurred) {
    return <RevealCover envelope={envelope} onReveal={onReveal} />;
  }
  if (status === 'error') return <LoadError message={error} onRetry={onRetryLoad} />;
  if (!url) {
    return thumb ? (
      <img src={thumb} alt={label} className="max-w-[16rem] rounded blur-sm" />
    ) : (
      <DownloadProgress progress={progress} label={`Loading image ${label}`} />
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img src={url} alt={label} className="max-w-[16rem] max-h-80 rounded object-contain" />
    </a>
  );
}

function VideoAttachment({
  envelope,
  url,
  status,
  progress,
  error,
  blurred,
  onReveal,
  onRetryLoad,
}: {
  envelope: AttachmentEnvelope;
  url?: string;
  status: LoadStatus;
  progress: number;
  error?: string;
  blurred: boolean;
  onReveal: () => void;
  onRetryLoad: () => void;
}) {
  const label = mediaLabel(envelope);
  if (blurred) {
    return <RevealCover envelope={envelope} onReveal={onReveal} />;
  }
  if (status === 'error') return <LoadError message={error} onRetry={onRetryLoad} />;
  if (!url) return <DownloadProgress progress={progress} label={`Loading video ${label}`} />;
  return (
    <video
      src={url}
      poster={thumbnailSrc(envelope)}
      controls
      preload="metadata"
      aria-label={label}
      className="max-w-[18rem] max-h-80 rounded"
    />
  );
}

/** The blurred stand-in for unrevealed peer image/video — a real button, keyboard-operable. */
function RevealCover({ envelope, onReveal }: { envelope: AttachmentEnvelope; onReveal: () => void }) {
  const thumb = thumbnailSrc(envelope);
  return (
    <button
      type="button"
      onClick={onReveal}
      className="relative block w-64 h-40 rounded overflow-hidden group"
      aria-label={`Hidden ${envelope.kind}. ${envelope.caption ? `${envelope.caption}. ` : ''}Click to reveal.`}
    >
      {thumb ? (
        <img src={thumb} alt="" aria-hidden="true" className="w-full h-full object-cover blur-2xl scale-110" />
      ) : (
        <span className="absolute inset-0 bg-black/40" aria-hidden="true" />
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-white">
        <Eye className="w-6 h-6" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.2em] font-black">Tap to reveal</span>
      </span>
    </button>
  );
}

/** Voice-note / audio player: play-pause, a scrub-free progress bar, waveform and duration. */
function AudioAttachment({
  envelope,
  url,
  status,
  error,
}: {
  envelope: AttachmentEnvelope;
  url?: string;
  status: LoadStatus;
  error?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const totalMs = envelope.durationMs ?? 0;
  const playedFraction = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const waveform = useMemo(
    () => (envelope.waveform?.length ? envelope.waveform : Array.from({ length: 32 }, () => 6)),
    [envelope.waveform]
  );

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{error || 'This voice note could not be opened.'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[12rem]">
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setElapsedMs(0);
          }}
          onTimeUpdate={(e) => setElapsedMs(e.currentTarget.currentTime * 1000)}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className="w-9 h-9 shrink-0 rounded-full border border-current flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-40"
      >
        {!url ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : playing ? (
          <Pause className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
      <div className="flex items-end gap-0.5 h-8 flex-1" aria-hidden="true">
        {waveform.map((amplitude, i) => {
          const played = i / waveform.length <= playedFraction;
          const heightPct = 10 + (amplitude / 31) * 90;
          return (
            <span
              key={i}
              className={`w-1 rounded-full ${played ? 'bg-current' : 'bg-current/30'}`}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>
      <span className="text-[10px] tabular-nums opacity-70 shrink-0">
        {formatDuration(playing || elapsedMs > 0 ? elapsedMs : totalMs)}
      </span>
    </div>
  );
}

/** A file row: icon, name, size, and a download control that decrypts on demand. */
function FileAttachment({
  envelope,
  url,
  status,
  error,
  onDownload,
}: {
  envelope: AttachmentEnvelope;
  url?: string;
  status: LoadStatus;
  error?: string;
  onDownload: () => void;
}) {
  // Once decrypted, an anchor with `download` saves under the original filename. Before that, the
  // button triggers the decrypt; the effect then clicks through so it reads as a single action.
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const [pendingClick, setPendingClick] = useState(false);

  useEffect(() => {
    if (pendingClick && url && anchorRef.current) {
      anchorRef.current.click();
      setPendingClick(false);
    }
  }, [pendingClick, url]);

  return (
    <div className="flex items-center gap-3 min-w-[14rem]">
      <FileText className="w-8 h-8 shrink-0 opacity-70" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs truncate" title={envelope.name}>
          {envelope.name}
        </p>
        <p className="text-[10px] opacity-60">{formatBytes(envelope.size)}</p>
        {status === 'error' && (
          <p className="text-[10px] text-red-500">{error || 'Download failed.'}</p>
        )}
      </div>
      {url ? (
        <a
          ref={anchorRef}
          href={url}
          download={envelope.name}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-black hover:opacity-70"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Save
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            onDownload();
            setPendingClick(true);
          }}
          disabled={status === 'loading'}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-black hover:opacity-70 disabled:opacity-40"
          aria-label={`Download ${envelope.name}`}
        >
          {status === 'loading' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Download
        </button>
      )}
    </div>
  );
}
