import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { APP_STORE_LINKS, guessPlatform } from '../../config/signup.config';
import { AppleIcon, AndroidIcon } from '../common/BrandIcons';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { SOCIALS } from '../common/socials';

/**
 * Shown instead of the web registration flow, because accounts are created in the app.
 *
 * The reason is worth stating to the user rather than hiding: the first device holds the key that
 * unlocks message history, and only the apps can put that key into platform escrow (iCloud Keychain /
 * Android Block Store). An account created in a browser would have exactly one copy of that key, on a
 * platform with no escrow — so losing that browser would lose the history permanently.
 *
 * Signing IN on the web is unaffected, so this page always offers that route too.
 *
 * Layout intentionally mirrors `Login`: same header block, card, button hierarchy and footer, so
 * sign-up and sign-in read as one flow rather than two unrelated pages.
 */
export function SignupInAppNotice() {
  const navigate = useNavigate();
  const platform = guessPlatform();
  const androidFirst = platform === 'android';

  const primaryClass =
    'w-full py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-2';
  const secondaryClass =
    'w-full py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors flex items-center justify-center gap-2';

  const iosLink = (
    <a
      key="ios"
      href={APP_STORE_LINKS.ios}
      className={androidFirst ? secondaryClass : primaryClass}
    >
      <AppleIcon className="w-4 h-4" /> Download for iPhone
    </a>
  );

  const androidLink = (
    <a
      key="android"
      href={APP_STORE_LINKS.android}
      className={androidFirst ? primaryClass : secondaryClass}
    >
      <AndroidIcon className="w-4 h-4" /> Download for Android
    </a>
  );

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-12 space-y-4">
            <h1 className="text-4xl font-serif italic uppercase tracking-tighter">
              Join from the App
            </h1>
            <p className="text-sm opacity-60 italic">
              New accounts are created in the OneHook app
            </p>
          </div>

          <div className="space-y-6 bg-white border border-border p-10 shadow-sm">
            <div className="flex items-start gap-3 p-4 border border-border bg-bg/40 rounded">
              <ShieldCheck className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs opacity-60 leading-relaxed">
                Your first device safeguards the key that unlocks your message history. The app can
                back that key up to your Apple or Google account — encrypted, so only you can use it
                — which a browser cannot do. It means replacing your phone never costs you your
                conversations.
              </p>
            </div>

            {androidFirst ? [androidLink, iosLink] : [iosLink, androidLink]}

            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs opacity-30 font-mono">OR</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className={secondaryClass}
            >
              Already have an account? Sign In
            </button>
          </div>

          <div className="mt-8 space-y-4">
            <p className="text-center text-xs opacity-40 italic">
              OneHook is invite-only. New here? Reach out on any of our channels and we&rsquo;ll help
              you get started.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-5 opacity-50">
              {SOCIALS.map(({ label, href, Icon }) => (
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
              ))}
            </div>
          </div>
        </motion.div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
