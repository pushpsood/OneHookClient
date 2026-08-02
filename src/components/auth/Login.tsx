import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, Loader } from 'lucide-react';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { useToast } from '../common/Toast';
import { AppleIcon, GoogleIcon } from '../common/BrandIcons';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { SOCIALS } from '../common/socials';

/**
 * Sign in with a phone number OR an email — both support a one-time-code (OTP)
 * flow, and users who have set a password can toggle to password sign-in. All
 * of this is handled directly by Cognito's USER_AUTH flow (no backend call);
 * only social sign-in uses the federated redirect.
 */
export function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [step, setStep] = useState<'IDENTIFIER' | 'OTP' | 'SET_PASSWORD'>('IDENTIFIER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmail = identifier.includes('@');
  const identifierLabel = isEmail ? 'email' : 'phone';

  const isSignedInStep = (res: { isSignedIn?: boolean; nextStep?: { signInStep?: string } }) =>
    res?.isSignedIn || res?.nextStep?.signInStep === 'DONE';

  const needsCodeStep = (res: { nextStep?: { signInStep?: string } }) =>
    typeof res?.nextStep?.signInStep === 'string' &&
    res.nextStep.signInStep.startsWith('CONFIRM_SIGN_IN_WITH');

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!identifier.trim()) {
        throw new Error('Please enter your phone number or email');
      }

      const cognitoAuth = getCognitoAuth();

      if (usePassword) {
        if (!password.trim()) {
          throw new Error('Please enter your password');
        }
        const response = await cognitoAuth.loginWithPassword(identifier.trim(), password);
        if (isSignedInStep(response)) {
          navigate('/auth/setup', { replace: true });
        } else if (needsCodeStep(response)) {
          // e.g. an additional MFA/OTP challenge.
          setStep('OTP');
          showToast('Enter the verification code to continue.', 'info');
        } else {
          navigate('/auth/setup', { replace: true });
        }
        return;
      }

      // One-time-code flow (phone or email).
      const response = await cognitoAuth.requestOtp(identifier.trim());
      if (isSignedInStep(response)) {
        navigate('/auth/setup', { replace: true });
      } else {
        setStep('OTP');
        showToast(`Verification code sent to your ${identifierLabel}!`, 'info');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!code.trim()) {
        throw new Error('Please enter the verification code');
      }
      const cognitoAuth = getCognitoAuth();
      await cognitoAuth.confirmLogin(code);
      navigate('/auth/setup', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    if (!identifier.trim()) {
      const msg = 'Enter your phone or email first';
      setError(msg);
      showToast(msg, 'error');
      return;
    }
    setLoading(true);
    try {
      await getCognitoAuth().requestPasswordReset(identifier.trim());
      setStep('SET_PASSWORD');
      showToast(`Verification code sent to your ${identifierLabel}.`, 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send verification code.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (!code.trim()) throw new Error('Please enter the verification code');
      if (password.length < 8) throw new Error('Password must be at least 8 characters');
      if (password !== confirmPassword) throw new Error('Passwords do not match');
      setLoading(true);
      await getCognitoAuth().confirmPasswordSet(identifier.trim(), code.trim(), password);
      showToast('Password set. Sign in with your new password.', 'success');
      setUsePassword(true);
      setStep('IDENTIFIER');
      setCode('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not set password.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await getCognitoAuth().federatedSignInGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await getCognitoAuth().federatedSignInApple();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apple sign-in failed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetToIdentifier = () => {
    setStep('IDENTIFIER');
    setCode('');
    setError(null);
  };

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
          {step !== 'IDENTIFIER' && (
            <h1 className="text-4xl font-serif italic uppercase tracking-tighter">
              {step === 'SET_PASSWORD' ? 'Set a Password' : 'Verify It\u2019s You'}
            </h1>
          )}
          <p className="text-sm opacity-60 italic">
            {step === 'IDENTIFIER'
              ? 'Sign in with your phone number or email'
              : step === 'SET_PASSWORD'
                ? `Enter the code sent to your ${identifierLabel}, then choose a password`
                : `Enter the code sent to your ${identifierLabel}`}
          </p>
        </div>

        <form
          onSubmit={
            step === 'IDENTIFIER'
              ? handleIdentifierSubmit
              : step === 'OTP'
                ? handleCodeSubmit
                : handleSetPassword
          }
          className="space-y-6 bg-white border border-border p-10 shadow-sm"
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 bg-red-50 border border-red-200 rounded flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </motion.div>
          )}

          {step === 'IDENTIFIER' ? (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="identifier"
                  className="block text-center text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  Phone or Email
                </label>
                <input
                  id="identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="+1234567890 or you@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                />
              </div>

              {usePassword && (
                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-xs font-bold uppercase tracking-widest opacity-60"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !identifier.trim() || (usePassword && !password.trim())}
                className="w-full py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>{usePassword ? 'Signing in...' : 'Sending...'}</span>
                  </>
                ) : (
                  <span>{usePassword ? 'Sign In' : 'Send Code'}</span>
                )}
              </button>

              {/* Toggle: OTP <-> password */}
              <button
                type="button"
                onClick={() => {
                  setUsePassword((prev) => !prev);
                  setError(null);
                }}
                className="w-full text-center text-[11px] font-bold uppercase tracking-[0.25em] opacity-50 hover:opacity-100 transition-opacity"
              >
                {usePassword ? 'Use a one-time code instead' : 'Sign in with password instead'}
              </button>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full text-center text-[11px] font-bold uppercase tracking-[0.25em] opacity-50 hover:opacity-100 transition-opacity"
              >
                Forgot or set a password?
              </button>

              <div className="flex items-center gap-4">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs opacity-30 font-mono">OR</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <button
                type="button"
                onClick={() => navigate('/redeem')}
                className="w-full py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors"
              >
                Redeem Invite Code
              </button>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3 border border-blue-500 text-blue-500 text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
              >
                <GoogleIcon className="w-4 h-4" /> Sign in with Google
              </button>

              <button
                type="button"
                onClick={handleAppleSignIn}
                disabled={loading}
                className="w-full py-3 border border-black text-black text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
              >
                <AppleIcon className="w-4 h-4" /> Sign in with Apple
              </button>
            </>
          ) : step === 'OTP' ? (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="code"
                  className="block text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  Verification Code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-center tracking-widest text-lg"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify</span>
                )}
              </button>

              <button
                type="button"
                onClick={resetToIdentifier}
                className="w-full py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors"
              >
                Use a different account
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="reset-code"
                  className="block text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  Verification Code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-center tracking-widest text-lg"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="new-password"
                  className="block text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim() || !password.trim() || !confirmPassword.trim()}
                className="w-full py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Setting...</span>
                  </>
                ) : (
                  <span>Set Password</span>
                )}
              </button>

              <button
                type="button"
                onClick={resetToIdentifier}
                className="w-full py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors"
              >
                Back to sign in
              </button>
            </>
          )}
        </form>

        <div className="mt-8 space-y-4">
          <p className="text-center text-xs opacity-40 italic">
            OneHook is invite-only. Don&rsquo;t have an account yet? Reach out on any platform.
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
