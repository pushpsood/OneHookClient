import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, Loader } from 'lucide-react';
import { IdentityApi } from '../../api/identity';
import { useToast } from '../common/Toast';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { SOCIALS } from '../common/socials';

type Step = 'invite' | 'phone' | 'otp';

/**
 * Invite-gated registration.
 *
 * Design philosophy (see OneHookBackend/packages/identity): OneHook is
 * invite-only and phone-first. A new member:
 *   1. validates their invite code           (GET  /identity/invite/validate/{code})
 *   2. requests an SMS OTP for their phone    (POST /identity/auth/register/phone/request-otp)
 *   3. registers with phone + otp + invite    (POST /identity/auth/register/phone)
 * Registration returns a user in ONBOARDING; the member then logs in via
 * Cognito (the Login screen) and completes their profile.
 */
export function RedeemInvite() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('invite');
  const [inviteCode, setInviteCode] = useState('');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(true);

  const handleValidateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!inviteCode.trim()) {
        throw new Error('Please enter your invite code');
      }
      await IdentityApi.validateInvite(inviteCode.trim());
      showToast('Invite valid! Verify your phone to continue.', 'success');
      setStep('phone');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid or expired invite code';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!phone.trim()) {
        throw new Error('Please enter your phone number');
      }
      await IdentityApi.requestPhoneOtp(phone.trim());
      showToast('Verification code sent!', 'info');
      setStep('otp');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send verification code';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!otp.trim()) {
        throw new Error('Please enter the verification code');
      }
      if (!agreed) {
        throw new Error('Please agree to the Privacy Policy and Terms to continue.');
      }
      await IdentityApi.registerPhone(
        phone.trim(),
        otp.trim(),
        inviteCode.trim(),
        displayName.trim() || undefined
      );
      showToast('Account created! Please sign in to continue.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit =
    step === 'invite' ? handleValidateInvite : step === 'phone' ? handleRequestOtp : handleRegister;

  const titles: Record<Step, string> = {
    invite: 'Redeem Invite',
    phone: 'Verify Phone',
    otp: 'Confirm Code',
  };
  const subtitles: Record<Step, string> = {
    invite: 'Your invite is your way into OneHook',
    phone: 'We\u2019ll text you a one-time code to verify your number',
    otp: 'Enter the code we sent to complete registration',
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
            {step !== 'invite' && (
              <h1 className="text-4xl font-serif italic uppercase tracking-tighter">
                {titles[step]}
              </h1>
            )}
            <p className="text-sm opacity-60 italic">{subtitles[step]}</p>
          </div>

          <form
            onSubmit={onSubmit}
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

            {step === 'invite' && (
              <div className="space-y-2">
                <label
                  htmlFor="inviteCode"
                  className="block text-center text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  Invite Code
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  placeholder="e.g., OHK-1234-5678"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed uppercase font-mono text-sm tracking-wider"
                />
                <p className="text-xs opacity-40 italic">
                  Your invite code comes from an existing member
                </p>
              </div>
            )}

            {step === 'phone' && (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="block text-xs font-bold uppercase tracking-widest opacity-60"
                  >
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="displayName"
                    className="block text-xs font-bold uppercase tracking-widest opacity-60"
                  >
                    Display Name (optional)
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    placeholder="The name people will see"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </>
            )}

            {step === 'otp' && (
              <div className="space-y-2">
                <label
                  htmlFor="otp"
                  className="block text-xs font-bold uppercase tracking-widest opacity-60"
                >
                  Verification Code
                </label>
                <input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:opacity-30 disabled:opacity-50 disabled:cursor-not-allowed text-center tracking-widest text-lg"
                />
                <p className="text-xs opacity-40 italic">Sent to {phone}</p>
              </div>
            )}

            {step === 'otp' && (
              <label className="flex items-start gap-3 text-xs opacity-70 leading-relaxed">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  disabled={loading}
                  className="mt-0.5 h-4 w-4 accent-accent shrink-0"
                />
                <span>
                  I agree to OneHook&rsquo;s{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:opacity-100"
                  >
                    Privacy Policy
                  </a>{' '}
                  and{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:opacity-100"
                  >
                    Terms
                  </a>
                  .
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (step === 'invite' && !inviteCode.trim()) ||
                (step === 'phone' && !phone.trim()) ||
                (step === 'otp' && (!otp.trim() || !agreed))
              }
              className="w-full py-4 bg-accent text-white text-xs font-black uppercase tracking-[0.3em] rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>
                    {step === 'invite'
                      ? 'Verifying...'
                      : step === 'phone'
                        ? 'Sending...'
                        : 'Creating Account...'}
                  </span>
                </>
              ) : (
                <span>
                  {step === 'invite'
                    ? 'Redeem Invite'
                    : step === 'phone'
                      ? 'Send Code'
                      : 'Create Account'}
                </span>
              )}
            </button>

            {step !== 'invite' && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(step === 'otp' ? 'phone' : 'invite');
                }}
                disabled={loading}
                className="w-full py-3 border border-border text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}
          </form>

          <div className="mt-8 space-y-6">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-3 border border-border bg-white text-xs font-bold uppercase tracking-[0.3em] rounded hover:bg-bg transition-colors"
            >
              Already a member? Sign in
            </button>
            <p className="text-center text-xs opacity-40 italic">
              OneHook is invite-only. Need an invite? Reach out on any of our channels and
              we&rsquo;ll help.
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
