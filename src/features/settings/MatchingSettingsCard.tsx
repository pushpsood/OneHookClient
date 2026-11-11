import { useEffect, useState } from 'react';
import { AlertTriangle, Heart } from 'lucide-react';
import type { UserProfile, UserStateSnapshot } from '../../types';
import { useToast } from '../../components/common/Toast';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { MATCHING_COPY, draftNotice, gapCopy, useMatchingMode } from './matching-mode';

/**
 * Settings → Matching (docs/chat-only-profiles.md §12). Turning matching on builds the matching profile
 * (in Profile) and then enables it, listing whatever the profile still lacks; turning it off asks for
 * confirmation and explains that only the chats are kept and that everything comes back if matching is
 * turned on again.
 */
export function MatchingSettingsCard({
  user,
  userState,
  onChanged,
  onOpenMatchingProfile,
}: {
  user: UserProfile;
  userState: UserStateSnapshot | null;
  /** Re-read the state and profile after a mode change. */
  onChanged: () => Promise<void> | void;
  onOpenMatchingProfile?: () => void;
}) {
  const { showToast } = useToast();
  const { busy, gaps, enable, disable } = useMatchingMode(onChanged);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const status = userState?.matching.status ?? 'OFF';
  const hasDraft = Boolean(user.matchingStatus);

  const turnOn = async () => {
    setMessage(null);
    const result = await enable();
    if (result.ok) showToast('Matching is on. Discover is ready for you.', 'success');
    else setMessage(result.message);
  };

  const turnOff = async () => {
    const ok = await disable();
    setConfirmOpen(false);
    if (ok) {
      showToast(
        status === 'ON' ? 'Matching is turning off. Your chats are not affected.' : 'Your matching draft is being removed.',
        'info'
      );
    } else {
      showToast("We couldn't turn matching off. Please try again.", 'error');
    }
  };

  // Escape closes the confirmation, like every other dialog here.
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirmOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen]);

  return (
    <div className="bg-surface-card border border-border p-6 rounded-2xl space-y-4" data-testid="matching-settings">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-text flex items-center gap-2">
            <Heart className="w-4 h-4 text-accent" aria-hidden="true" />
            {status === 'ON' ? MATCHING_COPY.onTitle : status === 'ERASING' ? MATCHING_COPY.erasingTitle : MATCHING_COPY.offTitle}
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed max-w-md">
            {status === 'ON'
              ? MATCHING_COPY.onBody
              : status === 'ERASING'
                ? MATCHING_COPY.erasingBody
                : MATCHING_COPY.offBody}
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-text-secondary">
          {status === 'ON' ? 'On' : status === 'ERASING' ? 'Turning off' : 'Off'}
        </span>
      </div>

      {status === 'ON' && userState?.discoveryPaused && (
        <p className="text-xs text-text-secondary">
          Discover is paused right now: you have as many hooks as your plan allows.
        </p>
      )}

      {status === 'OFF' && hasDraft && (
        <p className="text-xs text-text-secondary leading-relaxed" data-testid="draft-notice">
          {draftNotice(user.draftExpiresAt)}
        </p>
      )}

      {gaps.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-600 space-y-0.5" aria-label="What your matching profile still needs">
          {gaps.map((g) => (
            <li key={g}>{gapCopy(g)}</li>
          ))}
        </ul>
      )}
      {message && gaps.length === 0 && (
        <p className="text-xs text-red-600" role="alert">
          {message}
        </p>
      )}

      {status !== 'ERASING' && (
        <div className="flex flex-wrap gap-2">
          {status === 'OFF' && hasDraft && (
            <button
              type="button"
              onClick={() => void turnOn()}
              disabled={busy}
              {...trackProps(UiElement.SETTINGS_MATCHING_ENABLE)}
              className="py-2.5 px-4 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Turning on…' : 'Turn on matching'}
            </button>
          )}
          {onOpenMatchingProfile && (
            <button
              type="button"
              onClick={onOpenMatchingProfile}
              {...trackProps(UiElement.SETTINGS_MATCHING_PROFILE_OPEN)}
              className={`py-2.5 px-4 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                status === 'OFF' && !hasDraft
                  ? 'bg-accent text-bg hover:opacity-90'
                  : 'border border-border text-text hover:bg-surface-hover'
              }`}
            >
              {status === 'OFF' && !hasDraft ? 'Turn on matching' : 'Edit matching profile'}
            </button>
          )}
          {(status === 'ON' || hasDraft) && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              {...trackProps(UiElement.SETTINGS_MATCHING_DISABLE)}
              className="py-2.5 px-4 border border-border text-xs font-semibold rounded-xl text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {status === 'ON' ? 'Turn off matching' : 'Delete draft'}
            </button>
          )}
        </div>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setConfirmOpen(false)}
          data-track-exempt="backdrop: click-away that cancels the turn-off dialog; the Cancel control (settings.matching_disable_confirm dismiss) is tracked."
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="matching-off-title"
            aria-describedby="matching-off-body"
            className="max-w-md w-full bg-surface-card text-text border border-border p-8 space-y-5 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
              <h3 id="matching-off-title" className="text-xl font-bold text-text">
                {status === 'ON' ? MATCHING_COPY.disableDialogTitle : 'Delete your matching draft?'}
              </h3>
            </div>
            <p id="matching-off-body" className="text-xs text-text-secondary leading-relaxed">
              {status === 'ON'
                ? MATCHING_COPY.disableDialogBody
                : 'Your unfinished matching profile and its photos are erased. Your chats and hooks are not affected.'}
            </p>
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                {...trackProps(UiElement.SETTINGS_MATCHING_DISABLE_CONFIRM, { action: 'dismiss' })}
                className="flex-1 py-3 border border-border text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
              >
                {status === 'ON' ? 'Keep matching' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void turnOff()}
                disabled={busy}
                {...trackProps(UiElement.SETTINGS_MATCHING_DISABLE_CONFIRM)}
                className="flex-1 py-3 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 cursor-pointer"
              >
                {busy ? 'Turning off…' : status === 'ON' ? MATCHING_COPY.disableConfirm : 'Delete draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
