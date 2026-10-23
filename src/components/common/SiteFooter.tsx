import type { ComponentType } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { BrandWordmark } from './BrandWordmark';
import { SOCIALS } from './socials';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

type SocialIcon = ComponentType<{ className?: string }>;

/** Map a social label to the catalog's landing.social_link value set. */
function socialValue(label: string): string {
  const v = label.toLowerCase();
  return ['instagram', 'facebook', 'x', 'youtube', 'linkedin', 'tiktok', 'threads'].includes(v) ? v : 'other';
}

function renderSocial({ label, href, Icon }: { label: string; href: string; Icon: SocialIcon }) {
  return (
    <a
      key={label}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`OneHook on ${label}`}
      {...trackProps(UiElement.LANDING_SOCIAL_LINK, { value: socialValue(label) })}
      className="opacity-60 hover:opacity-100 transition-opacity"
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
            <Link to="/privacy" {...trackProps(UiElement.LANDING_POLICY_LINK)} className="hover:opacity-100 transition-opacity">
              Privacy
            </Link>
            <Link to="/terms" {...trackProps(UiElement.LANDING_POLICY_LINK)} className="hover:opacity-100 transition-opacity">
              Terms
            </Link>
            <Link to="/contact" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'contact' })} className="hover:opacity-100 transition-opacity">
              Contact
            </Link>
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

        {/* two groups: explore OneHook, then the company / legal links */}
        <nav aria-label="Footer" className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 md:gap-x-8">
            <button onClick={() => goToSection('philosophy')} {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'philosophy' })} className="hover:opacity-100 transition-opacity">
              Philosophy
            </button>
            <button onClick={() => goToSection('features')} {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'how_it_works' })} className="hover:opacity-100 transition-opacity">
              How it works
            </button>
            <Link to="/science"
              {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'science' })}
              className="hover:opacity-100 transition-opacity"
            >
              Science
            </Link>
            <Link to="/messenger" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })} className="hover:opacity-100 transition-opacity">
              Messenger
            </Link>
            <Link to="/pricing" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'pricing' })} className="hover:opacity-100 transition-opacity">
              Pricing
            </Link>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 md:gap-x-8 text-[13px] opacity-80">
            <Link to="/privacy" {...trackProps(UiElement.LANDING_POLICY_LINK)} className="hover:opacity-100 transition-opacity">
              Privacy
            </Link>
            <Link to="/terms" {...trackProps(UiElement.LANDING_POLICY_LINK)} className="hover:opacity-100 transition-opacity">
              Terms
            </Link>
            <Link to="/contact" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'contact' })} className="hover:opacity-100 transition-opacity">
              Contact
            </Link>
            <Link to="/careers" {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'careers' })} className="hover:opacity-100 transition-opacity">
              Careers
            </Link>
          </div>
        </nav>

        <div className="text-center md:text-right">
          <p>
            <span className="whitespace-nowrap">© 2026 OneHook.</span>{' '}
            <span className="whitespace-nowrap">All rights reserved.</span>
          </p>
        </div>
      </div>

      {/* Its own row: "Get the app" in the centre, the social icons split evenly either side */}
      <div className="max-w-6xl mx-auto mt-10 flex items-center justify-center gap-3 sm:gap-6">
        <div className="flex flex-1 items-center justify-end gap-3 sm:gap-5">
          {SOCIALS.slice(0, Math.ceil(SOCIALS.length / 2)).map(renderSocial)}
        </div>
        <button
          onClick={() => goToSection('get-app')}
          {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 bg-accent text-white rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] hover:opacity-90 transition-opacity"
        >
          <Smartphone className="w-3.5 h-3.5" /> Get the app
        </button>
        <div className="flex flex-1 items-center justify-start gap-3 sm:gap-5">
          {SOCIALS.slice(Math.ceil(SOCIALS.length / 2)).map(renderSocial)}
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
