import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, X } from 'lucide-react';
import type { HookRequestItem } from '../../types';
import { StateApi } from '../../api/state';
import { usePartnerProfiles } from '../../hooks/use-api';
import { MediaImage } from '../../components/common/MediaImage';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../components/common/Toast';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { Screen, UiElement, trackProps, trackScreenView } from '../../lib/analytics/analytics';
import { HOOK_COPY, acceptRequestErrorCopy, formatDay } from './hook-copy';

/**
 * Hook requests (docs/chat-only-profiles.md §6.2, §7.2, §7.3).
 *
 * Received: an unlocked row shows the sender's chat profile (opened with the request list's chat
 * pass) with Accept, Decline and Block. A locked row — the member is at capacity — names nobody and
 * offers nothing: "Unhook to see this request". Sent: every request shows as pending until it expires,
 * whatever the recipient did, so the sender can never tell decline, clear or ignore apart.
 */
export function HookRequestsSheet({
  open,
  onClose,
  incoming,
  outgoing,
  loading,
  onChanged,
  onAccepted,
  onBlock,
}: {
  open: boolean;
  onClose: () => void;
  incoming: HookRequestItem[];
  outgoing: HookRequestItem[];
  loading: boolean;
  /** Re-read the requests (and the state, when a hook formed). */
  onChanged: () => void;
  onAccepted: (matchId: string) => Promise<void> | void;
  /** Opens the block confirmation for this sender. */
  onBlock: (userId: string, name: string) => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const senderIds = useMemo(
    () => incoming.filter((r) => !r.locked && r.fromUserId).map((r) => String(r.fromUserId)),
    [incoming]
  );
  const senders = usePartnerProfiles(senderIds);

  // Analytics: the inbox (HOOK_REQUESTS) was shown.
  useEffect(() => {
    if (open) trackScreenView(Screen.HOOK_REQUESTS);
  }, [open]);

  const run = async (requestId: string, action: () => Promise<void>) => {
    setBusy(requestId);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const accept = (r: HookRequestItem) =>
    run(String(r.requestId), async () => {
      try {
        const { matchId } = await StateApi.acceptHookRequest(String(r.requestId));
        showToast("You're connected. Say hello!", 'success');
        onChanged();
        await onAccepted(matchId);
        onClose();
      } catch (err) {
        showToast(acceptRequestErrorCopy(err), 'error');
        onChanged();
      }
    });

  const decline = (r: HookRequestItem) =>
    run(String(r.requestId), async () => {
      try {
        await StateApi.declineHookRequest(String(r.requestId));
        showToast('Request declined.', 'info');
      } catch {
        showToast("We couldn't decline that request. Please try again.", 'error');
      }
      onChanged();
    });

  const cancel = (r: HookRequestItem) =>
    run(String(r.requestId), async () => {
      try {
        await StateApi.cancelHookRequest(String(r.requestId));
        showToast('Request withdrawn.', 'info');
      } catch {
        showToast("We couldn't withdraw that request. Please try again.", 'error');
      }
      onChanged();
    });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 md:p-6 md:pt-16"
          onClick={onClose}
          data-track-exempt="backdrop: click-away that closes the hook requests sheet; the explicit close control (hook_requests.close) is tracked."
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hook-requests-title"
            className="w-full max-w-md bg-surface-card text-text border border-border shadow-2xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 id="hook-requests-title" className="text-lg font-bold">
                Requests
              </h2>
              <button
                type="button"
                onClick={onClose}
                {...trackProps(UiElement.HOOK_REQUESTS_CLOSE)}
                className="p-2 border border-border hover:border-accent hover:bg-bg transition-colors rounded-lg cursor-pointer"
                aria-label="Close requests"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6">
              {loading && incoming.length === 0 && outgoing.length === 0 ? (
                <div className="py-10 flex justify-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
                <>
                  <section aria-labelledby="requests-received">
                    <h3 id="requests-received" className="text-[10px] uppercase tracking-widest font-bold text-text-muted mb-2">
                      Received
                    </h3>
                    {incoming.length === 0 ? (
                      <p className="text-xs text-text-secondary">{HOOK_COPY.noRequests}</p>
                    ) : (
                      <ul className="space-y-2">
                        {incoming.map((r) =>
                          r.locked || !r.fromUserId ? (
                            <li
                              key={r.requestId}
                              className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border"
                            >
                              <span className="w-11 h-11 rounded-full bg-surface border border-border flex items-center justify-center shrink-0">
                                <Lock className="w-4 h-4 text-text-muted" aria-hidden="true" />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold">{HOOK_COPY.lockedRequest}</span>
                                <span className="block text-xs text-text-muted">{HOOK_COPY.lockedRequestDetail}</span>
                              </span>
                            </li>
                          ) : (
                            <IncomingRow
                              key={r.requestId}
                              request={r}
                              sender={senders[String(r.fromUserId)]}
                              busy={busy === r.requestId}
                              onAccept={() => void accept(r)}
                              onDecline={() => void decline(r)}
                              onBlock={(name) => onBlock(String(r.fromUserId), name)}
                            />
                          )
                        )}
                      </ul>
                    )}
                  </section>

                  <section aria-labelledby="requests-sent">
                    <h3 id="requests-sent" className="text-[10px] uppercase tracking-widest font-bold text-text-muted mb-2">
                      Sent
                    </h3>
                    {outgoing.length === 0 ? (
                      <p className="text-xs text-text-secondary">{HOOK_COPY.noSentRequests}</p>
                    ) : (
                      <ul className="space-y-2">
                        {outgoing.map((r) => (
                          <li key={r.requestId} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold truncate">@{r.toUsername}</span>
                              <span className="block text-xs text-text-muted">
                                {HOOK_COPY.pendingOutgoing}
                                {r.expiresAt ? ` · expires ${formatDay(r.expiresAt)}` : ''}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => void cancel(r)}
                              disabled={busy === r.requestId}
                              {...trackProps(UiElement.HOOK_REQUESTS_CANCEL, { targetId: String(r.requestId) })}
                              aria-label={`Withdraw request to @${r.toUsername}`}
                              className="px-3 py-1.5 border border-border text-xs font-semibold rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              Withdraw
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IncomingRow({
  request,
  sender,
  busy,
  onAccept,
  onDecline,
  onBlock,
}: {
  key?: string;
  request: HookRequestItem;
  sender: { name: string; avatarKey?: string; age?: number } | null | undefined;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: (name: string) => void;
}) {
  const name = sender?.name ?? (sender === null ? 'Someone' : '…');
  const requestId = String(request.requestId);
  return (
    <li className="p-3 rounded-xl border border-border space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full overflow-hidden border border-border bg-surface shrink-0">
          <MediaImage
            src={sender?.avatarKey || FALLBACK_PROFILE_IMAGE}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
          />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">
            {name}
            {sender?.age ? <span className="font-normal text-text-secondary">, {sender.age}</span> : null}
          </span>
          <span className="block text-xs text-text-muted">Wants to connect · {formatDay(request.createdAt)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          {...trackProps(UiElement.HOOK_REQUESTS_ACCEPT, { targetId: requestId })}
          aria-label={`Accept request from ${name}`}
          className="flex-1 py-2 bg-accent text-bg text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          {...trackProps(UiElement.HOOK_REQUESTS_DECLINE, { targetId: requestId })}
          aria-label={`Decline request from ${name}`}
          className="flex-1 py-2 border border-border text-xs font-semibold rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40 cursor-pointer"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => onBlock(name)}
          disabled={busy}
          {...trackProps(UiElement.HOOK_REQUESTS_BLOCK, { targetId: requestId })}
          aria-label={`Block ${name}`}
          className="px-3 py-2 border border-border text-xs font-semibold rounded-lg text-red-500 hover:bg-surface-hover transition-colors disabled:opacity-40 cursor-pointer"
        >
          Block
        </button>
      </div>
    </li>
  );
}
