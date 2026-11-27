/**
 * "Let this hook go" & Hook-Forming Guard dialogs:
 *   - LetHookGoDialog: Archive chat (keeps read-only copy) vs Delete chat (permanent unhook).
 *   - HookFormingGuardDialog: Confirms forming a new hook (first-like-of-day, clearing pending
 *     requests, or archiving/releasing an active hook).
 */
import { useState } from 'react';
import { Archive, Trash2, X } from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { archiveHookAndSync, totalRemainingArchives, useArchiveStore } from '../../store/archive-store';
import { StateApi } from '../../api/state';
import { CurrentHookAction, type ArchiveAllowance } from '../../types';
import { useAppStore } from '../../store/app-store';
import { isMatchingOn } from '../../lib/app-mode';
import type { HookFormingPromptSpec } from '../../lib/hook-forming-guard';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

export function LetHookGoDialog({
  open,
  matchId,
  partnerName,
  onClose,
  onUnhooked,
  onArchived,
}: {
  open: boolean;
  matchId: string;
  partnerName: string;
  onClose: () => void;
  onUnhooked: () => Promise<void> | void;
  onArchived: () => Promise<void> | void;
}) {
  const userState = useAppStore((s) => s.userState);
  const matchingOn = isMatchingOn(userState);
  const allowance: ArchiveAllowance | undefined = useArchiveStore((s) => s.list?.allowance);
  const remaining = totalRemainingArchives(allowance);
  const [busy, setBusy] = useState<'archive' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canArchive = matchingOn && remaining > 0;

  const handleArchive = async () => {
    setBusy('archive');
    setError(null);
    try {
      await archiveHookAndSync(matchId);
      await onArchived();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive this conversation.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete');
    setError(null);
    try {
      await StateApi.releaseHook(matchId, 'USER_UNHOOKED');
      await onUnhooked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unhook right now.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="let-hook-go-title" className="max-w-sm">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <h1 id="let-hook-go-title" className="text-base font-bold text-text">
          Let {partnerName} go?
        </h1>
        <button
          type="button"
          onClick={onClose}
          disabled={busy !== null}
          aria-label="Close"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          {matchingOn
            ? 'Archive this conversation to keep a read-only copy you can ask to continue later, or delete it permanently to free your hook slot.'
            : 'Ending this hook deletes the conversation for both of you. Turn on matching in Profile if you want to archive chats before letting go.'}
        </p>

        {matchingOn && allowance && (
          <div className="p-3 rounded-xl bg-surface border border-border text-xs text-text-secondary flex items-center justify-between">
            <span>Archives available</span>
            <span className="font-semibold text-text">
              {remaining > 0 ? `${remaining} left` : 'None left'}
            </span>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}

        <div className="space-y-2.5 pt-1">
          {matchingOn && (
            <button
              type="button"
              disabled={!canArchive || busy !== null}
              onClick={() => void handleArchive()}
              // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_CONFIRM once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_confirm"
              className="w-full py-2.5 px-4 rounded-xl bg-accent text-bg text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <Archive className="w-4 h-4" aria-hidden="true" />
              {busy === 'archive' ? 'Archiving…' : 'Archive chat'}
            </button>
          )}

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleDelete()}
            // TODO(telemetry-parity): switch to UiElement.CHAT_UNMATCH_CONFIRM once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.unmatch_confirm"
            className="w-full py-2.5 px-4 rounded-xl border border-red-500/40 text-red-500 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-red-500/10 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {busy === 'delete' ? 'Deleting…' : 'Delete chat permanently'}
          </button>

          <button
            type="button"
            autoFocus
            disabled={busy !== null}
            onClick={onClose}
            {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
            className="w-full py-2 px-4 rounded-xl border border-border text-xs font-semibold text-text hover:bg-surface-hover cursor-pointer"
          >
            Keep hook
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

export function HookFormingGuardDialog({
  prompt,
  busy,
  onConfirm,
  onCancel,
}: {
  prompt: HookFormingPromptSpec | null;
  busy?: boolean;
  onConfirm: (currentHook?: CurrentHookAction) => void;
  onCancel: () => void;
}) {
  if (!prompt) return null;

  return (
    <ModalDialog open={Boolean(prompt)} onClose={onCancel} labelledBy="hook-forming-guard-title" className="max-w-sm">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <h1 id="hook-forming-guard-title" className="text-base font-bold text-text">
          {prompt.title}
        </h1>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-text-secondary leading-relaxed">{prompt.message}</p>
        <div className="space-y-2">
          {prompt.requiresArchiveOrDeleteChoice ? (
            <>
              {prompt.canArchiveCurrent && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onConfirm(CurrentHookAction.ARCHIVE)}
                  // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_CONFIRM once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_confirm"
                  className="w-full py-2.5 px-4 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  {busy ? 'Working…' : 'Archive current chat & continue'}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm(CurrentHookAction.RELEASE)}
                // TODO(telemetry-parity): switch to UiElement.CHAT_UNMATCH_CONFIRM once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.unmatch_confirm"
                className="w-full py-2.5 px-4 rounded-xl border border-red-500/40 text-red-500 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-40 cursor-pointer"
              >
                {busy ? 'Working…' : 'Delete current chat & continue'}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm()}
              // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_SEND once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for hook forming confirm"
              className="w-full py-2.5 px-4 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Continuing…' : 'Continue'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
            className="w-full py-2 px-4 rounded-xl border border-border text-xs font-semibold text-text hover:bg-surface-hover cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
