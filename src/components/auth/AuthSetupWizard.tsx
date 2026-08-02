import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, ShieldCheck, Loader, ArrowRight, Fingerprint } from 'lucide-react';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { useToast } from '../common/Toast';
import { useAppStore } from '../../store/app-store';

type SetupStep = 'EMAIL_PROMPT' | 'EMAIL_VERIFY' | 'WEBAUTHN_SETUP';

export function AuthSetupWizard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setAuthenticated } = useAppStore();

  const [step, setStep] = useState<SetupStep>('EMAIL_PROMPT');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSkipToWebAuthn = () => {
    setStep('WEBAUTHN_SETUP');
    setError(null);
  };

  const handleSkipToApp = () => {
    setAuthenticated(true);
    navigate('/app', { replace: true });
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const auth = getCognitoAuth();
      await auth.updateUserEmail(email);
      setStep('EMAIL_VERIFY');
      showToast('Verification code sent to email', 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update email.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const auth = getCognitoAuth();
      await auth.verifyEmail(code);
      showToast('Email verified successfully!', 'success');
      setStep('WEBAUTHN_SETUP');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid code.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWebAuthnSetup = async () => {
    setLoading(true);
    setError(null);

    try {
      const auth = getCognitoAuth();
      await auth.registerWebAuthn();
      showToast('Passkey registered successfully!', 'success');
      handleSkipToApp();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register passkey.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-border p-10 shadow-sm relative overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {step === 'EMAIL_PROMPT' && (
            <motion.div
              key="email-prompt"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20 mx-auto">
                  <Mail className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-3xl font-serif italic uppercase tracking-tighter">Secure Your Account</h2>
                <p className="text-xs opacity-60 leading-relaxed italic">
                  Add an email address to enable account recovery in case you lose access to your phone.
                </p>
              </div>

              {error && <div className="text-xs text-red-600 text-center">{error}</div>}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest opacity-60">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={loading}
                    className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={handleSkipToWebAuthn}
                    disabled={loading}
                    className="flex-1 py-4 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="flex-1 py-4 bg-accent text-white text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Continue'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 'EMAIL_VERIFY' && (
            <motion.div
              key="email-verify"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20 mx-auto">
                  <ShieldCheck className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-3xl font-serif italic uppercase tracking-tighter">Verify Email</h2>
                <p className="text-xs opacity-60 leading-relaxed italic">
                  We've sent a verification code to {email}.
                </p>
              </div>

              {error && <div className="text-xs text-red-600 text-center">{error}</div>}

              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest opacity-60">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                    disabled={loading}
                    className="w-full px-4 py-3 border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent text-center tracking-widest text-lg"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => { setStep('EMAIL_PROMPT'); setError(null); }}
                    disabled={loading}
                    className="flex-1 py-4 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !code.trim()}
                    className="flex-1 py-4 bg-accent text-white text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Verify'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 'WEBAUTHN_SETUP' && (
            <motion.div
              key="webauthn"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20 mx-auto">
                  <Fingerprint className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-3xl font-serif italic uppercase tracking-tighter">Fast Sign-In</h2>
                <p className="text-xs opacity-60 leading-relaxed italic">
                  Create a passkey using Touch ID, Face ID, or Windows Hello for instant, passwordless logins next time.
                </p>
              </div>

              {error && <div className="text-xs text-red-600 text-center">{error}</div>}

              <div className="flex flex-col gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleWebAuthnSetup}
                  disabled={loading}
                  className="w-full py-4 bg-accent text-white text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90 flex items-center justify-center gap-2 rounded shadow-xl shadow-accent/10"
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Create Passkey'}
                </button>
                <button
                  type="button"
                  onClick={handleSkipToApp}
                  disabled={loading}
                  className="w-full py-4 border border-transparent text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors flex items-center justify-center gap-2 opacity-50 hover:opacity-100"
                >
                  Skip for now <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
