import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Camera, Trash2, MessageCircle } from 'lucide-react';
import type { UserProfile } from '../../types';
import { ProfileApi } from '../../api/profile';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../../components/common/Toast';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { MediaImage } from '../../components/common/MediaImage';
import { ModerationBadge } from '../../components/ui/ModerationBadge';
import { DateOfBirthField, LockedDateOfBirth } from '../../components/onboarding/DateOfBirthField';
import { DOB_LOCKED_HINT, DOB_PROVISIONAL_HINT, ageOn, validateDob } from '../../utils/dob';
import { Screen, UiElement, trackProps } from '../../lib/analytics/analytics';

/**
 * The chat profile (docs/chat-only-profiles.md R1): display name, date of birth (18+, immutable) and an
 * optional avatar. Every account has one, and it is all a hook partner — or the recipient of a request —
 * ever sees. Saved with `PUT /profile/chat`; the avatar is media of purpose CHAT, so turning matching
 * off never touches it. Birth time and place are not asked for here: they belong to the matching
 * profile (ProfileView's matching editor).
 */
export function ChatProfileCard({ user, onSaved }: { user: UserProfile; onSaved?: () => unknown }) {
  const { setCurrentUser } = useAppStore();
  const { showToast } = useToast();
  const fieldStatus = user.fieldModerationStatus || {};
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || user.name || '');

  useEffect(() => {
    setDisplayName(user.displayName || user.name || '');
  }, [user.displayName, user.name]);

  // Date of birth is read-only. The one exception: a member whose date is a provisional estimate may
  // enter their real date ONCE (the server then locks it).
  const dobIsProvisional = Boolean(user.birthDetails?.provisional);
  const lockedDob = user.birthDetails?.date && !dobIsProvisional ? user.birthDetails.date : '';
  const [realDob, setRealDob] = useState('');
  const [realDobConfirmed, setRealDobConfirmed] = useState(false);
  const realDobReady = dobIsProvisional && realDob !== '' && realDobConfirmed && !validateDob(realDob);
  const displayAge = (realDobReady ? ageOn(realDob) : null) ?? user.age;
  // birthDetails is sent only to replace a provisional date, and then carries only the date.
  const birthDetailsToSend = realDobReady ? { date: realDob } : undefined;

  const uploadAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const key = await ProfileApi.uploadMedia(file, 'CHAT');
      await ProfileApi.upsertChat({ avatarKey: key });
      setCurrentUser({
        ...user,
        avatarKey: key,
        fieldModerationStatus: { ...fieldStatus, avatarKey: 'PENDING', [key]: 'PENDING' },
      });
      showToast('Photo uploaded — screening for safety…', 'success');
      void onSaved?.();
    } catch (err) {
      showToast((err as Error)?.message || 'Failed to upload photo.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    try {
      // An explicit "" clears the avatar (an omitted field would keep it).
      await ProfileApi.upsertChat({ avatarKey: '' });
      setCurrentUser({ ...user, avatarKey: undefined });
      showToast('Photo removed.', 'success');
    } catch {
      showToast('Could not remove photo.', 'error');
    }
  };

  const save = async () => {
    const name = displayName.trim();
    if (!name) {
      showToast('Please enter your name.', 'error');
      return;
    }
    setSaving(true);
    try {
      await ProfileApi.upsertChat({
        displayName: name,
        ...(birthDetailsToSend ? { birthDetails: birthDetailsToSend } : {}),
      });
      const nameChanged = name !== (user.displayName || '');
      setCurrentUser({
        ...user,
        name,
        displayName: name,
        age: displayAge,
        ...(birthDetailsToSend ? { birthDetails: birthDetailsToSend, birthDateOnFile: true } : {}),
        fieldModerationStatus: nameChanged ? { ...fieldStatus, displayName: 'PENDING' } : fieldStatus,
      });
      showToast('Profile updated.', 'success');
      void onSaved?.();
    } catch (err) {
      showToast((err as Error)?.message || 'Profile save failed — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6" aria-labelledby="chat-profile-title">
      <input
        type="file"
        ref={fileInputRef}
        onChange={uploadAvatar}
        accept="image/*"
        className="hidden"
        aria-label="Choose a profile photo"
      />
      <div>
        <h2 id="chat-profile-title" className="text-[10px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> Your chat profile
        </h2>
        <p className="mt-1 text-xs opacity-60 leading-relaxed">
          Your name, age and photo. Only the people you are hooked with see it, and people whose
          request you can still accept.
        </p>
      </div>

      <div className="flex items-center gap-5">
        <span className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-surface shrink-0">
          {user.avatarKey ? (
            <MediaImage src={user.avatarKey} alt="Your profile photo" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-text-muted">
              <Camera className="w-7 h-7" aria-hidden="true" />
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <LoadingSpinner />
            </span>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            {...trackProps(UiElement.PROFILE_EDIT_PHOTO_ADD, { context: Screen.PROFILE_EDIT })}
            className="py-1.5 px-4 bg-accent text-bg text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {user.avatarKey ? 'Change photo' : 'Add photo'}
          </button>
          {user.avatarKey && (
            <button
              type="button"
              onClick={() => void removeAvatar()}
              disabled={uploading}
              {...trackProps(UiElement.PROFILE_EDIT_PHOTO_REMOVE, { context: Screen.PROFILE_EDIT })}
              className="py-1.5 px-3 border border-border text-xs font-semibold rounded-lg hover:bg-surface-hover transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
            </button>
          )}
          <ModerationBadge status={fieldStatus.avatarKey} showLabel className="text-[10px]" />
        </div>
      </div>

      <Field label="Display Name *" htmlFor="chat-display-name" badge={<ModerationBadge status={fieldStatus.displayName} showLabel />}>
        <input
          id="chat-display-name"
          value={displayName}
          maxLength={100}
          onChange={(e) => setDisplayName(e.target.value)}
          className="field-input"
        />
      </Field>

      {lockedDob ? (
        <Field label="Date of birth">
          <LockedDateOfBirth isoDate={lockedDob} hint={DOB_LOCKED_HINT} />
        </Field>
      ) : dobIsProvisional ? (
        <div className="space-y-2">
          <p className="text-sm font-bold">{DOB_PROVISIONAL_HINT}</p>
          <DateOfBirthField
            value={realDob}
            onChange={setRealDob}
            confirmed={realDobConfirmed}
            onConfirmedChange={setRealDobConfirmed}
          />
        </div>
      ) : null}

      <Field label="Age">
        <div className="field-input opacity-80" aria-readonly>
          {displayAge ?? '—'}
        </div>
      </Field>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        {...trackProps(UiElement.PROFILE_EDIT_SAVE, { context: Screen.PROFILE_EDIT })}
        className="w-full py-3 bg-accent text-bg text-xs font-black uppercase tracking-[0.3em] hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
      >
        {saving ? 'Saving…' : 'Save chat profile'}
      </button>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  badge,
  children,
}: {
  label: string;
  htmlFor?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">
          {label}
        </label>
        {badge}
      </div>
      {children}
    </div>
  );
}
