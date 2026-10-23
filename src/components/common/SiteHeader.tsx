import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, X } from 'lucide-react';
import { BrandWordmark } from './BrandWordmark';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

// The platform-aware install smart link: app.onehook.club answers with a 302 to the App Store or
// Play Store based on the visitor's device (see infra/stacks/frontend-stack.ts), so one URL works
// everywhere — including in the QR code, which is scanned by an unknown device by definition.
const APP_DOWNLOAD_URL = 'https://app.onehook.club';

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Lightweight top header used on standalone pages (login, redeem, legal pages). The brand
 * mark returns to the landing page. On mobile devices an "Open in app" action
 * appears on the right so users can jump into the native app.
 * 
 * @param pageTitle - Optional page title to display in the center (e.g., "Privacy", "Terms", "Pricing")
 * @param onApply - Optional callback for Apply button (e.g., on Careers page). Shows button next to close button.
 */
export function SiteHeader({ pageTitle, onApply }: { pageTitle?: string; onApply?: () => void }) {
  const navigate = useNavigate();
  const mobile = isMobileDevice();

  // While everything fits: full "logo + ONEHOOK." wordmark, title centred. If the centred title
  // would touch the wordmark or the actions on the right (e.g. "Open in app"), drop the name to the
  // logo alone and move the title to sit left-aligned next to it. Decided from hidden measuring
  // copies and the *centred* position, so moving the title never feeds back into the decision.
  const rowRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const measureTitleRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const check = () => {
      const cs = getComputedStyle(row);
      const rowBox = row.getBoundingClientRect();
      const left = rowBox.left + (parseFloat(cs.paddingLeft) || 0);
      const actionsLeft = actionsRef.current?.getBoundingClientRect().left ?? rowBox.right;
      const GAP = 16;
      const markRight = left + measure.scrollWidth;
      const titleW = measureTitleRef.current?.scrollWidth ?? 0;
      let next: boolean;
      if (titleW) {
        const centre = rowBox.left + rowBox.width / 2;
        const titleLeft = centre - titleW / 2;
        const titleRight = centre + titleW / 2;
        next = markRight + GAP > titleLeft || titleRight + GAP > actionsLeft;
      } else {
        next = markRight + GAP > actionsLeft;
      }
      setCompact((prev) => (prev === next ? prev : next));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    if (actionsRef.current) ro.observe(actionsRef.current);
    window.addEventListener('resize', check);
    document.fonts?.ready.then(check).catch(() => undefined);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [pageTitle]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md">
      <div ref={rowRef} className="relative max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* invisible measuring copy of the full wordmark (same classes) */}
        <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 w-max">
          <BrandWordmark className="text-xl sm:text-2xl font-bold tracking-tighter uppercase whitespace-nowrap" />
        </div>
        {pageTitle && (
          <div ref={measureTitleRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 w-max whitespace-nowrap text-xs sm:text-sm font-black uppercase tracking-[0.2em]">
            {pageTitle}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="OneHook home"
            {...trackProps(UiElement.LANDING_HOME_LINK)}
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <BrandWordmark
              className="text-xl sm:text-2xl font-bold tracking-tighter uppercase whitespace-nowrap"
              textClassName={compact ? 'sr-only' : ''}
            />
          </button>
          {/* compact: the title sits left-aligned beside the logo */}
          {pageTitle && compact && (
            <div className="min-w-0 truncate text-xs sm:text-sm font-black uppercase tracking-[0.2em] opacity-70">{pageTitle}</div>
          )}
        </div>

        {/* Optional page title in center (while there's room) */}
        {pageTitle && !compact && (
          <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs sm:text-sm font-black uppercase tracking-[0.2em] opacity-70">
            {pageTitle}
          </div>
        )}

        {mobile ? (
          <div ref={actionsRef} className="flex shrink-0 items-center gap-3">
            {/* Mobile menu: Open-in-app */}
            <a
              href={APP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full hover:opacity-90 transition-opacity"
            >
              <Smartphone className="w-3.5 h-3.5" /> Open in app
            </a>
          </div>
        ) : (
          <div ref={actionsRef} className="flex shrink-0 items-center gap-4">
            {/* Desktop nav */}
            {onApply && (
              <button
                type="button"
                onClick={onApply}
                {...trackProps(UiElement.LANDING_CAREERS_APPLY)}
                className="text-[10px] font-black uppercase tracking-[0.25em] px-4 py-2 bg-accent text-white rounded-full hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Close and return home"
              {...trackProps(UiElement.LANDING_HOME_LINK)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border opacity-60 hover:opacity-100 hover:bg-black/5 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
