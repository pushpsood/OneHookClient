import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plus, Trash2, LogOut, MessageCircle } from 'lucide-react';
import { ProfileApi } from '../../api/profile';
import { StateApi } from '../../api/state';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { UserState } from '../../types';
import { MediaImage } from '../common/MediaImage';
import { DateOfBirthField } from './DateOfBirthField';
import { BirthTimePlaceFields, birthDetailsPayload, type BirthTimePlace } from './BirthTimePlaceFields';
import { ageOn, onboardingGateMessage, validateDob } from '../../utils/dob';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { errorStatus } from '../../lib/api-errors';
import { toUserProfile } from '../../lib/profile-model';
import { UiElement, trackProps, trackScreenView, Screen } from '../../lib/analytics/analytics';

/** Step order, so the label and the progress bar cannot disagree about where the user is. */
const STEPS = ['basics', 'photo'] as const;
type Step = (typeof STEPS)[number];

/**
 * Chat-only onboarding (OneHookBackend/docs/chat-only-profiles.md §7.1, G1).
 *
 * Every account starts with a CHAT profile only: display name, date of birth (18+, immutable) and an
 * optional avatar. That is `PUT /profile/chat`, then `POST /state/complete-onboarding`, and the member
 * lands in a Messenger-only app. Matching is opt-in later, from Settings: the matching profile (photos,
 * prompts, voice, preferences) is built there, never here.
 */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, logout } = useAppStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Analytics: the onboarding wizard was shown (one screen_view on mount).
  useEffect(() => {
    trackScreenView(Screen.ONBOARDING);
  }, []);

  const [displayName, setDisplayName] = useState(currentUser?.displayName || currentUser?.name || '');
  // Date of birth, captured once and never editable afterwards (the backend derives age from it).
  // A member returning to the wizard with a real date already stored keeps it, locked.
  const [storedDob, setStoredDob] = useState(
    currentUser?.birthDetails?.date && !currentUser.birthDetails.provisional ? currentUser.birthDetails.date : ''
  );
  const [birthDate, setBirthDate] = useState(storedDob);
  const [dobConfirmed, setDobConfirmed] = useState(Boolean(storedDob));
  const age = birthDate ? ageOn(birthDate) ?? 0 : 0;
  const [birthExtra, setBirthExtra] = useState<BirthTimePlace>({});
  const [avatarKey, setAvatarKey] = useState(currentUser?.avatarKey || '');

  // Prefill from a chat profile that already exists (registration stores the display name; a member
  // who left the wizard keeps what they saved). A 404 just means there is nothing yet.
  useEffect(() => {
    let active = true;
    ProfileApi.getMine()
      .then((res) => {
        if (!active) return;
        const me = toUserProfile(res);
        setDisplayName((prev) => prev || me.displayName || '');
        setAvatarKey((prev) => prev || me.avatarKey || '');
        const real = me.birthDetails?.date && !me.birthDetails.provisional ? me.birthDetails.date : '';
        if (real) {
          setStoredDob(real);
          setBirthDate(real);
          setDobConfirmed(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getResolvedUserId = async () => {
    let uid = currentUser?.id;
    if (!uid || uid === 'me') {
      const { fetchAuthSession } = await import('aws-amplify/auth');
      const session = await fetchAuthSession();
      uid =
        (session.tokens?.idToken?.payload?.sub as string) ||
        (session.tokens?.accessToken?.payload?.sub as string) ||
        '';
    }
    return uid;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // A chat avatar: purpose CHAT, so turning matching off later never touches it.
      setAvatarKey(await ProfileApi.uploadMedia(file, 'CHAT'));
      showToast('Photo added.', 'success');
    } catch (err: any) {
      console.error('Error adding photo:', err);
      showToast(err?.message || 'Could not upload image. Please try again.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleNextFromBasics = () => {
    if (!displayName.trim()) {
      showToast('Please enter your name.', 'error');
      return;
    }
    const dobError = validateDob(birthDate);
    if (dobError) {
      showToast(dobError, 'error');
      return;
    }
    if (!dobConfirmed) {
      showToast('Please confirm your date of birth. It cannot be changed later.', 'error');
      return;
    }
    setStep('photo');
  };

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      const uid = await getResolvedUserId();
      const birthDetails = birthDetailsPayload(birthDate, birthExtra);
      await ProfileApi.upsertChat({
        displayName: displayName.trim(),
        // Age is derived by the server from birthDetails.date.
        birthDetails,
        ...(avatarKey ? { avatarKey } : {}),
      });
      // Completing onboarding is NOT optional: it transitions the authoritative user state
      // ONBOARDING → AVAILABLE in the State service. Until that happens the member cannot connect with
      // anyone (the hook transaction requires current_state IN (AVAILABLE, HOOKED)). Surface a failure
      // and keep the member in the wizard so they can retry.
      await StateApi.completeOnboarding();

      setCurrentUser({
        userId: uid,
        id: uid,
        name: displayName.trim(),
        displayName: displayName.trim(),
        age,
        avatarKey: avatarKey || undefined,
        birthDetails,
        birthDateOnFile: true,
        photos: [],
        currentState: UserState.AVAILABLE,
      });

      showToast('Welcome to OneHook!', 'success');
      navigate('/app', { replace: true });
    } catch (err) {
      // Distinguish "your account is still finishing setup" from a genuine save failure. A 409 here
      // means only that the caller's sign-in credentials were not live in Cognito yet — nothing the
      // user entered is wrong, and nothing is lost. StateApi.completeOnboarding already retried with
      // backoff, so reaching this branch means it persisted (typically an Identity outage).
      const status = errorStatus(err);
      const message = (err as { message?: string })?.message ?? '';
      const gate = status === 409 ? onboardingGateMessage(message) : null;
      if (gate) {
        showToast(gate, 'error');
      } else if (status === 400 && /birthDetails|at least 18/.test(message)) {
        showToast(message, 'error');
        setStep('basics');
      } else if (status === 409) {
        showToast(
          'Your account is still finishing setup — your profile is saved. Please tap Finish again in a few moments.',
          'error'
        );
      } else {
        showToast('Could not save profile. Please try again.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSkipAndLogout = async () => {
    setLoggingOut(true);
    try {
      await getCognitoAuth().logout();
      logout();
      showToast('You can continue your profile anytime. See you soon!', 'info');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Logout error during onboarding skip:', err);
      showToast('Could not sign out. Please try again.', 'error');
    } finally {
      setLoggingOut(false);
    }
  };

  if (saving || loggingOut) return <LoadingSpinner fullScreen />;

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center p-6 sm:p-12">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
        aria-label="Choose a profile photo"
      />

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full bg-white border border-border p-8 sm:p-12 space-y-10 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-4 flex-1">
              <span className="text-[11px] uppercase tracking-[0.4em] font-black text-accent">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              <h1 className="text-4xl sm:text-5xl font-serif italic tracking-tighter uppercase">
                {step === 'basics' && 'Create Your Profile'}
                {step === 'photo' && 'Add a Photo'}
              </h1>
              <div
                className="flex items-center gap-1.5"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                aria-valuenow={stepIndex + 1}
                aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}
              >
                {STEPS.map((s, index) => (
                  <span
                    key={s}
                    className={`h-[3px] flex-1 transition-colors ${index <= stepIndex ? 'bg-accent' : 'bg-border'}`}
                  />
                ))}
              </div>
              <p className="text-sm opacity-60 italic">
                This is what the people you connect with see. Matching is optional: you can turn it on
                later in Settings.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkipAndLogout}
              disabled={loggingOut}
              {...trackProps(UiElement.ONBOARDING_SKIP_SIGN_OUT)}
              className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-accent transition-all disabled:opacity-40"
              title="Sign out and continue later"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline font-bold uppercase tracking-wider">Skip for now</span>
            </button>
          </div>
        </div>

        {/* ── STEP 1: NAME AND DATE OF BIRTH ── */}
        {step === 'basics' && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-[1.5fr_1fr] gap-6">
              <Field label="Display Name *" htmlFor="onboarding-display-name">
                <input
                  id="onboarding-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                  className="field-input"
                  placeholder="How you want to be introduced"
                  autoComplete="nickname"
                />
              </Field>
              {storedDob ? (
                <Field label="Date of birth">
                  <div className="field-input opacity-80">{storedDob} (age {age})</div>
                </Field>
              ) : null}
            </div>

            {!storedDob && (
              <DateOfBirthField
                value={birthDate}
                onChange={setBirthDate}
                confirmed={dobConfirmed}
                onConfirmedChange={setDobConfirmed}
              />
            )}

            <details className="group">
              <summary className="cursor-pointer text-sm font-bold">Add birth time and place (optional)</summary>
              <div className="pt-3">
                <BirthTimePlaceFields value={birthExtra} onChange={setBirthExtra} />
              </div>
            </details>

            <button
              onClick={handleNextFromBasics}
              {...trackProps(UiElement.ONBOARDING_NEXT, { value: 'basics' })}
              className="w-full py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 transition-all shadow-md mt-6"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP 2: OPTIONAL AVATAR ── */}
        {step === 'photo' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Optional. Your photo is checked before anyone else sees it.
            </p>
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                {...trackProps(UiElement.ONBOARDING_PHOTO_ADD)}
                aria-label={avatarKey ? 'Change profile photo' : 'Add a profile photo'}
                className="relative w-32 h-32 rounded-full border-2 border-dashed border-border hover:border-accent overflow-hidden flex items-center justify-center bg-bg/30 transition-all"
              >
                {uploading ? (
                  <LoadingSpinner />
                ) : avatarKey ? (
                  <MediaImage src={avatarKey} alt="Your profile photo" className="w-full h-full object-cover" />
                ) : (
                  <Plus className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
              {avatarKey && !uploading && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  {...trackProps(UiElement.ONBOARDING_PHOTO_REMOVE)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest border border-border hover:border-red-600 hover:text-red-600 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                </button>
              )}
            </div>

            <div className="p-4 bg-accent/5 border border-accent/20 flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
              <MessageCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                After this you can add someone you know by their username. When they accept, you&rsquo;re
                hooked and can chat, end-to-end encrypted.
              </span>
            </div>

            {confirmRemove && (
              <div
                className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-6"
                onClick={() => setConfirmRemove(false)}
                data-track-exempt="backdrop: click-away that cancels the remove-photo dialog."
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="remove-photo-title"
                  className="max-w-sm w-full bg-white border border-border p-6 space-y-4 shadow-2xl rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                  data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
                >
                  <h3 id="remove-photo-title" className="text-base font-black uppercase tracking-widest">
                    Remove this photo?
                  </h3>
                  <p className="text-xs opacity-60 leading-relaxed">You can add one again later.</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(false)}
                      {...trackProps(UiElement.ONBOARDING_PHOTO_REMOVE_CONFIRM, { action: 'dismiss' })}
                      className="flex-1 py-2.5 border border-border text-xs font-bold uppercase tracking-widest hover:bg-surface-hover transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarKey('');
                        setConfirmRemove(false);
                      }}
                      {...trackProps(UiElement.ONBOARDING_PHOTO_REMOVE_CONFIRM)}
                      className="flex-1 py-2.5 bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setStep('basics')}
                {...trackProps(UiElement.ONBOARDING_BACK)}
                className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={finishOnboarding}
                disabled={uploading}
                {...trackProps(UiElement.ONBOARDING_FINISH)}
                className="flex-1 py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 disabled:opacity-40 transition-all shadow-md"
              >
                {avatarKey ? 'Finish & Enter OneHook' : 'Skip photo & Enter OneHook'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block">
        {label}
      </label>
      {children}
    </div>
  );
}
