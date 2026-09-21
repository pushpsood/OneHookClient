import { useNavigate } from 'react-router-dom';
import { Smartphone, X } from 'lucide-react';
import { BrandWordmark } from './BrandWordmark';

// The platform-aware install smart link: app.onehook.club answers with a 302 to the App Store or
// Play Store based on the visitor's device (see infra/stacks/frontend-stack.ts), so one URL works
// everywhere — including in the QR code, which is scanned by an unknown device by definition.
const APP_DOWNLOAD_URL = 'https://app.onehook.club';

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Lightweight top header used on standalone pages (login, redeem). The brand
 * mark returns to the landing page. On mobile devices an "Open in app" action
 * appears on the right so users can jump into the native app.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const mobile = isMobileDevice();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="OneHook home"
          className="hover:opacity-80 transition-opacity"
        >
          <BrandWordmark className="text-xl sm:text-2xl font-bold tracking-tighter uppercase" />
        </button>

        {mobile ? (
          <div className="flex items-center gap-3">
            {/* Mobile menu: Pricing link + Open-in-app */}
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="text-[11px] font-black uppercase tracking-[0.2em] opacity-70 hover:opacity-100 transition-opacity"
            >
              Pricing
            </button>
            <a
              href={APP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full hover:opacity-90 transition-opacity"
            >
              <Smartphone className="w-3.5 h-3.5" /> Open in app
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Desktop nav */}
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="text-xs font-black uppercase tracking-[0.2em] opacity-70 hover:opacity-100 transition-opacity"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Close and return home"
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
