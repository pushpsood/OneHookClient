import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  DEFAULT_SHARE_IMAGE,
  NOT_FOUND_SEO,
  PRERENDER_ROUTES,
  ROUTE_SEO,
  SITEMAP_ROUTES,
  smartAppBannerContent,
} from '../config/seo-routes';
import { APP_STORE_LINKS } from '../config/app-store-links';

/**
 * Search metadata guards. A title or description that is too long gets cut off in Google; two routes
 * sharing one is exactly the "every page shows the homepage title" problem this config exists to
 * prevent. These are pure data checks: no DOM, no network, no build.
 */
const PUBLIC_DIR = new URL('../../public', import.meta.url).pathname;
const pages = { ...ROUTE_SEO, '/404': NOT_FOUND_SEO };

/** Reads width/height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('route SEO metadata', () => {
  it('keeps every title within 60 characters and every description within 70-160', () => {
    for (const [route, seo] of Object.entries(pages)) {
      expect(seo.title.length, `${route} title`).toBeLessThanOrEqual(60);
      expect(seo.description.length, `${route} description`).toBeGreaterThanOrEqual(70);
      expect(seo.description.length, `${route} description`).toBeLessThanOrEqual(160);
    }
  });

  it('gives every route its own title and description', () => {
    const titles = Object.values(pages).map((s) => s.title);
    const descriptions = Object.values(pages).map((s) => s.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('positions the homepage as a dating app', () => {
    expect(ROUTE_SEO['/'].title).toMatch(/dating/i);
    expect(ROUTE_SEO['/'].description).toMatch(/dating/i);
  });

  it('covers every route the app defines, so none falls back to another page’s HTML', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const appRoutes = [...app.matchAll(/<Route\s+path="([^"*]+)"/g)].map((m) => m[1]);
    expect(appRoutes.length).toBeGreaterThan(5);
    for (const route of appRoutes) expect(ROUTE_SEO, route).toHaveProperty([route]);
    expect(app).toContain('<Route path="*" element={<NotFound />}');
  });

  it('lists only indexable routes in the sitemap and pre-builds every non-home route', () => {
    for (const route of SITEMAP_ROUTES) expect(ROUTE_SEO[route].noindex, route).toBeFalsy();
    for (const route of ['/app', '/onboarding', '/auth/setup']) expect(SITEMAP_ROUTES).not.toContain(route);
    expect(SITEMAP_ROUTES).toEqual(expect.arrayContaining(['/', '/login', '/redeem']));
    expect(PRERENDER_ROUTES).toEqual(Object.keys(ROUTE_SEO).filter((r) => r !== '/'));
    expect(NOT_FOUND_SEO.noindex).toBe(true);
  });

  it('points every share image at a real 1200x630 PNG', () => {
    const images = new Set([DEFAULT_SHARE_IMAGE, ...Object.values(pages).map((s) => s.image).filter(Boolean)]);
    for (const image of images) {
      const file = `${PUBLIC_DIR}${image}`;
      expect(existsSync(file), image).toBe(true);
      expect(pngSize(file), image).toEqual({ width: 1200, height: 630 });
    }
  });

  it('only describes platforms and stores that are actually live in structured data', () => {
    const app = (ROUTE_SEO['/'].jsonLd as { '@graph': Record<string, unknown>[] })['@graph'][0];
    expect(app.operatingSystem).toContain('Web');
    expect(String(app.operatingSystem).includes('iOS')).toBe(Boolean(APP_STORE_LINKS.ios));
    expect(String(app.operatingSystem).includes('Android')).toBe(Boolean(APP_STORE_LINKS.android));
    expect((app.offers as { priceCurrency: string }).priceCurrency).toBe('INR');
    // FAQ markup is only allowed when the answers are visible on the page; no page has an FAQ section.
    expect(JSON.stringify(pages)).not.toContain('FAQPage');
  });

  it('emits the Smart App Banner only once an App Store listing with a numeric id exists', () => {
    const id = APP_STORE_LINKS.ios?.match(/\/id(\d+)/)?.[1];
    expect(smartAppBannerContent()).toBe(id ? `app-id=${id}` : null);
  });
});

describe('index.html head', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('does not block pinch-zoom', () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1] ?? '';
    expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });

  it('keeps only site-wide structured data in the shared head', () => {
    expect(html).not.toContain('"FAQPage"');
    expect(html).not.toContain('"SoftwareApplication"');
    expect(html).toContain('"Organization"');
  });
});

describe('unknown URLs', () => {
  // Source-level check: synthesizing FrontendStack needs a built dist/ asset, which would make this
  // test depend on a prior build. The synthesized template is inspected during release verification.
  const stack = readFileSync(new URL('../../infra/stacks/frontend-stack.ts', import.meta.url), 'utf8');
  const errorResponses = stack.slice(stack.indexOf('errorResponses:'), stack.indexOf('priceClass:'));

  it('answer with a real 404 and the not-found page, never a 200 with the homepage', () => {
    expect(errorResponses).toContain("responsePagePath: '/404.html'");
    expect(errorResponses).not.toContain('responseHttpStatus: 200');
    expect(errorResponses).not.toContain("'/index.html'");
    expect(errorResponses.match(/responseHttpStatus: 404/g)).toHaveLength(2);
  });
});
