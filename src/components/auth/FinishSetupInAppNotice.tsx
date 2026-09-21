import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, RefreshCw, Loader } from 'lucide-react';
import { APP_STORE_LINKS, guessPlatform } from '../../config/signup.config';
import { AppleIcon, AndroidIcon } from '../common/BrandIcons';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { describeMissingPrerequisites, type MissingPrerequisite } from '../../lib/registration-prerequisites';

interface Props {
  /** Which app-only guarantees are absent; drives the explanation. */
  missing: MissingPrerequisite[];
  /** Re-checks the account, for someone who has just finished in the app. */
  onRetry: () => void;
  retrying?: boolean;
  /** Set when the check itself failed rather than genuinely finding a gap. */
  checkFailed?: boolean;
}

/**
 * Shown instead of the web onboarding wizard when the account has not got the protections that native
 * sign-up is responsible for creating.
 *
 * Why block here at all: completing onboarding on the web for an account with no escrowed copy of its
 * history key would leave that account with a single holder on a platform that has no escrow — the
 * exact single point of failure the app-only sign-up rule exists to remove. Nothing would appear
 * broken until the device was lost, and by then the history would be unrecoverable.
 *
 * Deliberately not a dead end: the reason is stated plainly, both stores are offered, and re-checking
 * is one tap for someone who has just finished in the app.
 */
export function FinishSetupInAppNotice({ missing, onRetry, retrying = false, checkFailed = false }: Props) {
  const navigate = useNavigate();
  const platform = guessPlatform();
  const androidFirst = platform === 'android';
  const reasons = describeMissingPrerequisites(missing);

  const primaryClass =
    'w-full py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-2';
  const secondaryClass =
    'w-full py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors flex items-center justify-center gap-2 disabled:opacity-50';

  const iosLink = (
    <a key="ios" href={APP_STORE_LINKS.ios} className={androidFirst ? secondaryClass : primaryClass}>
      <AppleIcon className="w-4 h-4" /> Open on iPhone
    </a>
  );
  const androidLink = (
    <a key="android" href={APP_STORE_LINKS.android} className={androidFirst ? primaryClass : secondaryClass}>
      <AndroidIcon className="w-4 h-4" /> Open on Android
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
              Finish in the App
            </h1>
            <p className="text-sm opacity-60 italic">
              {checkFailed
                ? 'We couldn’t confirm your account is fully set up'
                : 'One step is still owned by the app'}
            </p>
          </div>

          <div className="space-y-6 bg-white border border-border p-10 shadow-sm">
            <div className="flex items-start gap-3 p-4 border border-border bg-bg/40 rounded">
              <ShieldAlert className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-xs opacity-70 leading-relaxed">
                  {checkFailed
                    ? 'We couldn’t reach your account’s security details just now, so we haven’t continued. This is usually a connection blip — try again in a moment.'
                    : 'Your profile is safe to finish here, but the key that unlocks your message history still needs the app:'}
                </p>
                {!checkFailed && reasons.length > 0 && (
                  <ul className="space-y-1.5 list-disc list-outside ml-4">
                    {reasons.map((reason) => (
                      <li key={reason} className="text-[11px] opacity-60 leading-relaxed">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                {!checkFailed && (
                  <p className="text-[11px] opacity-60 leading-relaxed">
                    Opening the app once finishes this automatically. It means replacing your phone
                    never costs you your conversations — and it’s why accounts are created there.
                  </p>
                )}
              </div>
            </div>

            <button type="button" onClick={onRetry} disabled={retrying} className={primaryClass}>
              {retrying ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> I’ve done it — check again
                </>
              )}
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs opacity-30 font-mono">GET THE APP</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {androidFirst ? [androidLink, iosLink] : [iosLink, androidLink]}

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full text-center text-[11px] font-bold uppercase tracking-[0.25em] opacity-50 hover:opacity-100 transition-opacity"
            >
              Back to home
            </button>
          </div>
        </motion.div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
