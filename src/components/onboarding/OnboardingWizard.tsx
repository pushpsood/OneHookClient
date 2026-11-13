import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plus, Trash2, LogOut, MessageCircle, Loader, Check } from 'lucide-react';
import { ProfileApi } from '../../api/profile';
import { StateApi } from '../../api/state';
import { IdentityApi } from '../../api/identity';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { UserState } from '../../types';
import { MediaImage } from '../common/MediaImage';
import { DateOfBirthField } from './DateOfBirthField';
import { ageOn, onboardingGateMessage, validateDob } from '../../utils/dob';
import { getCognitoAuth } from '../../lib/cognito-auth';
import { errorStatus } from '../../lib/api-errors';
import { toUserProfile } from '../../lib/profile-model';
import { UiElement, trackProps, trackScreenView, trackUi, Screen } from '../../lib/analytics/analytics';
import {
  PASSWORD_RULES_COPY,
  canContinueUsername,
  checkFromError,
  checkFromResponse,
  isProviderCancel,
  normalizeUsername,
  onboardingNextValue,
  onboardingSteps,
  passwordError,
  setPasswordFailure,
  stepAfter,
  stepBefore,
  updateUsernameFailure,
  usernameCheckMessage,
  usernameFormatError,
  type OnboardingStep,
  type UsernameCheck,
} from '../../lib/account-setup';
import { RECOVERY_COPY, recoveryDepsFor, setUpAccountRecovery } from '../../lib/account-recovery';
import { linkGoogleAccount } from '../../lib/social-link';

type Step = OnboardingStep;

const STEP_TITLES: Record<Step, string> = {
  basics: 'Create Your Profile',
  photo: 'Add a Photo',
  username: 'Your Username',
  password: 'Add a Password',
  social: 'Sign-in Options',
  recovery: 'Account Recovery',
};

export const ONBOARDING_COPY = {
  username:
    'This is your username. People can find and add you with it. You can change it now or later.',
  password:
    'Add a password (optional). Then you can also sign in with your phone, email or username and a password.',
  social: 'Link Apple or Google (optional) so you can sign in with one tap.',
  recovery:
    'A device you’re signed in on can pass your messages to a new one. Add a passkey so you can also restore them with no other device at hand. You can do this later from Profile > Account recovery.',
} as const;

/**
 * Chat-only onboarding (OneHookBackend/docs/chat-only-profiles.md §7.1, G1).
 *
 * Every account starts with a CHAT profile only: display name, date of birth (18+, immutable) and an
 * optional avatar, saved with `PUT /profile/chat` when the photo step is done. Then the account steps:
 * the username (prefilled with the random one from sign-up), an optional first password (skipped when
 * GetUser says one exists), optional Google linking and optional account recovery. Last comes
 * `POST /state/complete-onboarding`, and the member lands in a Messenger-only app. Every step is
 * idempotent, so a member who closes the app part-way resumes without anything breaking. Matching is
 * opt-in later: the matching profile (photos, prompts, voice, preferences) is built there, never here.
 */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, logout } = useAppStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);
  /** A call made by the current step (saving the chat profile, the username, the password, ...). */
  const [stepBusy, setStepBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  /** Completing onboarding failed; the recovery step offers Finish again. */
  const [finishError, setFinishError] = useState<string | null>(null);

  // From GetUser: the member's current username, whether a password exists, whether Google is linked.
  const [hasPassword, setHasPassword] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');
  const [username, setUsername] = useState('');
  const [lastCheckedUsername, setLastCheckedUsername] = useState('');
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck>({ kind: 'idle' });
  const checkSeq = useRef(0);
  const usernameContinueRef = useRef<HTMLButtonElement | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [googleLinked, setGoogleLinked] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const steps = onboardingSteps(hasPassword);
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

  // Prefill the account steps from GetUser: the username every member gets at sign-up, whether a
  // password was chosen already (then the password step is skipped) and whether Google is linked.
  // Without it the steps still work: UpdateUsername and SetPassword are the authorities.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const uid = await getResolvedUserId();
        if (!uid) return;
        const me = await IdentityApi.getUser(uid);
        if (!active) return;
        const name = normalizeUsername(me.username ?? '');
        setCurrentUsername(name);
        setUsername((prev) => prev || name);
        setLastCheckedUsername((prev) => prev || name);
        setHasPassword(Boolean(me.hasPassword));
        setGoogleLinked(Boolean(me.googleId));
      } catch {
        /* nothing to prefill */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A step that drops out (the password step once GetUser says one exists) is never shown.
  useEffect(() => {
    if (step === 'password' && !steps.includes('password')) setStep('social');
  }, [steps, step]);

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
    advance('basics');
  };

  const goTo = (next: Step | null) => {
    setStepError(null);
    if (next) setStep(next);
  };

  /** Moves past `from`; past the last step the wizard finishes. */
  const advance = (from: Step) => {
    const next = stepAfter(steps, from);
    if (next) goTo(next);
    else void finishOnboarding();
  };

  const back = (from: Step) => goTo(stepBefore(steps, from));

  /**
   * Saves the chat profile when the photo step is done, so a member who closes the app later in the
   * wizard keeps it (the prefill above reads it back). `PUT /profile/chat` is idempotent.
   */
  const handleNextFromPhoto = async () => {
    setStepBusy(true);
    setStepError(null);
    try {
      await ProfileApi.upsertChat({
        displayName: displayName.trim(),
        // Age is derived by the server from birthDetails.date.
        birthDetails: { date: birthDate },
        ...(avatarKey ? { avatarKey } : {}),
      });
      // The date of birth is on file now and cannot change.
      setStoredDob(birthDate);
      setDobConfirmed(true);
      advance('photo');
    } catch (err) {
      const status = errorStatus(err);
      const message = (err as { message?: string })?.message ?? '';
      if (status === 400 && /birthDetails|at least 18/.test(message)) {
        showToast(message, 'error');
        setStep('basics');
      } else {
        showToast('Could not save profile. Please try again.', 'error');
      }
    } finally {
      setStepBusy(false);
    }
  };

  // ── Username ──
  /** The check shown applies only to the value it was made for; a new value is unchecked. */
  const shownCheck: UsernameCheck =
    normalizeUsername(username) === lastCheckedUsername ? usernameCheck : { kind: 'idle' };

  /** On blur: check the value once, locally first, then with CheckUsernameAvailability. */
  const checkUsername = async () => {
    const value = normalizeUsername(username);
    setUsername(value);
    if (!value || value === lastCheckedUsername) return;
    setLastCheckedUsername(value);
    const formatError = usernameFormatError(value);
    if (formatError) {
      setUsernameCheck({ kind: 'invalid', reason: formatError });
      return;
    }
    const seq = ++checkSeq.current;
    setUsernameCheck({ kind: 'checking' });
    try {
      const res = await IdentityApi.checkUsernameAvailability(value);
      if (seq === checkSeq.current) setUsernameCheck(checkFromResponse(res));
    } catch (err) {
      if (seq === checkSeq.current) setUsernameCheck(checkFromError(err));
    }
  };

  const handleNextFromUsername = async () => {
    const value = normalizeUsername(username);
    setUsername(value);
    const formatError = usernameFormatError(value);
    if (formatError) {
      setLastCheckedUsername(value);
      setUsernameCheck({ kind: 'invalid', reason: formatError });
      return;
    }
    if (currentUsername && value === currentUsername) {
      advance('username');
      return;
    }
    checkSeq.current += 1; // a check still in flight no longer applies
    setStepBusy(true);
    setStepError(null);
    try {
      const res = await IdentityApi.updateUsername(value);
      const saved = normalizeUsername(res.username ?? value);
      setCurrentUsername(saved);
      setUsername(saved);
      setLastCheckedUsername(saved);
      setUsernameCheck({ kind: 'current' });
      advance('username');
    } catch (err) {
      const failure = updateUsernameFailure(err);
      if (failure.kind === 'taken') {
        setLastCheckedUsername(value);
        setUsernameCheck({ kind: 'taken' });
      } else if (failure.kind === 'unchanged') {
        setCurrentUsername(value);
        advance('username');
      } else {
        setStepError(failure.message);
      }
    } finally {
      setStepBusy(false);
    }
  };

  // ── Password ──
  const handleNextFromPassword = async () => {
    const problem = passwordError(password, confirmPassword);
    if (problem) {
      setStepError(problem);
      return;
    }
    setStepBusy(true);
    setStepError(null);
    try {
      await IdentityApi.setPassword(password);
      passwordDone();
    } catch (err) {
      const failure = setPasswordFailure(err);
      if (failure.kind === 'already-set') passwordDone();
      else setStepError(failure.message);
    } finally {
      setStepBusy(false);
    }
  };

  /** The member has a password now: never offer the step again (Back from the next step skips it). */
  const passwordDone = () => {
    setPassword('');
    setConfirmPassword('');
    advance('password');
    setHasPassword(true);
  };

  const skipPassword = () => {
    setPassword('');
    setConfirmPassword('');
    advance('password');
  };

  // ── Sign-in options ──
  const handleLinkGoogle = async () => {
    setStepBusy(true);
    setStepError(null);
    try {
      await linkGoogleAccount();
      setGoogleLinked(true);
    } catch (err) {
      if (isProviderCancel(err)) {
        trackUi(UiElement.ONBOARDING_SOCIAL_LINK, { action: 'dismiss', value: 'google' });
      } else {
        setStepError(err instanceof Error && err.message ? err.message : 'Could not link Google. Please try again.');
      }
    } finally {
      setStepBusy(false);
    }
  };

  // ── Account recovery ──
  const handleSetUpRecovery = async () => {
    setStepBusy(true);
    setRecoveryMessage(null);
    try {
      const uid = await getResolvedUserId();
      const result = uid
        ? await setUpAccountRecovery(recoveryDepsFor(uid))
        : ({ kind: 'error', message: RECOVERY_COPY.failed } as const);
      if (result.kind === 'protected') {
        trackUi(UiElement.ONBOARDING_NEXT, { value: onboardingNextValue('recovery') });
        await finishOnboarding();
      } else if (result.kind === 'cancelled') {
        trackUi(UiElement.ONBOARDING_RECOVERY_SETUP, { action: 'dismiss' });
        setRecoveryMessage(RECOVERY_COPY.cancelled);
      } else if (result.kind === 'unsupported') {
        setRecoveryMessage(RECOVERY_COPY.unsupported);
      } else {
        setRecoveryMessage(result.message);
      }
    } finally {
      setStepBusy(false);
    }
  };

  /**
   * The very last call: `POST /state/complete-onboarding`. `fromButton` is the Finish retry button,
   * which reports itself; otherwise finishing is reported here.
   */
  const finishOnboarding = async (fromButton = false) => {
    if (!fromButton) trackUi(UiElement.ONBOARDING_FINISH);
    setSaving(true);
    setFinishError(null);
    try {
      const uid = await getResolvedUserId();
      const birthDetails = { date: birthDate };
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
      // Distinguish "your account is still finishing setup" from a genuine failure. A 409 here means
      // only that the caller's sign-in credentials were not live in Cognito yet — nothing the user
      // entered is wrong, and nothing is lost. StateApi.completeOnboarding already retried with
      // backoff, so reaching this branch means it persisted (typically an Identity outage).
      const status = errorStatus(err);
      const message = (err as { message?: string })?.message ?? '';
      const gate = status === 409 ? onboardingGateMessage(message) : null;
      const shown = gate
        ? gate
        : status === 409
          ? 'Your account is still finishing setup — your profile is saved. Please tap Finish again in a few moments.'
          : 'Could not finish setting up. Please try again.';
      showToast(shown, 'error');
      setFinishError(shown);
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

  const stepIndex = Math.max(0, steps.indexOf(step));

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
                Step {stepIndex + 1} of {steps.length}
              </span>
              <h1 className="text-4xl sm:text-5xl font-serif italic tracking-tighter uppercase">
                {STEP_TITLES[step]}
              </h1>
              <div
                className="flex items-center gap-1.5"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={stepIndex + 1}
                aria-label={`Step ${stepIndex + 1} of ${steps.length}`}
              >
                {steps.map((s, index) => (
                  <span
                    key={s}
                    className={`h-[3px] flex-1 transition-colors ${index <= stepIndex ? 'bg-accent' : 'bg-border'}`}
                  />
                ))}
              </div>
              {(step === 'basics' || step === 'photo') && (
                <p className="text-sm opacity-60 italic">
                  This is what the people you connect with see. Matching is optional: you can turn it on
                  later in Settings.
                </p>
              )}
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

            {/* No birth time or place here: they only refine traditional compatibility, so they
                belong to the matching profile, not to chat-only onboarding. */}

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

            <StepNav
              onBack={() => back('photo')}
              onNext={() => void handleNextFromPhoto()}
              nextValue={onboardingNextValue('photo')}
              nextLabel={avatarKey ? 'Continue' : 'Skip photo & continue'}
              disabled={uploading || stepBusy}
              busy={stepBusy}
            />
          </div>
        )}

        {/* ── STEP 3: USERNAME ── */}
        {step === 'username' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">{ONBOARDING_COPY.username}</p>
            <Field label="Username" htmlFor="onboarding-username">
              <div className="relative">
                <input
                  id="onboarding-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  onBlur={(e) => {
                    // Continue saves (and so checks) the value itself; checking here as well would
                    // disable the button under the click.
                    if (e.relatedTarget === usernameContinueRef.current) return;
                    void checkUsername();
                  }}
                  maxLength={30}
                  className="field-input pr-10"
                  placeholder="yourusername"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-describedby="onboarding-username-status"
                />
                {shownCheck.kind === 'checking' && (
                  <Loader
                    className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 opacity-60"
                    aria-label="Checking"
                  />
                )}
              </div>
            </Field>
            <p
              id="onboarding-username-status"
              role="status"
              className={`text-xs min-h-[1rem] ${shownCheck.kind === 'available' ? 'text-green-600' : 'text-red-600'}`}
            >
              {usernameCheckMessage(shownCheck)}
            </p>
            {stepError && <p className="text-xs text-red-600" role="alert">{stepError}</p>}
            <StepNav
              onBack={() => back('username')}
              onNext={() => void handleNextFromUsername()}
              nextValue={onboardingNextValue('username')}
              disabled={stepBusy || !canContinueUsername(normalizeUsername(username), shownCheck)}
              busy={stepBusy}
              nextRef={usernameContinueRef}
            />
          </div>
        )}

        {/* ── STEP 4: OPTIONAL PASSWORD ── */}
        {step === 'password' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">{ONBOARDING_COPY.password}</p>
            <p className="text-xs font-bold">{PASSWORD_RULES_COPY}</p>
            <div className="grid sm:grid-cols-2 gap-6">
              <Field label="Password" htmlFor="onboarding-password">
                <input
                  id="onboarding-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm password" htmlFor="onboarding-password-confirm">
                <input
                  id="onboarding-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="field-input"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show password
            </label>
            {stepError && <p className="text-xs text-red-600" role="alert">{stepError}</p>}
            <StepNav
              onBack={() => back('password')}
              onNext={() => void handleNextFromPassword()}
              nextValue={onboardingNextValue('password')}
              disabled={stepBusy || !password || !confirmPassword}
              busy={stepBusy}
              onSkip={skipPassword}
              skipValue="password"
            />
          </div>
        )}

        {/* ── STEP 5: OPTIONAL SIGN-IN OPTIONS (web links Google only; Apple linking is not built) ── */}
        {step === 'social' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">{ONBOARDING_COPY.social}</p>
            <button
              type="button"
              onClick={() => void handleLinkGoogle()}
              disabled={stepBusy || googleLinked}
              {...trackProps(UiElement.ONBOARDING_SOCIAL_LINK, { value: 'google' })}
              className="w-full py-4 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:border-accent transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {googleLinked ? (
                <>
                  <Check className="w-4 h-4 text-green-600" aria-hidden="true" /> Google · Linked
                </>
              ) : stepBusy ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" aria-hidden="true" /> Linking Google…
                </>
              ) : (
                'Link Google'
              )}
            </button>
            {stepError && <p className="text-xs text-red-600" role="alert">{stepError}</p>}
            <StepNav
              onBack={() => back('social')}
              onNext={() => advance('social')}
              nextValue={onboardingNextValue('social')}
              disabled={stepBusy}
              onSkip={() => advance('social')}
              skipValue="social"
            />
          </div>
        )}

        {/* ── STEP 6: OPTIONAL ACCOUNT RECOVERY, then finish ── */}
        {step === 'recovery' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">{ONBOARDING_COPY.recovery}</p>
            {recoveryMessage && (
              <p className="text-xs text-muted-foreground leading-relaxed" role="alert">
                {recoveryMessage}
              </p>
            )}
            {finishError ? (
              <div className="space-y-3">
                <p className="text-xs text-red-600" role="alert">{finishError}</p>
                <button
                  type="button"
                  onClick={() => void finishOnboarding(true)}
                  {...trackProps(UiElement.ONBOARDING_FINISH)}
                  className="w-full py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 transition-all shadow-md"
                >
                  Finish &amp; Enter OneHook
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSetUpRecovery()}
                  disabled={stepBusy}
                  {...trackProps(UiElement.ONBOARDING_RECOVERY_SETUP)}
                  className="w-full py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 disabled:opacity-40 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {stepBusy && <Loader className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  Set up recovery
                </button>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => back('recovery')}
                    disabled={stepBusy}
                    {...trackProps(UiElement.ONBOARDING_BACK)}
                    className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishOnboarding()}
                    disabled={stepBusy}
                    {...trackProps(UiElement.ONBOARDING_STEP_SKIP, { value: 'recovery' })}
                    className="flex-1 py-4 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all disabled:opacity-40"
                  >
                    Skip for now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Back / (Skip) / Continue for a step. Continue reports `onboarding.next` with the step completed, Skip
 * `onboarding.step_skip`.
 */
function StepNav({
  onBack,
  onNext,
  nextValue,
  nextLabel = 'Continue',
  disabled,
  busy,
  onSkip,
  skipValue,
  nextRef,
}: {
  onBack: () => void;
  onNext: () => void;
  nextValue: string;
  nextLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onSkip?: () => void;
  skipValue?: 'password' | 'social' | 'recovery';
  nextRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex gap-4 pt-4">
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        {...trackProps(UiElement.ONBOARDING_BACK)}
        className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all disabled:opacity-40"
      >
        Back
      </button>
      {onSkip && skipValue && (
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          {...trackProps(UiElement.ONBOARDING_STEP_SKIP, { value: skipValue })}
          className="py-4 px-6 border border-border text-xs font-bold uppercase tracking-[0.2em] hover:bg-bg transition-all disabled:opacity-40"
        >
          Skip
        </button>
      )}
      <button
        type="button"
        ref={nextRef}
        onClick={onNext}
        disabled={disabled}
        {...trackProps(UiElement.ONBOARDING_NEXT, { value: nextValue })}
        className="flex-1 py-4 bg-accent text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-accent/90 disabled:opacity-40 transition-all shadow-md flex items-center justify-center gap-2"
      >
        {busy && <Loader className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {nextLabel}
      </button>
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
