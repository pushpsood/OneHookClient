import React, { useEffect, useRef, useState } from 'react';
import {
  Mail,
  Phone,
  Fingerprint,
  Loader,
  Apple,
  Chrome,
  Settings,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { IdentityApi } from '../../api/identity';
import { ProfileApi } from '../../api/profile';
import { ChatEncryptionManager } from '../../lib/chat-encryption';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { PhoneNumberInput } from '../common/PhoneNumberInput';
import { ModalDialog } from '../common/ModalDialog';
import { linkGoogleAccount } from '../../lib/social-link';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

export function AccountSettingsCard() {
  const { showToast } = useToast();
  const { currentUser } = useAppStore();
  const [loading, setLoading] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  
  const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');
  const [emailOtp, setEmailOtp] = useState('');

  const [currentPhone, setCurrentPhone] = useState<string | null>(null);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input');
  const [phoneDraft, setPhoneDraft] = useState<{ e164: string; isValid: boolean }>({
    e164: '',
    isValid: false,
  });
  const [phoneOtp, setPhoneOtp] = useState('');
  const phoneOtpAbortRef = useRef<AbortController | null>(null);
  const phoneOtpFormRef = useRef<HTMLFormElement | null>(null);

  const [socialState, setSocialState] = useState<{
    googleId?: string;
    googleEmail?: string;
    appleId?: string;
    appleEmail?: string;
  }>({});
  const [pendingUnlink, setPendingUnlink] = useState<'GOOGLE' | 'APPLE' | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCognitoAuth().getCurrentUser();
        if (!cancelled && user?.email) setCurrentEmail(user.email);
      } catch {
        // Ignore
      }
      if (!currentUser?.id) return;
      try {
        const identityUser = await IdentityApi.getUser(currentUser.id);
        if (cancelled) return;
        if (identityUser?.email) setCurrentEmail(identityUser.email);
        if (identityUser?.phoneNumber) setCurrentPhone(identityUser.phoneNumber);
        setSocialState({
          googleId: identityUser?.googleId,
          googleEmail: identityUser?.googleEmail,
          appleId: identityUser?.appleId,
          appleEmail: identityUser?.appleEmail,
        });
      } catch {
        // Identity lookup is best-effort enrichment
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  // WebOTP auto-extraction lifecycle when the phone verification step is active
  useEffect(() => {
    if (phoneStep !== 'verify' || !phoneEditing) {
      phoneOtpAbortRef.current?.abort();
      phoneOtpAbortRef.current = null;
      return;
    }
    if (typeof window === 'undefined' || !('OTPCredential' in window)) return;
    const ac = new AbortController();
    phoneOtpAbortRef.current = ac;
    void (navigator.credentials as unknown as {
      get: (opts: { otp: { transport: string[] }; signal: AbortSignal }) => Promise<{ code?: string } | null>;
    })
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then((cred) => {
        if (cred?.code) {
          setPhoneOtp(cred.code);
          phoneOtpFormRef.current?.requestSubmit();
        }
      })
      .catch(() => {
        /* Ignore AbortError or unsupported browser cancel */
      });
    return () => {
      ac.abort();
      phoneOtpAbortRef.current = null;
    };
  }, [phoneStep, phoneEditing]);

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

  const googleLinked = Boolean(socialState.googleId);
  const appleLinked = Boolean(socialState.appleId);

  const handleLinkGoogle = async () => {
    if (googleLinked) {
      setPendingUnlink('GOOGLE');
      return;
    }
    try {
      setLoading('google');
      await linkGoogleAccount();
      if (currentUser?.id) {
        const refreshed = await IdentityApi.getUser(currentUser.id).catch(() => null);
        if (refreshed) {
          setSocialState((s) => ({
            ...s,
            googleId: refreshed.googleId ?? 'linked',
            googleEmail: refreshed.googleEmail,
          }));
        } else {
          setSocialState((s) => ({ ...s, googleId: 'linked' }));
        }
      }
      showToast('Google account linked successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not link Google account.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleLinkApple = async () => {
    if (appleLinked) {
      setPendingUnlink('APPLE');
      return;
    }
    showToast('Apple linking will be available soon.', 'info');
    // Implement Apple JS linking here once configured
  };

  const confirmUnlinkSocial = async () => {
    if (!pendingUnlink) return;
    const provider = pendingUnlink;
    try {
      setLoading(provider === 'GOOGLE' ? 'google' : 'apple');
      await IdentityApi.unlinkSocial(provider);
      setSocialState((s) =>
        provider === 'GOOGLE'
          ? { ...s, googleId: undefined, googleEmail: undefined }
          : { ...s, appleId: undefined, appleEmail: undefined }
      );
      setPendingUnlink(null);
      showToast(
        `${provider === 'GOOGLE' ? 'Google' : 'Apple'} account unlinked.`,
        'success'
      );
    } catch (err: any) {
      showToast(
        err?.message || `Could not unlink ${provider === 'GOOGLE' ? 'Google' : 'Apple'} account.`,
        'error'
      );
    } finally {
      setLoading(null);
    }
  };

  const handleRequestPhoneUpdateOtp = async () => {
    if (!phoneDraft.isValid) {
      showToast('Enter a valid phone number.', 'error');
      return;
    }
    try {
      setLoading('phone_request');
      await IdentityApi.requestPhoneUpdateOtp(phoneDraft.e164);
      setPhoneStep('verify');
      showToast('Verification code sent by SMS.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not send verification code.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyPhoneUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    phoneOtpAbortRef.current?.abort();
    phoneOtpAbortRef.current = null;
    if (!phoneOtp.trim()) {
      showToast('Please enter the 6-digit verification code.', 'error');
      return;
    }
    try {
      setLoading('phone_verify');
      await IdentityApi.updatePhoneNumber(phoneDraft.e164, phoneOtp.trim());
      setCurrentPhone(phoneDraft.e164);
      setPhoneEditing(false);
      setPhoneStep('input');
      setPhoneOtp('');
      showToast('Phone number updated.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update phone number.', 'error');
    } finally {
      setLoading(null);
    }
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
    <div className="border border-border p-8 space-y-8 bg-surface-card text-text">
      <div className="flex items-center gap-3">
        <Settings className={`${ICON_SECTION.section.headingIcon} text-accent`} />
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
              <Mail className={`${ICON_SECTION.section.rowIcon} text-text-muted`} />
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60">
                Email Address
              </span>
            </div>
            {currentEmail ? (
              <div className="text-sm font-medium p-3 bg-surface border border-border inline-block">
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
                      {...trackProps(UiElement.SETTINGS_EMAIL_MANAGE)}
                      className="py-2 px-4 bg-accent text-bg text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 shrink-0"
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
                      {...trackProps(UiElement.SETTINGS_EMAIL_MANAGE)}
                      className="py-2 px-4 bg-accent text-bg text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 shrink-0"
                    >
                      {loading === 'email_verify' ? <Loader className="w-3 h-3 animate-spin" /> : 'Verify'}
                    </button>
                    <button
                      onClick={() => setEmailStep('input')}
                      {...trackProps(UiElement.SETTINGS_EMAIL_MANAGE, { action: 'dismiss' })}
                      className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-surface-hover text-text shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Phone Number Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Phone className={`${ICON_SECTION.section.rowIcon} text-text-muted`} />
                <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60">
                  Phone Number
                </span>
              </div>
              {currentPhone && !phoneEditing && (
                /* TODO(telemetry-parity): promote settings.phone_update to include "web" in telemetry catalog */
                <button
                  type="button"
                  onClick={() => {
                    setPhoneEditing(true);
                    setPhoneStep('input');
                    setPhoneOtp('');
                  }}
                  data-track-exempt="disabled: pending telemetry web parity enablement for settings.phone_update"
                  className="text-[10px] uppercase tracking-[0.2em] font-bold text-accent hover:opacity-80"
                >
                  Change
                </button>
              )}
            </div>

            {currentPhone && !phoneEditing ? (
              <div className="text-sm font-medium p-3 bg-surface border border-border inline-block">
                {currentPhone} <span className="text-green-600 text-xs ml-2">✓ Verified</span>
              </div>
            ) : (
              <div className="space-y-3">
                {phoneStep === 'input' ? (
                  <>
                    <PhoneNumberInput
                      label={currentPhone ? 'New phone number' : 'Phone number'}
                      initialE164={currentPhone ?? undefined}
                      onChange={setPhoneDraft}
                      disabled={loading === 'phone_request'}
                    />
                    <div className="flex gap-2">
                      {/* TODO(telemetry-parity): promote settings.phone_update to include "web" in telemetry catalog */}
                      <button
                        type="button"
                        onClick={handleRequestPhoneUpdateOtp}
                        disabled={loading === 'phone_request' || !phoneDraft.isValid}
                        data-track-exempt="disabled: pending telemetry web parity enablement for settings.phone_update"
                        className="py-2 px-4 bg-accent text-bg text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50"
                      >
                        {loading === 'phone_request' ? (
                          <Loader className="w-3 h-3 animate-spin" />
                        ) : (
                          'Send code'
                        )}
                      </button>
                      {phoneEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneEditing(false);
                            setPhoneStep('input');
                            setPhoneOtp('');
                          }}
                          data-track-exempt="duplicate: cancel dismisses phone editor"
                          className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-surface-hover text-text"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <form ref={phoneOtpFormRef} onSubmit={handleVerifyPhoneUpdate} className="space-y-2 max-w-sm">
                    <label
                      htmlFor="settings-phone-otp"
                      className="block text-[10px] uppercase tracking-[0.2em] font-bold opacity-70"
                    >
                      Verification code
                    </label>
                    <p id="settings-phone-otp-hint" className="text-xs opacity-60">
                      Enter the 6-digit code sent to {phoneDraft.e164}.
                    </p>
                    <div className="flex gap-2">
                      <input
                        id="settings-phone-otp"
                        name="otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="\d{6}"
                        maxLength={6}
                        aria-describedby="settings-phone-otp-hint"
                        required
                        value={phoneOtp}
                        onChange={(e) => setPhoneOtp(e.target.value)}
                        placeholder="000000"
                        className="field-input flex-1 min-w-0 font-mono tracking-widest"
                      />
                      {/* TODO(telemetry-parity): promote settings.verify_code_submit to include "web" in telemetry catalog */}
                      <button
                        type="submit"
                        disabled={loading === 'phone_verify'}
                        data-track-exempt="disabled: pending telemetry web parity enablement for settings.verify_code_submit"
                        className="py-2 px-4 bg-accent text-bg text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 shrink-0"
                      >
                        {loading === 'phone_verify' ? (
                          <Loader className="w-3 h-3 animate-spin" />
                        ) : (
                          'Verify'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhoneStep('input')}
                        data-track-exempt="duplicate: cancel returns to phone input"
                        className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-surface-hover text-text shrink-0"
                      >
                        Back
                      </button>
                    </div>
                  </form>
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
                {...trackProps(UiElement.SETTINGS_GOOGLE_LINK, {
                  value: googleLinked ? 'unlink' : 'link',
                })}
                className="py-3 px-6 border border-border bg-surface hover:bg-surface-hover text-text hover:border-accent transition-colors text-[10px] uppercase tracking-[0.2em] font-black disabled:opacity-50 inline-flex items-center justify-center gap-2 flex-1"
              >
                {loading === 'google' ? <Loader className="w-4 h-4 animate-spin" /> : <Chrome className="w-4 h-4" />}
                {googleLinked
                  ? `Unlink Google${socialState.googleEmail ? ` (${socialState.googleEmail})` : ''}`
                  : 'Link Google'}
              </button>
              <button
                onClick={handleLinkApple}
                disabled={loading === 'apple'}
                {...trackProps(UiElement.SETTINGS_APPLE_LINK, {
                  value: appleLinked ? 'unlink' : 'link',
                })}
                className="py-3 px-6 border border-border bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity text-[10px] uppercase tracking-[0.2em] font-black disabled:opacity-50 inline-flex items-center justify-center gap-2 flex-1"
              >
                {loading === 'apple' ? <Loader className="w-4 h-4 animate-spin" /> : <Apple className="w-4 h-4" />}
                {appleLinked
                  ? `Unlink Apple${socialState.appleEmail ? ` (${socialState.appleEmail})` : ''}`
                  : 'Link Apple'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-10">
          {/* Passkey Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Fingerprint className={`${ICON_SECTION.section.rowIcon} text-text-muted`} />
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
              {...trackProps(UiElement.SETTINGS_PASSKEY_ADD)}
              className="py-3 px-6 w-full sm:w-auto bg-accent text-bg text-[10px] uppercase tracking-[0.2em] font-black shadow hover:opacity-90 disabled:opacity-50 inline-flex justify-center items-center gap-2"
            >
              {loading === 'passkey' ? <Loader className={`${ICON_SECTION.section.rowIcon} animate-spin`} /> : <Fingerprint className={ICON_SECTION.section.rowIcon} />}
              Register Passkey
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone - Delete Profile */}
      <div className="pt-8 border-t border-destructive/20 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className={`${ICON_SECTION.section.headingIcon} text-destructive`} />
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
            {...trackProps(UiElement.SETTINGS_DELETE_ACCOUNT_OPEN)}
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
                {...trackProps(UiElement.SETTINGS_DELETE_ACCOUNT_CONFIRM)}
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
                {...trackProps(UiElement.SETTINGS_DELETE_ACCOUNT_CONFIRM, { action: 'dismiss' })}
                className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-surface-hover text-text shrink-0 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <ModalDialog
        open={Boolean(pendingUnlink)}
        onClose={() => setPendingUnlink(null)}
        labelledBy="unlink-social-title"
        className="w-full max-w-sm rounded-2xl bg-surface-card border border-border p-6 space-y-4 shadow-2xl"
      >
        <h3 id="unlink-social-title" className="text-sm font-semibold text-text">
          Unlink {pendingUnlink === 'GOOGLE' ? 'Google' : 'Apple'}?
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          You&rsquo;ll no longer be able to sign in with {pendingUnlink === 'GOOGLE' ? 'Google' : 'Apple'}
          . Make sure you still have a phone number, email, or passkey on your account.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPendingUnlink(null)}
            data-track-exempt="duplicate: cancel dismisses social unlink confirmation"
            className="px-4 py-2 border border-border rounded-lg text-xs font-medium text-text hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading === 'google' || loading === 'apple'}
            onClick={confirmUnlinkSocial}
            {...trackProps(
              pendingUnlink === 'GOOGLE'
                ? UiElement.SETTINGS_GOOGLE_LINK
                : UiElement.SETTINGS_APPLE_LINK,
              { value: 'unlink' }
            )}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
