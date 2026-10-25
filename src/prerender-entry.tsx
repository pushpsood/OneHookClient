/**
 * Build-time renderer for the static HTML body of every indexable page.
 *
 * NOT part of the browser bundle (nothing in the app imports it). vite.config.ts loads it with Vite's
 * SSR module loader after the client build, renders each page to an HTML string, and places that
 * markup inside `<div id="root">` of the page's pre-built HTML file.
 *
 * Why: the app renders in the browser, so without this every pre-built page had an empty body. Google
 * runs JavaScript, but AI-search crawlers and most link-preview bots do not, so they saw a blank page.
 * Now they read the same content a visitor sees. The browser still mounts with `createRoot` (not
 * hydration), which replaces this markup on first render, so the static HTML can never put the live
 * app into a mismatched state.
 *
 * Only signed-out, public pages are listed. Signed-in routes (/app, /onboarding, /auth/setup) are
 * noindex and depend on a session, so their body stays empty.
 */
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from './components/common/Toast';
import { Landing } from './components/Landing';
import { Messenger } from './components/messenger/Messenger';
import { Science } from './components/science/Science';
import { Pricing } from './components/legal/Pricing';
import { Careers } from './components/careers/Careers';
import { Contact } from './components/legal/Contact';
import { Privacy } from './components/legal/Privacy';
import { Terms } from './components/legal/Terms';
import { Login } from './components/auth/Login';
import { RedeemInvite } from './components/auth/RedeemInvite';
import { NotFound } from './components/common/NotFound';

/** Page component per route. `/404` is the not-found page served for unknown URLs. */
export const PRERENDER_BODY_PAGES: Record<string, ComponentType> = {
  '/': Landing,
  '/messenger': Messenger,
  '/science': Science,
  '/pricing': Pricing,
  '/careers': Careers,
  '/contact': Contact,
  '/privacy': Privacy,
  '/terms': Terms,
  '/login': Login,
  '/redeem': RedeemInvite,
  '/404': NotFound,
};

export function renderRouteBody(route: string): string {
  const Page = PRERENDER_BODY_PAGES[route];
  if (!Page) throw new Error(`[prerender] no page component registered for ${route}`);
  return renderToString(
    <MemoryRouter initialEntries={[route === '/404' ? '/page-not-found' : route]}>
      <ToastProvider>
        <Page />
      </ToastProvider>
    </MemoryRouter>
  );
}
