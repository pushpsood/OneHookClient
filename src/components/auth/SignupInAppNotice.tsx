import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Apple, ShieldCheck, Smartphone } from 'lucide-react';
import { APP_STORE_LINKS, guessPlatform } from '../../config/signup.config';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';

/**
 * Shown instead of the web registration flow, because accounts are created in the app.
 *
 * The reason is worth stating to the user rather than hiding: the first device holds the key that
 * unlocks message history, and only the apps can put that key into platform escrow (iCloud Keychain /
 * Android Block Store). An account created in a browser would have exactly one copy of that key, on a
 * platform with no escrow — so losing that browser would lose the history permanently.
 *
 * Signing IN on the web is unaffected, so this page always offers that route too.
 */
export function SignupInAppNotice() {
  const navigate = useNavigate();
  const platform = guessPlatform();

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <SiteHeader />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md bg-white border border-border p-10 space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-serif italic uppercase tracking-tighter">
              Join from the app
            </h1>
            <p className="text-xs opacity-60 leading-relaxed">
              New accounts are created in the OneHook app. Once you&rsquo;re in, you can use OneHook
              here on the web too.
            </p>
          </div>

          <div className="flex items-start gap-3 border border-border p-4 bg-bg/40">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-accent shrink-0" aria-hidden="true" />
            <p className="text-[10px] opacity-60 leading-relaxed">
              Your first device safeguards the key that unlocks your message history. The app can back
              that key up to your Apple or Google account — encrypted, so only you can use it — which a
              browser cannot do. It means replacing your phone never costs you your conversations.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={APP_STORE_LINKS.ios}
              className={`w-full py-4 text-[10px] uppercase tracking-[0.3em] font-black transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2 ${
                platform === 'android'
                  ? 'border border-border text-accent'
                  : 'bg-accent text-white'
              }`}
            >
              <Apple className="w-3.5 h-3.5" aria-hidden="true" />
              Download for iPhone
            </a>
            <a
              href={APP_STORE_LINKS.android}
              className={`w-full py-4 text-[10px] uppercase tracking-[0.3em] font-black transition-opacity hover:opacity-90 inline-flex items-center justify-center gap-2 ${
                platform === 'android'
                  ? 'bg-accent text-white'
                  : 'border border-border text-accent'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
              Download for Android
            </a>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-[10px] opacity-50 leading-relaxed">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-accent underline font-bold hover:opacity-70 transition-opacity"
              >
                Sign in here
              </button>
            </p>
          </div>
        </div>
      </motion.main>
      <SiteFooter />
    </div>
  );
}
