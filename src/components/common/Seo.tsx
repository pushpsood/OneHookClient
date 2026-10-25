import { useEffect } from 'react';
import {
  DEFAULT_SHARE_IMAGE,
  DEFAULT_SHARE_IMAGE_ALT,
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
} from '../../config/seo-routes';

/**
 * Lightweight, dependency-free SEO head manager for the client-rendered marketing pages.
 *
 * OneHook is a single-page app with no SSR, so there is exactly one static `index.html` head
 * (home-page defaults, shipped in the HTML that every crawler first receives). This component
 * updates that same head *in place* on route changes — it never appends duplicate `<title>`,
 * `<meta>` or `<link rel="canonical">` tags — so a JavaScript-executing crawler (e.g. Googlebot)
 * sees a correct, unique title/description/canonical per marketing route.
 *
 * It deliberately reuses the tags already present in `index.html` (description, og:*, twitter:*)
 * and only creates the few that the static head omits (robots). Crawlers and link previews that do
 * NOT run JavaScript read the per-route HTML pre-built at deploy time (src/config/seo-routes.ts +
 * the prerender plugin in vite.config.ts), so both paths agree.
 */

export const SITE_NAME = 'OneHook';
export const SITE_URL = 'https://onehook.club';
const INDEXABLE_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex,nofollow';

export interface SeoProps {
  /** Full document title (already including the brand, e.g. "Pricing — OneHook"). */
  title: string;
  /** Meta description, ideally <=160 characters. */
  description: string;
  /** Canonical path beginning with "/", e.g. "/pricing". `null` removes the canonical (404 page). */
  path: string | null;
  /** Site-root path or absolute URL of a 1200×630 share image. Defaults to the OneHook share card. */
  image?: string;
  /** Alt text for the share image. */
  imageAlt?: string;
  /** Set true for thin/private pages that should not be indexed. */
  noindex?: boolean;
  /** Optional page-specific structured data (schema.org JSON-LD), removed again on unmount. */
  jsonLd?: Record<string, unknown>;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${CSS.escape(key)}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${CSS.escape(rel)}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function Seo({ title, description, path, image, imageAlt, noindex = false, jsonLd }: SeoProps): null {
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    // The pre-built HTML for this route may already carry this page's JSON-LD; replace it so the
    // structured data is never duplicated.
    document.head.querySelectorAll('script[data-seo="page"]').forEach((n) => n.remove());
    if (!jsonLdText) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.dataset.seo = 'page';
    el.textContent = jsonLdText;
    document.head.appendChild(el);
    return () => el.remove();
  }, [jsonLdText]);
  useEffect(() => {
    const url = path === null ? null : `${SITE_URL}${path}`;
    const imagePath = image ?? DEFAULT_SHARE_IMAGE;
    const ogImage = imagePath.startsWith('http') ? imagePath : `${SITE_URL}${imagePath}`;
    const alt = imageAlt ?? DEFAULT_SHARE_IMAGE_ALT;

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? NOINDEX_ROBOTS : INDEXABLE_ROBOTS);
    if (url) {
      upsertLink('canonical', url);
      upsertMeta('property', 'og:url', url);
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove();
    }

    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:image:secure_url', ogImage);
    upsertMeta('property', 'og:image:width', String(SHARE_IMAGE_WIDTH));
    upsertMeta('property', 'og:image:height', String(SHARE_IMAGE_HEIGHT));
    upsertMeta('property', 'og:image:alt', alt);

    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage);
    upsertMeta('name', 'twitter:image:alt', alt);
  }, [title, description, path, image, imageAlt, noindex]);

  return null;
}
