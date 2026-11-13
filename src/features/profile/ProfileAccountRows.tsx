import { useEffect, useState } from 'react';
import { ChevronRight, Heart, ShieldCheck } from 'lucide-react';
import { AccountRecoveryDialog } from '../../components/profile/AccountRecoveryDialog';
import { readRecoveryStatus, type RecoveryStatus } from '../../lib/account-recovery';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { MATCHING_INTRO_COPY } from '../matching/MatchingIntroView';

/**
 * The rows right under the profile editor: Turn on matching (only while matching is not ON; it opens
 * the matching profile builder, like the Matching tab) and Account recovery (always), with its status
 * when it can be read.
 */
export function ProfileAccountRows({
  userId,
  showMatching,
  erasing,
  onOpenMatching,
}: {
  userId?: string;
  /** Matching is not ON. */
  showMatching: boolean;
  /** Matching is ERASING: turning it on waits until that finishes. */
  erasing: boolean;
  onOpenMatching: () => void;
}) {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readRecoveryStatus(userId).then((status) => {
      if (active) setRecoveryStatus(status);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const rowClass =
    'w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
    <div className="border border-border rounded-2xl divide-y divide-border overflow-hidden bg-surface-card text-text" data-testid="profile-account-rows">
      {showMatching && (
        <button
          type="button"
          onClick={onOpenMatching}
          disabled={erasing}
          {...trackProps(UiElement.PROFILE_MATCHING_OPEN)}
          className={rowClass}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Heart className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{MATCHING_INTRO_COPY.turnOn}</span>
              {erasing && <span className="block text-xs text-text-secondary">{MATCHING_INTRO_COPY.erasing}</span>}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 opacity-40 shrink-0" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setRecoveryOpen(true)}
        {...trackProps(UiElement.PROFILE_RECOVERY_OPEN)}
        className={rowClass}
      >
        <span className="flex items-center gap-3 min-w-0">
          <ShieldCheck className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Account recovery</span>
            {recoveryStatus && (
              <span className="block text-xs text-text-secondary">
                {recoveryStatus === 'on' ? 'On' : 'Not set up'}
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 opacity-40 shrink-0" aria-hidden="true" />
      </button>
    </div>
    <AccountRecoveryDialog
      userId={userId}
      open={recoveryOpen}
      status={recoveryStatus}
      onClose={() => setRecoveryOpen(false)}
      onStatusChange={setRecoveryStatus}
    />
    </>
  );
}
