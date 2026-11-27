import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, Lock, X } from 'lucide-react';
import { CurrentHookAction, UnarchiveRequestState, type ArchiveItem, type HookRequestItem } from '../../types';
import { StateApi } from '../../api/state';
import { usePartnerProfiles } from '../../hooks/use-api';
import {
  refreshArchives,
  respondUnarchiveAndSync,
  useArchiveStore,
} from '../../store/archive-store';
import { useAppStore } from '../../store/app-store';
import { buildHookFormingPrompt, type HookFormingPromptSpec } from '../../lib/hook-forming-guard';
import { HookFormingGuardDialog } from './LetHookGoDialog';
import { MediaImage } from '../../components/common/MediaImage';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../components/common/Toast';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { Screen, UiElement, trackProps, trackScreenView } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';
import { HOOK_COPY, acceptRequestErrorCopy, formatDay } from './hook-copy';

type RequestSort = 'recent' | 'oldest' | 'expiring' | 'name_asc' | 'name_desc' | 'age_asc' | 'age_desc';

const SORT_LABELS: ReadonlyArray<{ value: RequestSort; label: string }> = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'age_asc', label: 'Age (youngest)' },
  { value: 'age_desc', label: 'Age (eldest)' },
];

/**
 * Hook requests (docs/chat-only-profiles.md §6.2, §7.2, §7.3 + held unarchive requests + sorting).
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
  const [sort, setSort] = useState<RequestSort>('recent');
  const [guardPrompt, setGuardPrompt] = useState<HookFormingPromptSpec | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'hook'; req: HookRequestItem }
    | { kind: 'unarchive'; item: ArchiveItem }
    | null
  >(null);

  const userState = useAppStore((s) => s.userState);
  const archiveList = useArchiveStore((s) => s.list);
  const heldUnarchiveRequests = useMemo(
    () => (archiveList?.archives ?? []).filter((a) => a.requestState === UnarchiveRequestState.RECEIVED),
    [archiveList]
  );

  const senderIds = useMemo(
    () => [
      ...incoming.filter((r) => !r.locked && r.fromUserId).map((r) => String(r.fromUserId)),
      ...heldUnarchiveRequests.map((a) => a.peerId),
    ],
    [incoming, heldUnarchiveRequests]
  );
  const senders = usePartnerProfiles(senderIds);

  useEffect(() => {
    if (open) {
      trackScreenView(Screen.HOOK_REQUESTS);
      void refreshArchives();
    }
  }, [open]);

  const sortedIncoming = useMemo(() => {
    const arr = [...incoming];
    arr.sort((a, b) => {
      const ca = Number(a.createdAt) || 0;
      const cb = Number(b.createdAt) || 0;
      const ea = Number(a.expiresAt) || Number.MAX_SAFE_INTEGER;
      const eb = Number(b.expiresAt) || Number.MAX_SAFE_INTEGER;
      const sa = a.fromUserId ? senders[String(a.fromUserId)] : null;
      const sb = b.fromUserId ? senders[String(b.fromUserId)] : null;
      switch (sort) {
        case 'oldest':
          return ca - cb;
        case 'expiring':
          return ea - eb;
        case 'name_asc':
          return (sa?.name ?? '').localeCompare(sb?.name ?? '');
        case 'name_desc':
          return (sb?.name ?? '').localeCompare(sa?.name ?? '');
        case 'age_asc':
          return (sa?.age ?? 999) - (sb?.age ?? 999);
        case 'age_desc':
          return (sb?.age ?? -1) - (sa?.age ?? -1);
        default:
          return cb - ca;
      }
    });
    return arr;
  }, [incoming, sort, senders]);

  const sortedOutgoing = useMemo(() => {
    const arr = [...outgoing];
    arr.sort((a, b) => {
      const ca = Number(a.createdAt) || 0;
      const cb = Number(b.createdAt) || 0;
      const ea = Number(a.expiresAt) || Number.MAX_SAFE_INTEGER;
      const eb = Number(b.expiresAt) || Number.MAX_SAFE_INTEGER;
      switch (sort) {
        case 'oldest':
          return ca - cb;
        case 'expiring':
          return ea - eb;
        case 'name_asc':
          return (a.toUsername ?? '').localeCompare(b.toUsername ?? '');
        case 'name_desc':
          return (b.toUsername ?? '').localeCompare(a.toUsername ?? '');
        default:
          return cb - ca;
      }
    });
    return arr;
  }, [outgoing, sort]);

  const run = async (requestId: string, action: () => Promise<void>) => {
    setBusy(requestId);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const performAcceptHook = (r: HookRequestItem) =>
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

  const accept = (r: HookRequestItem) => {
    const senderName = r.fromUserId ? senders[String(r.fromUserId)]?.name : undefined;
    const prompt = buildHookFormingPrompt('acceptHookRequest', userState, archiveList?.allowance, senderName);
    if (prompt) {
      setPendingAction({ kind: 'hook', req: r });
      setGuardPrompt(prompt);
      return;
    }
    void performAcceptHook(r);
  };

  const acceptHeldUnarchive = (item: ArchiveItem) => {
    const partnerName = senders[item.peerId]?.name ?? 'this match';
    const prompt = buildHookFormingPrompt('respondUnarchive', userState, archiveList?.allowance, partnerName);
    if (prompt) {
      setPendingAction({ kind: 'unarchive', item });
      setGuardPrompt(prompt);
      return;
    }
    void run(item.matchId, async () => {
      try {
        await respondUnarchiveAndSync(item.matchId, true);
        showToast('Conversation continued.', 'success');
        onChanged();
        await onAccepted(item.matchId);
        onClose();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not continue archived chat.', 'error');
      }
    });
  };

  const declineHeldUnarchive = (item: ArchiveItem) =>
    run(item.matchId, async () => {
      try {
        await respondUnarchiveAndSync(item.matchId, false);
        showToast('Unarchive request declined.', 'info');
        onChanged();
      } catch {
        showToast('Could not decline that request.', 'error');
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

  const handleGuardConfirm = async (choice?: CurrentHookAction) => {
    const act = pendingAction;
    setGuardPrompt(null);
    setPendingAction(null);
    if (!act) return;
    if (act.kind === 'hook') {
      if (choice && userState?.hooks?.[0]) {
        try {
          if (choice === CurrentHookAction.ARCHIVE) {
            await StateApi.archiveHook(userState.hooks[0].matchId);
          } else {
            await StateApi.releaseHook(userState.hooks[0].matchId, 'OTHER');
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Could not update current hook.', 'error');
          return;
        }
      }
      await performAcceptHook(act.req);
      return;
    }
    await run(act.item.matchId, async () => {
      try {
        await respondUnarchiveAndSync(act.item.matchId, true, choice);
        showToast('Conversation continued.', 'success');
        onChanged();
        await onAccepted(act.item.matchId);
        onClose();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not continue archived chat.', 'error');
      }
    });
  };

  return (
    <>
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
              <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0 gap-2">
                <h2 id="hook-requests-title" className="text-lg font-bold">
                  Requests
                </h2>
                <div className="flex items-center gap-2">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as RequestSort)}
                    aria-label="Sort requests"
                    // TODO(telemetry-parity): add hook_requests.sort_select when backend parity enables it.
                    data-track-exempt="disabled: pending telemetry web parity enablement for hook_requests.sort_select"
                    className="px-2 py-1 rounded-lg border border-border bg-surface text-xs text-text"
                  >
                    {SORT_LABELS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onClose}
                    {...trackProps(UiElement.HOOK_REQUESTS_CLOSE)}
                    className={ICON_SECTION.modalHeader.button}
                    aria-label="Close requests"
                  >
                    <X className={ICON_SECTION.modalHeader.icon} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6">
                {loading && incoming.length === 0 && outgoing.length === 0 && heldUnarchiveRequests.length === 0 ? (
                  <div className="py-10 flex justify-center">
                    <LoadingSpinner size="md" />
                  </div>
                ) : (
                  <>
                    {heldUnarchiveRequests.length > 0 && (
                      <section aria-labelledby="requests-unarchive">
                        <h3
                          id="requests-unarchive"
                          className="text-[10px] uppercase tracking-widest font-bold text-accent mb-2 flex items-center gap-1"
                        >
                          <Archive className="w-3 h-3" aria-hidden="true" /> Continue archived chat
                        </h3>
                        <ul className="space-y-2">
                          {heldUnarchiveRequests.map((item) => {
                            const sender = senders[item.peerId];
                            const name = sender?.name ?? 'Your Match';
                            return (
                              <li key={item.matchId} className="p-3 rounded-xl border border-accent/40 bg-accent/5 space-y-3">
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
                                    <span className="block text-sm font-semibold truncate">{name}</span>
                                    <span className="block text-xs text-text-secondary">
                                      Wants to continue your archived chat
                                    </span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy === item.matchId}
                                    onClick={() => acceptHeldUnarchive(item)}
                                    data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_respond"
                                    className="flex-1 py-2 bg-accent text-bg text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 cursor-pointer"
                                  >
                                    Continue
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy === item.matchId}
                                    onClick={() => void declineHeldUnarchive(item)}
                                    data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_respond"
                                    className="flex-1 py-2 border border-border text-xs font-semibold rounded-lg hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
                                  >
                                    Decline
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    )}

                    <section aria-labelledby="requests-received">
                      <h3 id="requests-received" className="text-[10px] uppercase tracking-widest font-bold text-text-muted mb-2">
                        Received
                      </h3>
                      {sortedIncoming.length === 0 ? (
                        <p className="text-xs text-text-secondary">{HOOK_COPY.noRequests}</p>
                      ) : (
                        <ul className="space-y-2">
                          {sortedIncoming.map((r) =>
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
                                onAccept={() => accept(r)}
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
                      {sortedOutgoing.length === 0 ? (
                        <p className="text-xs text-text-secondary">{HOOK_COPY.noSentRequests}</p>
                      ) : (
                        <ul className="space-y-2">
                          {sortedOutgoing.map((r) => (
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

      <HookFormingGuardDialog
        prompt={guardPrompt}
        busy={Boolean(busy)}
        onConfirm={(choice) => void handleGuardConfirm(choice)}
        onCancel={() => {
          setGuardPrompt(null);
          setPendingAction(null);
        }}
      />
    </>
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
