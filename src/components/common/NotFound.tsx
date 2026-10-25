import { Link } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { Seo } from './Seo';
import { NOT_FOUND_SEO } from '../../config/seo-routes';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

/**
 * Shown for any URL that is not a real page.
 *
 * CloudFront serves this page's pre-built HTML (dist/404.html) with a real HTTP 404 status for
 * unknown paths, so search engines drop dead links instead of indexing them as copies of the
 * homepage. Client-side navigation to an unknown route lands here too. Always noindex.
 */
export function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Seo {...NOT_FOUND_SEO} path={null} noindex />
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center space-y-6">
          <p className="text-xs font-mono opacity-40">404</p>
          <h1 className="text-4xl font-serif italic tracking-tight">This page doesn&rsquo;t exist</h1>
          <p className="text-sm opacity-60 leading-relaxed">
            The link may be old or mistyped. OneHook is an intentional dating app for one meaningful
            connection at a time. Start from the homepage, or sign in if you&rsquo;re a member.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              {...trackProps(UiElement.LANDING_HOME_LINK)}
              className="px-6 py-3 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity"
            >
              Go to homepage
            </Link>
            <Link
              to="/login"
              {...trackProps(UiElement.LANDING_LOGIN)}
              className="px-6 py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-white transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
