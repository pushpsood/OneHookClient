import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader, X } from 'lucide-react';
import { DeviceManagementCard } from './DeviceManagementCard';
import {
  RECOVERY_COPY,
  recoveryDepsFor,
  setUpAccountRecovery,
  type RecoveryStatus,
} from '../../lib/account-recovery';
import { Screen, UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';

/**
 * Profile > Account recovery. Shows whether recovery is on, offers to set it up (a passkey that can
 * unlock message history on a new device), and below that the same devices / restore panel Settings
 * has (DeviceManagementCard). Closing it is `profile.recovery_open` dismiss.
 */
export function AccountRecoveryDialog({
  userId,
  open,
  status,
  onClose,
  onStatusChange,
}: {
  userId?: string;
  open: boolean;
  /** Last known status, or null when unknown. */
  status: RecoveryStatus | null;
  onClose: () => void;
  onStatusChange: (status: RecoveryStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessage(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setUp = async () => {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await setUpAccountRecovery(recoveryDepsFor(userId));
      if (result.kind === 'protected') {
        onStatusChange('on');
      } else if (result.kind === 'cancelled') {
        trackUi(UiElement.SETTINGS_RECOVERY_SETUP, { action: 'dismiss', context: Screen.PROFILE });
        setMessage(RECOVERY_COPY.cancelled);
      } else if (result.kind === 'unsupported') {
        setMessage(RECOVERY_COPY.unsupported);
      } else {
        setMessage(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
      data-track-exempt="backdrop: click-away that closes account recovery; the Close control (profile.recovery_open dismiss) is tracked."
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-recovery-title"
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-surface-card text-text border border-border shadow-2xl rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
          <div className="space-y-1">
            <h2 id="account-recovery-title" className="text-lg font-bold">
              Account recovery
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed max-w-md">
              With recovery set up, your earlier messages can be restored when you sign in on another
              device or a new phone. You can sign in and chat on any device either way.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            {...trackProps(UiElement.PROFILE_RECOVERY_OPEN, { action: 'dismiss' })}
            className="p-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {status === 'on' ? (
            <p className="text-sm flex items-center gap-2 text-green-600" role="status">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Recovery is on.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-accent" aria-hidden="true" />
                {status === 'not-set-up' ? 'Recovery is not set up.' : 'Set up recovery with a passkey.'}
              </p>
              <button
                type="button"
                onClick={() => void setUp()}
                disabled={busy || !userId}
                {...trackProps(UiElement.SETTINGS_RECOVERY_SETUP, { context: Screen.PROFILE })}
                className="py-2.5 px-4 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center gap-2 cursor-pointer"
              >
                {busy && <Loader className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Set up recovery
              </button>
              {message && (
                <p className="text-xs text-text-secondary leading-relaxed" role="alert">
                  {message}
                </p>
              )}
            </div>
          )}

          <DeviceManagementCard />
        </div>
      </div>
    </div>
  );
}
