import type { ComponentType } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { BrandWordmark } from './BrandWordmark';
import { SOCIALS } from './socials';

type SocialIcon = ComponentType<{ className?: string }>;

function renderSocial({ label, href, Icon }: { label: string; href: string; Icon: SocialIcon }) {
  return (
    <a
      key={label}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`OneHook on ${label}`}
      className="hover:opacity-100 transition-opacity"
    >
      <Icon className="w-[18px] h-[18px]" />
    </a>
  );
}

/**
 * Shared site footer used on the landing page and the legal pages (Privacy,
 * Terms, Contact). Section links (Philosophy / How it works / Get the app)
 * scroll in-page when already on the landing page, otherwise they navigate to
 * the landing page with a hash so it can scroll to the right section.
 */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  const goToSection = (id: string) => {
    if (location.pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(`/#${id}`);
    }
  };

  // Compact footer (auth pages): just legal links + copyright, no Made-in-India strip.
  if (compact) {
    return (
      <footer className="sticky bottom-0 z-40 py-6 px-6 border-t border-border bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] opacity-50">
          <p>© 2026 OneHook. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/privacy')} className="hover:opacity-100 transition-opacity">
              Privacy
            </button>
            <button onClick={() => navigate('/terms')} className="hover:opacity-100 transition-opacity">
              Terms
            </button>
            <button onClick={() => navigate('/contact')} className="hover:opacity-100 transition-opacity">
              Contact
            </button>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="py-12 px-6 bg-white border-t border-border">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-sm opacity-60">
        <div className="text-center md:text-left">
          <BrandWordmark className="font-bold uppercase tracking-widest mb-2 text-sm" />
          <p>
            <span className="whitespace-nowrap">One connection.</span>{' '}
            <span className="whitespace-nowrap">Zero distractions.</span>
          </p>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-6 md:gap-8">
          <button onClick={() => goToSection('philosophy')} className="hover:opacity-100 transition-opacity">
            Philosophy
          </button>
          <button onClick={() => goToSection('features')} className="hover:opacity-100 transition-opacity">
            How it works
          </button>
          <button onClick={() => navigate('/privacy')} className="hover:opacity-100 transition-opacity">
            Privacy
          </button>
          <button onClick={() => navigate('/terms')} className="hover:opacity-100 transition-opacity">
            Terms
          </button>
          <button onClick={() => navigate('/contact')} className="hover:opacity-100 transition-opacity">
            Contact
          </button>
          <button onClick={() => navigate('/careers')} className="hover:opacity-100 transition-opacity">
            Careers
          </button>

          {/* Socials (4) + highlighted app-flow CTA + socials (4) */}
          <div className="w-full md:w-auto flex flex-col md:flex-row items-center justify-center gap-4 md:gap-5">
            {/* All 8 social icons in one row on mobile */}
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-5">
              {SOCIALS.map(renderSocial)}
            </div>

            {/* Get the app button - separate line on mobile, inline on desktop */}
            <button
              onClick={() => goToSection('get-app')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] opacity-100 hover:opacity-90 transition-opacity md:order-first"
            >
              <Smartphone className="w-3.5 h-3.5" /> Get the app
            </button>
          </div>
        </div>

        <div className="text-center md:text-right">
          <p>
            <span className="whitespace-nowrap">© 2026 OneHook.</span>{' '}
            <span className="whitespace-nowrap">All rights reserved.</span>
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-10 pt-8 border-t border-border flex items-center justify-center">
        <p className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-[0.3em] opacity-70">
          Made in India
          <span aria-hidden="true" className="text-sm sm:text-base leading-none">🇮🇳</span>
          for the world
        </p>
      </div>
    </footer>
  );
}
