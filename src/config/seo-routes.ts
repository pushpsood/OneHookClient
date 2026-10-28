/**
 * Search metadata for every route that needs its own <head>. This file is the single source of
 * truth for it.
 *
 * Used twice:
 *  - at runtime by <Seo /> (src/components/common/Seo.tsx) to set the head when a page renders;
 *  - at build time by vite.config.ts, which writes a real HTML file per route (dist/<route>/index.html,
 *    plus dist/404.html) with these values in the raw <head> and the page's rendered content in the
 *    body, and generates sitemap.xml from the indexable routes. Crawlers and link previews that don't
 *    run JavaScript therefore see the right title, description, canonical URL, share image,
 *    structured data and content.
 *
 * Each route gets a distinct title and a self canonical, so no URL is ever served with the homepage
 * title. `/login` and `/redeem` are indexable entry pages; `/app`, `/onboarding` and `/auth/setup`
 * are `noindex` (an empty auth shell / deep internal steps with no public value).
 *
 * Length limits (enforced by src/tests/seo-routes.test.ts): titles ≤ 60 characters and descriptions
 * 70–160 characters, which is roughly what Google shows before truncating.
 *
 * Keep it free of secrets and of browser/React imports: vite.config.ts loads it in Node.
 */
import { APP_STORE_LINKS } from './app-store-links';

export const SITE_URL = 'https://onehook.club';

/** Every share image is 1200×630 (the size X, WhatsApp, LinkedIn and Facebook expect). */
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
export const DEFAULT_SHARE_IMAGE = '/media/og/onehook-og.png';
export const DEFAULT_SHARE_IMAGE_ALT =
  'OneHook: the intentional dating app for one real connection at a time.';

export interface RouteSeo {
  title: string;
  description: string;
  /** Optional page-specific schema.org JSON-LD. */
  jsonLd?: Record<string, unknown>;
  /**
   * Set true for signed-in / internal pages that must not be indexed. The pre-built HTML and the
   * runtime <Seo /> both emit `noindex,nofollow`, and the route is left out of sitemap.xml.
   */
  noindex?: boolean;
  /** Site-root path of a 1200×630 share image. Defaults to {@link DEFAULT_SHARE_IMAGE}. */
  image?: string;
  /** Alt text for {@link image}. Defaults to {@link DEFAULT_SHARE_IMAGE_ALT}. */
  imageAlt?: string;
}

/** Store listings that are live. Empty until the apps are published (see app-store-links.ts). */
function liveStoreLinks(): string[] {
  return [APP_STORE_LINKS.ios, APP_STORE_LINKS.android].filter((l): l is string => Boolean(l));
}

/**
 * Platforms people can actually use today: always the web, plus each store once its listing is live.
 * Structured data must describe what exists, not what is planned.
 */
function operatingSystems(): string {
  return ['Web', APP_STORE_LINKS.ios && 'iOS', APP_STORE_LINKS.android && 'Android'].filter(Boolean).join(', ');
}

/**
 * `content` for Apple's Smart App Banner (`<meta name="apple-itunes-app">`), or null while there is
 * no App Store listing. Safari on iPhone then shows an "Open / Get" banner for the app.
 */
export function smartAppBannerContent(): string | null {
  const id = APP_STORE_LINKS.ios?.match(/\/id(\d+)/)?.[1];
  return id ? `app-id=${id}` : null;
}

// Pricing is in Indian Rupees (see src/config/membership.config.ts); the free offer uses the same
// currency so the structured data is consistent with the pricing page.
const FREE_OFFER = { '@type': 'Offer', price: '0', priceCurrency: 'INR' };

/**
 * Homepage-only structured data. Organization and WebSite are site-wide and live in index.html.
 * No FAQPage markup: Google requires FAQ answers to be visible on the page, and the homepage has no
 * FAQ section.
 */
const HOME_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'OneHook',
      applicationCategory: 'SocialNetworkingApplication',
      operatingSystem: operatingSystems(),
      url: `${SITE_URL}/`,
      image: `${SITE_URL}${DEFAULT_SHARE_IMAGE}`,
      description:
        'OneHook is a private, intentional dating app. Focus on one match at a time and build a real relationship through end-to-end encrypted conversations instead of endless swiping.',
      ...(liveStoreLinks().length ? { downloadUrl: liveStoreLinks() } : {}),
      offers: FREE_OFFER,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

const MESSENGER_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'OneHook Messenger',
      applicationCategory: 'CommunicationApplication',
      operatingSystem: operatingSystems(),
      url: `${SITE_URL}/messenger`,
      image: `${SITE_URL}/media/og/onehook-og-messenger.png`,
      description:
        'A new-age, end-to-end encrypted messenger. Recover every message even if your phone breaks, continue on any screen, live translated call captions, and Mr OneHook support you control. Free forever.',
      featureList: [
        'End-to-end encrypted messages, photos, videos, voice notes and files',
        'Message history recovery after a lost or broken phone',
        'Use on phone, tablet and browser',
        'Live translated captions on calls',
        'Mr OneHook assistant that only sees what you choose to share',
      ],
      ...(liveStoreLinks().length ? { downloadUrl: liveStoreLinks() } : {}),
      offers: FREE_OFFER,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export const ROUTE_SEO: Record<string, RouteSeo> = {
  '/': {
    title: 'OneHook — Intentional Dating App for One Real Connection',
    description:
      'OneHook is a private, intentional dating app: one meaningful match at a time. No endless swiping or ghosting, just real, end-to-end encrypted conversations.',
    jsonLd: HOME_JSON_LD,
  },
  '/messenger': {
    title: 'OneHook Messenger — Encrypted Messaging, Free Forever',
    description:
      'A new-age messenger for the two of you: end-to-end encrypted, recoverable even if your phone breaks, and seamless across phone, tablet and browser.',
    jsonLd: MESSENGER_JSON_LD,
    image: '/media/og/onehook-og-messenger.png',
    imageAlt: 'OneHook Messenger: end-to-end encrypted, recoverable, free forever.',
  },
  '/science': {
    title: 'The Science of One — How OneHook Dating Works',
    description:
      'How OneHook turns attention, timing, profile meaning and what you ask for into considered introductions, while your match chats stay private.',
  },
  '/pricing': {
    title: 'OneHook Pricing — Free, Super & Infinity Dating Plans',
    description:
      'Compare OneHook memberships. Start dating free with one meaningful connection at a time, or upgrade to Super or Infinity for more ways to find a real match.',
    image: '/media/og/onehook-og-pricing.png',
    imageAlt: 'OneHook memberships: Free, Super and Infinity.',
  },
  '/careers': {
    title: 'Careers at OneHook — Build Intentional Dating',
    description:
      'Join OneHook and help build a private, intentional dating app that replaces endless swiping with one real connection at a time. See open roles and apply.',
  },
  '/contact': {
    title: 'Contact OneHook — Dating Support & Partnerships',
    description:
      'Contact the OneHook team for help with your account, privacy and security questions, press, or partnership enquiries about our intentional dating app.',
  },
  '/privacy': {
    title: 'Privacy Policy — OneHook',
    description:
      'How OneHook protects your data. Your matches and messages are end-to-end encrypted and private. Read how our intentional dating app handles your information.',
  },
  '/terms': {
    title: 'Terms of Service — OneHook',
    description:
      'The terms that govern your use of OneHook, the intentional dating app for one meaningful connection at a time.',
  },

  // ── Entry pages (indexable) ──────────────────────────────────────────────────────────────────
  // /login and /redeem render real content for signed-out visitors and are legitimate navigational
  // landing pages ("onehook login", "onehook invite"), so they are indexable with their own title.
  '/login': {
    title: 'Sign In to OneHook',
    description:
      'Sign in to OneHook to continue your one meaningful connection: your match, encrypted chats, calls and profile. An invite-only, intentional dating app.',
  },
  '/redeem': {
    title: 'Redeem Your Invite — OneHook',
    description:
      'Have a OneHook invite code? Redeem it to create your account and start one intentional, meaningful connection. OneHook is private and invite-only.',
  },

  // ── Signed-in / internal routes (noindex) ────────────────────────────────────────────────────
  // No real content for a signed-out visitor: /app is an auth-gated shell that redirects to /login,
  // and the others are post-sign-in steps. Distinct title + self canonical + noindex.
  '/app': {
    title: 'OneHook App — Sign In Required',
    description:
      'The OneHook app is a private, members-only space. Sign in or redeem an invite to open your match, end-to-end encrypted chats, calls and profile.',
    noindex: true,
  },
  '/onboarding': {
    title: 'Set Up Your Profile — OneHook',
    description:
      'Finish setting up your OneHook profile. This is a private, signed-in step, so you must be logged in to continue.',
    noindex: true,
  },
  '/auth/setup': {
    title: 'Finish Account Setup — OneHook',
    description:
      'Complete your OneHook account security setup. This is a private, signed-in step, so you must be logged in to continue.',
    noindex: true,
  },
};

/** The not-found page, served by CloudFront with a real 404 status for unknown URLs. */
export const NOT_FOUND_SEO: RouteSeo = {
  title: 'Page Not Found — OneHook',
  description:
    'This page does not exist. OneHook is an intentional dating app for one meaningful connection at a time. Go to the homepage or sign in.',
  noindex: true,
};

/**
 * Routes that get their own pre-built HTML file, excluding the homepage (which is dist/index.html
 * itself). Every route above is listed, so none falls back to another page's HTML.
 */
export const PRERENDER_ROUTES = Object.keys(ROUTE_SEO).filter((r) => r !== '/');

/** Routes listed in sitemap.xml: every route that is not noindex. */
export const SITEMAP_ROUTES = Object.keys(ROUTE_SEO).filter((r) => !ROUTE_SEO[r].noindex);
