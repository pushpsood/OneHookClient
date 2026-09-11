import React, { useEffect, useState } from 'react';
import { Mail, Fingerprint, Loader, Apple, Chrome, Settings, Trash2, AlertTriangle } from 'lucide-react';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { IdentityApi } from '../../api/identity';
import { ProfileApi } from '../../api/profile';
import { ChatEncryptionManager } from '../../lib/chat-encryption';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { requestGoogleIdToken } from '../../lib/google-identity';
import { googleClientId } from '../../utils/env.config';

export function AccountSettingsCard() {
  const { showToast } = useToast();
  const { currentUser } = useAppStore();
  const [loading, setLoading] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  
  const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');
  const [emailOtp, setEmailOtp] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const user = await getCognitoAuth().getCurrentUser();
        if (user?.email) setCurrentEmail(user.email);
      } catch {
        // Ignore
      }
    })();
  }, []);

  const handleAddEmailRequest = async () => {
    if (!email.trim() || !email.includes('@')) {
      showToast('Please enter a valid email.', 'error');
      return;
    }
    try {
      setLoading('email_request');
      await IdentityApi.requestEmailOtp(email.trim());
      setEmailStep('verify');
      showToast('Verification code sent to email.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not send verification code.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleAddEmailVerify = async () => {
    if (!emailOtp.trim()) {
      showToast('Please enter the verification code.', 'error');
      return;
    }
    try {
      setLoading('email_verify');
      await IdentityApi.linkEmail(email.trim(), emailOtp.trim());
      setCurrentEmail(email.trim());
      setEmailStep('input');
      showToast('Email linked successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not verify email.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      setLoading('google');
      const token = await requestGoogleIdToken(googleClientId);
      await IdentityApi.linkSocial('GOOGLE', token);
      showToast('Google account linked successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not link Google account.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleLinkApple = async () => {
    showToast('Apple linking will be available soon.', 'info');
    // Implement Apple JS linking here once configured
  };

  const handleAddPasskey = async () => {
    try {
      setLoading('passkey');
      await getCognitoAuth().registerWebAuthn();

      // Register the new passkey as a way to UNLOCK message history, not just to sign in. This is what
      // makes a second passkey worth adding: each one becomes an independent holder of the history key,
      // so losing one provider (or one ecosystem) no longer costs the user their history. Best effort —
      // PRF is absent on Windows 10, Firefox-on-Android and Chrome-profile authenticators, and the
      // passkey is still perfectly good for sign-in there.
      let unlockAdded = false;
      if (currentUser?.id) {
        try {
          unlockAdded = Boolean(await new ChatEncryptionManager(currentUser.id).addPasskeyUnlock());
        } catch {
          /* this device may not hold the history key; the passkey still works for sign-in */
        }
      }

      showToast(
        unlockAdded
          ? 'Passkey added. It can now also unlock your message history.'
          : 'Passkey added successfully!',
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Could not register passkey.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteProfile = async () => {
    if (deleteConfirmText !== 'DELETE') {
      showToast('Type DELETE to confirm.', 'error');
      return;
    }
    if (!currentUser?.id) {
      showToast('No user ID found.', 'error');
      return;
    }
    try {
      setLoading('delete');
      await ProfileApi.delete(currentUser.id);
      showToast('Profile deletion initiated. You will be signed out shortly.', 'success');
      // Sign out after a brief delay
      setTimeout(async () => {
        try {
          await getCognitoAuth().logout();
          window.location.href = '/';
        } catch {
          window.location.href = '/';
        }
      }, 2000);
    } catch (err: any) {
      showToast(err?.message || 'Could not delete profile.', 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="border border-border p-8 space-y-8 bg-white">
      <div className="flex items-center gap-3">
        <Settings className="w-4 h-4 text-accent" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
            Account Connections
          </div>
          <p className="mt-1 text-xs opacity-50 leading-relaxed">
            Manage your connected accounts, email, and security methods.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-4 border-t border-border">
        {/* Left Column */}
        <div className="space-y-10">
          {/* Email Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60">
                Email Address
              </span>
            </div>
            {currentEmail ? (
              <div className="text-sm font-medium p-3 bg-bg/50 border border-border inline-block">
                {currentEmail} <span className="text-green-600 text-xs ml-2">✓ Verified</span>
              </div>
            ) : (
              <div className="space-y-4">
                {emailStep === 'input' ? (
                  <div className="flex gap-2 w-full max-w-sm">
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="field-input flex-1 min-w-0"
                    />
                    <button
                      onClick={handleAddEmailRequest}
                      disabled={loading === 'email_request'}
                      className="py-2 px-4 bg-accent text-white text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 shrink-0"
                    >
                      {loading === 'email_request' ? <Loader className="w-3 h-3 animate-spin" /> : 'Add'}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 w-full max-w-sm">
                    <input
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value)}
                      placeholder="000000"
                      inputMode="numeric"
                      className="field-input flex-1 min-w-0 tracking-widest"
                    />
                    <button
                      onClick={handleAddEmailVerify}
                      disabled={loading === 'email_verify'}
                      className="py-2 px-4 bg-accent text-white text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 shrink-0"
                    >
                      {loading === 'email_verify' ? <Loader className="w-3 h-3 animate-spin" /> : 'Verify'}
                    </button>
                    <button
                      onClick={() => setEmailStep('input')}
                      className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-bg shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Social Accounts */}
          <div className="space-y-4">
            <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block">
              Social Sign-in
            </span>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleLinkGoogle}
                disabled={loading === 'google'}
                className="py-3 px-6 border border-border bg-white text-foreground hover:border-foreground transition-colors text-[10px] uppercase tracking-[0.2em] font-black disabled:opacity-50 inline-flex items-center justify-center gap-2 flex-1"
              >
                {loading === 'google' ? <Loader className="w-4 h-4 animate-spin" /> : <Chrome className="w-4 h-4" />}
                Link Google
              </button>
              <button
                onClick={handleLinkApple}
                disabled={loading === 'apple'}
                className="py-3 px-6 border border-border bg-black text-white hover:opacity-90 transition-opacity text-[10px] uppercase tracking-[0.2em] font-black disabled:opacity-50 inline-flex items-center justify-center gap-2 flex-1"
              >
                {loading === 'apple' ? <Loader className="w-4 h-4 animate-spin" /> : <Apple className="w-4 h-4" />}
                Link Apple
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-10">
          {/* Passkey Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-muted-foreground" />
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60">
                Passkeys (WebAuthn)
              </span>
            </div>
            <p className="text-xs opacity-50">
              Sign in securely using face, fingerprint, or device PIN.
            </p>
            <button
              onClick={handleAddPasskey}
              disabled={loading === 'passkey'}
              className="py-3 px-6 w-full sm:w-auto bg-foreground text-background text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 inline-flex justify-center items-center gap-2"
            >
              {loading === 'passkey' ? <Loader className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              Register Passkey
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone - Delete Profile */}
      <div className="pt-8 border-t border-destructive/20 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] font-black text-destructive">
              Danger Zone
            </div>
            <p className="mt-1 text-xs opacity-50 leading-relaxed">
              Permanently delete your profile, media, and all associated data. This action cannot be undone.
            </p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="py-3 px-6 border-2 border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors text-[10px] uppercase tracking-[0.2em] font-black inline-flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Profile
          </button>
        ) : (
          <div className="space-y-4 p-6 border-2 border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">
              ⚠️ This will permanently delete your account, profile, photos, messages, and all data.
            </p>
            <p className="text-xs opacity-70">Type <span className="font-mono font-bold">DELETE</span> to confirm:</p>
            <div className="flex gap-2 max-w-md">
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="field-input flex-1 min-w-0 font-mono"
                autoFocus
              />
              <button
                onClick={handleDeleteProfile}
                disabled={loading === 'delete' || deleteConfirmText !== 'DELETE'}
                className="py-2 px-4 bg-destructive text-white text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {loading === 'delete' ? <Loader className="w-3 h-3 animate-spin" /> : 'Confirm Delete'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                disabled={loading === 'delete'}
                className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-bg shrink-0 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
