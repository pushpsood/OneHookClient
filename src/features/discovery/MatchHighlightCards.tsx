import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Star } from 'lucide-react';
import type { MatchHighlight } from 'onehook-api-client';
import { trackUi, UiElement } from '../../lib/analytics/analytics';

/**
 * "Why we matched you": one card per reason (OneHook Intelligence, Mr. OneHook, Kundali, Bazi, ...),
 * swipeable sideways (scroll-snap) with arrows and dots. Each tradition is its own judgement; nothing
 * renders when the list is empty.
 */
export function MatchHighlightCards({ highlights }: { highlights?: MatchHighlight[] | null }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  if (!highlights || highlights.length === 0) return null;

  const go = (i: number) => {
    const next = Math.max(0, Math.min(highlights.length - 1, i));
    const el = track.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    if (next !== index) report(next);
  };
  const report = (i: number) => {
    setIndex(i);
    // Only which kind of reason was viewed; never the reason text.
    trackUi(UiElement.DISCOVER_HIGHLIGHT_SWIPE, {
      value: String(highlights[i].source).toLowerCase(),
    });
  };
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index && i >= 0 && i < highlights.length) report(i);
  };

  return (
    <section
      aria-label="Why we matched you"
      className="border-b border-border bg-ig-blue/5"
      data-testid="match-highlights"
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-[10px] uppercase tracking-[0.2em] font-black opacity-60">
          Why we matched you
        </span>
        {highlights.length > 1 && (
          <span className="text-[10px] opacity-60">
            {index + 1} / {highlights.length}
          </span>
        )}
      </div>
      <div className="relative">
        <div
          ref={track}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
        >
          {highlights.map((h, i) => (
            <article
              key={`${h.source}-${i}`}
              className="snap-start shrink-0 w-full px-4 py-3"
              aria-roledescription="slide"
              aria-label={`${h.label}: ${h.reason}`}
              data-source={h.source}
            >
              <div className="flex items-center gap-2 mb-1">
                {h.verdict === 'EXCELLENT' ? (
                  <Star className="w-3.5 h-3.5 text-amber-500" aria-hidden />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-ig-blue" aria-hidden />
                )}
                <span className="text-xs font-semibold">{h.label}</span>
                <span
                  className={`text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded ${
                    h.verdict === 'EXCELLENT'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-ig-blue/10 text-ig-blue'
                  }`}
                >
                  {h.verdict === 'EXCELLENT' ? 'Excellent match' : 'Good match'}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-text-secondary">{h.reason}</p>
            </article>
          ))}
        </div>
        {highlights.length > 1 && (
          <>
            {index > 0 && (
              <button
                type="button"
                aria-label="Previous reason"
                className="absolute left-0 top-1/2 -translate-y-1/2 p-1 opacity-60 hover:opacity-100"
                data-track-exempt="duplicate: the scroll handler emits discover.highlight_swipe"
                onClick={() => go(index - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {index < highlights.length - 1 && (
              <button
                type="button"
                aria-label="Next reason"
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 opacity-60 hover:opacity-100"
                data-track-exempt="duplicate: the scroll handler emits discover.highlight_swipe"
                onClick={() => go(index + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
      {highlights.length > 1 && (
        <div className="flex justify-center gap-1 pb-2" aria-hidden>
          {highlights.map((h, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-ig-blue' : 'w-1.5 bg-border'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
