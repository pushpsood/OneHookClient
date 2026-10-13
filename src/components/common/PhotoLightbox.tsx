import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MediaImage } from './MediaImage';
import { trackMediaFullscreenOpen } from '../../lib/analytics/analytics';

export interface PhotoLightboxProps {
  /** Photo values (private `media/…` keys or URLs), in display order. */
  photos: string[];
  /** Index shown first. */
  startIndex: number;
  onClose: () => void;
  /** Accessible name for the person whose photos these are. */
  ownerName: string;
  /** Per-photo crop transforms, keyed by photo value. */
  styleFor?: (photo: string) => CSSProperties | undefined;
  /** Analytics context (e.g. 'discovery'); omit to not record full-screen opens (e.g. own profile). */
  trackContext?: string;
  viewedUserId?: string;
}

/**
 * Full-screen photo viewer. Accessible: a modal dialog with focus moved to Close and restored on
 * exit, Escape to close, ←/→ to navigate, labelled buttons, and an `aria-live` position.
 *
 * Every photo shown full screen records `media_fullscreen_open` (once per photo per opening); the
 * server counts each viewer once per photo and ignores the owner's own views.
 */
export function PhotoLightbox({ photos, startIndex, onClose, ownerName, styleFor, trackContext, viewedUserId }: PhotoLightboxProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(photos.length - 1, 0)));
  const closeRef = useRef<HTMLButtonElement>(null);
  const tracked = useRef(new Set<number>());
  const previousFocus = useRef<Element | null>(null);

  const go = useCallback((delta: number) => {
    setIndex((i) => (photos.length === 0 ? 0 : (i + delta + photos.length) % photos.length));
  }, [photos.length]);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      (previousFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  useEffect(() => {
    const photo = photos[index];
    if (!trackContext || !photo || tracked.current.has(index)) return;
    tracked.current.add(index);
    trackMediaFullscreenOpen(photo, { index, viewedUserId, context: trackContext });
  }, [index, photos, trackContext, viewedUserId]);

  if (photos.length === 0) return null;
  const photo = photos[index];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${ownerName}'s photos`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={onClose}
      data-testid="photo-lightbox"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close full-screen photo"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <X className="w-6 h-6" aria-hidden="true" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            aria-label="Previous photo"
            className="absolute left-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ChevronLeft className="w-7 h-7" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            aria-label="Next photo"
            className="absolute right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ChevronRight className="w-7 h-7" aria-hidden="true" />
          </button>
        </>
      )}

      <MediaImage
        src={photo}
        alt={`${ownerName}, photo ${index + 1} of ${photos.length}`}
        style={styleFor?.(photo)}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] object-contain select-none"
      />
      <p aria-live="polite" className="absolute bottom-4 text-white/80 text-sm">
        {index + 1} / {photos.length}
      </p>
    </div>,
    document.body
  );
}

/** Small hook: `open(i)` shows the lightbox at photo i; render `{lightbox}` once. */
export function usePhotoLightbox(props: Omit<PhotoLightboxProps, 'startIndex' | 'onClose'>) {
  const [start, setStart] = useState<number | null>(null);
  const lightbox =
    start === null ? null : <PhotoLightbox {...props} startIndex={start} onClose={() => setStart(null)} />;
  return { open: (i: number) => setStart(i), lightbox };
}
