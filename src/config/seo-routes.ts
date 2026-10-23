/**
 * Search metadata for every public page — the single source of truth.
 *
 * Used twice:
 *  - at runtime by <Seo /> (src/components/common/Seo.tsx) to set the head when a page renders;
 *  - at build time by vite.config.ts, which writes a real HTML file per route (dist/<route>/index.html)
 *    with these values baked into the raw <head>, so crawlers and link previews that don't run
 *    JavaScript still see the right title, description, canonical URL and structured data.
 *
 * Keep it free of secrets — everything here is public.
 */

export const SITE_URL = 'https://onehook.club';

export interface RouteSeo {
  title: string;
  description: string;
  /** Optional page-specific schema.org JSON-LD. */
  jsonLd?: Record<string, unknown>;
}

const MESSENGER_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'OneHook Messenger',
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'iOS, Android, Web',
      url: `${SITE_URL}/messenger`,
      description:
        'A new-age, end-to-end encrypted messenger. Recover every message even if your phone breaks, continue on any screen, live translated call captions, and Mr OneHook support you control. Free forever.',
      featureList: [
        'End-to-end encrypted messages, photos, videos, voice notes and files',
        'Message history recovery after a lost or broken phone',
        'Use on phone, tablet and browser',
        'Live translated captions on calls',
        'Mr OneHook assistant that only sees what you choose to share',
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is OneHook Messenger end-to-end encrypted?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Messages and attachments are locked on your device and can only be opened on the device of the person you are talking to — OneHook cannot read them.',
          },
        },
        {
          '@type': 'Question',
          name: 'What happens to my messages if my phone breaks or is lost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Your private key is backed up, sealed so only you can use it, in your cloud account and protected by your passkey. Sign in on a new phone and your history comes back.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is OneHook Messenger free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, messaging and all its features are free forever, with no ads. Donations are optional and never unlock features.',
          },
        },
      ],
    },
  ],
};

export const ROUTE_SEO: Record<string, RouteSeo> = {
  '/': {
    title: 'OneHook — Intentional Messaging App for One Real Connection',
    description:
      'OneHook is a private, intentional dating app for one meaningful connection at a time — no endless swiping or ghosting, just real, end-to-end encrypted conversations.',
  },
  '/messenger': {
    title: 'OneHook Messenger — The New-Age Encrypted Messenger, Free Forever',
    description:
      'A new-age messenger for the two of you: end-to-end encrypted, recoverable even if your phone breaks, and seamless across phone, tablet and browser. Free forever.',
    jsonLd: MESSENGER_JSON_LD,
  },
  '/science': {
    title: 'The Science of One — How OneHook Matching Works',
    description:
      'The science behind OneHook: how reading intent, rhythm and meaning in real conversations helps two people build one genuine connection instead of swiping endlessly.',
  },
  '/pricing': {
    title: 'OneHook Membership & Pricing — Free, Super & Infinity',
    description:
      'Compare OneHook membership tiers. Start dating free with one meaningful connection at a time, or upgrade to Super and Infinity for more ways to find a real relationship.',
  },
  '/careers': {
    title: 'Careers at OneHook — Build Intentional Dating',
    description:
      'Join OneHook and help build a private, intentional dating app that replaces endless swiping with one real connection at a time. See open roles and apply.',
  },
  '/contact': {
    title: 'Contact OneHook — Dating Support & Partnerships',
    description:
      'Get in touch with the OneHook team for help with your account, privacy and security questions, press, or partnership enquiries about our intentional dating app.',
  },
  '/privacy': {
    title: 'Privacy Policy — OneHook',
    description:
      'How OneHook protects your data. Your matches and messages are end-to-end encrypted and private — read how we handle your information on our intentional dating app.',
  },
  '/terms': {
    title: 'Terms of Service — OneHook',
    description: 'The terms that govern your use of OneHook, the intentional dating app for one meaningful connection at a time.',
  },
};

/** Public routes that get their own pre-built HTML file (everything except the homepage). */
export const PRERENDER_ROUTES = Object.keys(ROUTE_SEO).filter((r) => r !== '/');
