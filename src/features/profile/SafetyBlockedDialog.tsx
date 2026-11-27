/**
 * Safety & Blocked Users list + Unblock flow (mirrors iOS `SafetyBlockedViewController.swift`).
 */
import { useEffect, useState } from 'react';
import { ShieldOff, Unlock, X } from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useOptionalToast } from '../../components/common/Toast';
import { StateApi } from '../../api/state';
import { usePartnerProfiles } from '../../hooks/use-api';
import { MediaImage } from '../../components/common/MediaImage';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import type { BlockView } from '../../types';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

export function SafetyBlockedDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useOptionalToast();
  const [blocks, setBlocks] = useState<BlockView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<BlockView | null>(null);
  const [unblocking, setUnblocking] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await StateApi.listBlocks();
      setBlocks(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load blocked accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const blockedIds = blocks.map((b) => b.blockedUserId);
  const profiles = usePartnerProfiles(blockedIds);

  const performUnblock = async () => {
    if (!confirmUnblock) return;
    const target = confirmUnblock;
    setUnblocking(true);
    try {
      await StateApi.unblockUser(target.blockedUserId);
      setBlocks((prev) => prev.filter((b) => b.blockedUserId !== target.blockedUserId));
      setConfirmUnblock(null);
      showToast('Account unblocked.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not unblock user.', 'error');
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <>
      <ModalDialog open={open} onClose={onClose} labelledBy="safety-blocked-title" className="max-w-md w-full">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
          <h2 id="safety-blocked-title" className="text-base font-bold text-text flex items-center gap-2">
            <ShieldOff className={`${ICON_SECTION.modalHeader.icon} text-accent`} aria-hidden="true" /> Blocked accounts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close blocked accounts"
            {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
            className={ICON_SECTION.modalHeader.button}
          >
            <X className={ICON_SECTION.modalHeader.icon} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : error ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-xs text-red-500">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                {...trackProps(UiElement.PROFILE_RETRY)}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : blocks.length === 0 ? (
            <div className="py-8 text-center space-y-1">
              <p className="text-sm font-medium text-text">No blocked accounts</p>
              <p className="text-xs text-text-secondary">
                People you block cannot send you hook requests or interact with you.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {blocks.map((b) => {
                const p = profiles[b.blockedUserId];
                const name = b.displayName || p?.name || b.blockedUserId;
                return (
                  <li
                    key={b.blockedUserId}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-full overflow-hidden border border-border bg-bg shrink-0">
                        <MediaImage
                          src={p?.avatarKey || FALLBACK_PROFILE_IMAGE}
                          alt={name}
                          className="w-full h-full object-cover"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{name}</p>
                        <p className="text-[11px] text-text-muted">
                          Blocked {new Date(b.createdAt * 1000).toLocaleDateString()}
                          {b.reason ? ` · ${b.reason.replace(/_/g, ' ').toLowerCase()}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmUnblock(b)}
                      // TODO(telemetry-parity): switch to UiElement.SETTINGS_UNBLOCK_USER once enabled on web.
                      data-track-exempt="disabled: pending telemetry web parity enablement for settings.unblock_user"
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface-hover inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Unlock className="w-3 h-3" /> Unblock
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ModalDialog>

      <ModalDialog
        open={Boolean(confirmUnblock)}
        onClose={() => setConfirmUnblock(null)}
        label="Unblock user?"
        className="max-w-sm"
      >
        <div className="p-5 space-y-4">
          <h3 className="text-base font-bold text-text">
            Unblock{' '}
            {confirmUnblock
              ? confirmUnblock.displayName || profiles[confirmUnblock.blockedUserId]?.name || 'this user'
              : ''}
            ?
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            They will be able to find you in Discover and send you a hook request again. Previous chats remain cleared.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              disabled={unblocking}
              onClick={() => setConfirmUnblock(null)}
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={unblocking}
              onClick={() => void performUnblock()}
              // TODO(telemetry-parity): switch to UiElement.SETTINGS_UNBLOCK_CONFIRM once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for settings.unblock_confirm"
              className="px-4 py-2 rounded-xl bg-accent text-bg text-xs font-semibold cursor-pointer"
            >
              {unblocking ? 'Unblocking…' : 'Unblock'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
}
