import React, { useEffect, useState } from 'react';
import { KeyRound, Loader } from 'lucide-react';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { useToast } from '../common/Toast';

/**
 * Lets a signed-in member set (or change) an account password so they can also
 * sign in with a password later. Uses Cognito's code-based flow: a verification
 * code is sent to the account's email/phone, then confirmed with the new
 * password — so even passwordless (OTP-only) accounts can set one, with no old
 * password required.
 */
export function SetPasswordCard() {
  const { showToast } = useToast();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  // Prefill the identifier with the current user's email/username where possible.
  useEffect(() => {
    (async () => {
      try {
        const user = await getCognitoAuth().getCurrentUser();
        if (user?.email) setIdentifier(user.email);
        else if (user?.username) setIdentifier(user.username);
      } catch {
        /* auth not initialized / no session — user can type it manually */
      }
    })();
  }, []);

  const requestCode = async () => {
    if (!identifier.trim()) {
      showToast('Enter the email or phone on your account.', 'error');
      return;
    }
    try {
      setLoading(true);
      await getCognitoAuth().requestPasswordReset(identifier.trim());
      showToast('Verification code sent.', 'info');
      setStep('confirm');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send verification code.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmPassword = async () => {
    if (!code.trim()) {
      showToast('Enter the verification code.', 'error');
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    try {
      setLoading(true);
      await getCognitoAuth().confirmPasswordSet(identifier.trim(), code.trim(), password);
      showToast('Password set. You can now sign in with a password.', 'success');
      setStep('request');
      setCode('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not set password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border p-8 space-y-5">
      <div className="flex items-center gap-3">
        <KeyRound className="w-4 h-4 text-accent" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
            Account Password
          </div>
          <p className="mt-1 text-xs opacity-50 leading-relaxed">
            Optional. Set a password to sign in without a one-time code. We&rsquo;ll send a
            verification code to confirm it&rsquo;s you.
          </p>
        </div>
      </div>

      {step === 'request' ? (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">
              Email or phone
            </span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com or +1234567890"
              className="field-input"
            />
          </label>
          <button
            onClick={requestCode}
            disabled={loading}
            className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Send verification code'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">
              Verification code
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="000000"
              className="field-input tracking-widest"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-2">
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">
                New password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="field-input"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">
                Confirm password
              </span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="field-input"
              />
            </label>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setStep('request');
                setCode('');
              }}
              disabled={loading}
              className="flex-1 py-4 border border-border text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-bg transition-colors disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={confirmPassword}
              disabled={loading}
              className="flex-1 py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Set password'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
