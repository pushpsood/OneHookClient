import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MOST_POPULAR_TIER } from '../../config/membership.config';
import { trackProps, type UiElementId } from '../../lib/analytics/analytics';

/** Name of the lowest tier that unlocks gated features (Super). */
export const UNLOCK_TIER_NAME = MOST_POPULAR_TIER.displayName;

/** Small lock shown next to a feature the member's tier does not include. */
export function LockIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return <Lock className={className} aria-hidden data-testid="lock-icon" />;
}

/**
 * Explains a locked feature and offers the plans. The feature stays visible everywhere so members can
 * see what a higher tier adds; tapping it opens this instead of doing nothing or hiding it.
 */
export function UpgradeDialog({
  feature,
  detail,
  element,
  onClose,
  tierName = UNLOCK_TIER_NAME,
}: {
  /** e.g. "Mr. OneHook picks". */
  feature: string;
  detail?: string;
  /** Telemetry element for the "See plans" / "Not now" buttons. */
  element: UiElementId;
  onClose: () => void;
  /** The lowest tier that unlocks this feature; Super unless the feature needs a higher one. */
  tierName?: string;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      data-track-exempt="backdrop: closing is tracked by the Not now button"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 space-y-3 text-text"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: only stops clicks inside the dialog from closing it"
        data-testid="upgrade-dialog"
      >
        <div className="flex items-center gap-2">
          <LockIcon className="w-4 h-4" />
          <h2 id="upgrade-dialog-title" className="text-sm font-black">
            {feature} is a {tierName} feature
          </h2>
        </div>
        <p className="text-xs text-text-secondary">
          {detail ?? `Upgrade to ${tierName} or above to unlock it.`}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            {...trackProps(element, { action: 'dismiss' })}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold cursor-pointer"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/pricing');
            }}
            {...trackProps(element)}
            className="px-3 py-1.5 rounded-lg bg-ig-blue text-white text-xs font-semibold cursor-pointer"
          >
            See plans
          </button>
        </div>
      </div>
    </div>
  );
}
