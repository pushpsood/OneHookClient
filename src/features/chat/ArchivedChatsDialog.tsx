/**
 * Archived Chats modal & read-only conversation viewer (mirrors iOS `ArchivedChatsViewController` &
 * `ArchiveViews.swift`).
 *
 * Lists archived conversations (sorted via UI menu), pins incoming requests to continue at the top,
 * lets the archiver send/withdraw an unarchive request, lets either member delete an archive or open
 * the read-only conversation transcript, and wires every hook-forming path through HookFormingGuard.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpDown,
  Check,
  Clock,
  Lock,
  MessageCircle,
  PauseCircle,
  Trash2,
  X,
} from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { MediaImage } from '../../components/common/MediaImage';
import { ICON_SECTION } from '../../lib/icon-tokens';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { LockedMessageNotice } from '../../components/chat/LockedMessage';
import { HistoryRecoveryModal } from '../../components/chat/HistoryRecoveryModal';
import { AttachmentBubble } from '../../components/chat/AttachmentBubble';
import { StructuredMessageBubble } from '../../components/chat/StructuredMessageBubble';
import { useToast } from '../../components/common/Toast';
import { useChatMessages, usePartnerProfiles } from '../../hooks/use-api';
import { DistanceApi } from '../../api/rest';
import { isMatchingOn } from '../../lib/app-mode';
import { decodeMessagePlaintext } from '../../lib/chat-attachments';
import { formatDayLabel, formatMessageTime, sameLocalDay } from '../../lib/chat-timeline';
import { buildHookFormingPrompt, type HookFormingPromptSpec } from '../../lib/hook-forming-guard';
import {
  deleteArchiveAndSync,
  markArchiveRequestSeenOnce,
  refreshArchives,
  respondUnarchiveAndSync,
  sendUnarchiveAndSync,
  sortArchiveItems,
  totalRemainingArchives,
  useArchiveStore,
  withdrawUnarchiveAndSync,
  type ArchiveListSort,
} from '../../store/archive-store';
import { useAppStore } from '../../store/app-store';
import { CurrentHookAction, UnarchiveRequestState, type ArchiveItem } from '../../types';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { HookFormingGuardDialog } from './LetHookGoDialog';
import { formatDay } from './hook-copy';

const ARCHIVE_SORT_OPTIONS: ReadonlyArray<{
  id: ArchiveListSort;
  label: string;
  matchingOnly?: boolean;
}> = [
  { id: 'recent', label: 'Recent archives' },
  { id: 'oldest', label: 'Oldest archives' },
  { id: 'name_asc', label: 'Name (A–Z)' },
  { id: 'name_desc', label: 'Name (Z–A)' },
  { id: 'age_asc', label: 'Age (youngest first)' },
  { id: 'age_desc', label: 'Age (oldest first)' },
  { id: 'nearest', label: 'Nearest first', matchingOnly: true },
];

export function ArchivedChatsDialog({
  open,
  onClose,
  onOpenedHook,
}: {
  open: boolean;
  onClose: () => void;
  onOpenedHook: (matchId: string) => void;
}) {
  const { showToast } = useToast();
  const { currentUser, userState } = useAppStore();
  const matchingOn = isMatchingOn(userState);
  const list = useArchiveStore((s) => s.list);
  const loading = useArchiveStore((s) => s.loading);
  const error = useArchiveStore((s) => s.error);

  const [sort, setSort] = useState<ArchiveListSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveItem | null>(null);
  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingGuard, setPendingGuard] = useState<{
    prompt: HookFormingPromptSpec;
    run: (action?: CurrentHookAction) => Promise<void>;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ArchiveItem | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedArchive(null);
      setSortOpen(false);
      return;
    }
    void refreshArchives();
  }, [open]);

  const archives = list?.archives ?? [];
  const allowance = list?.allowance;
  const peerIds = useMemo(() => archives.map((a) => a.peerId), [archives]);
  const profiles = usePartnerProfiles(peerIds);

  useEffect(() => {
    if (!open || sort !== 'nearest' || !matchingOn) return;
    const missing = archives.map((a) => a.peerId).filter((pid) => distances[pid] === undefined);
    if (missing.length === 0) return;
    let active = true;
    void Promise.all(
      missing.map(async (pid): Promise<[string, number | null]> => {
        try {
          const res = await DistanceApi.get(pid);
          return [pid, res.distanceKm];
        } catch {
          return [pid, null];
        }
      })
    ).then((entries) => {
      if (!active) return;
      setDistances((prev) => {
        const next = { ...prev };
        for (const [id, d] of entries) next[id] = d;
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [open, sort, matchingOn, archives, distances]);

  // Keep selected archive updated from store if still present
  useEffect(() => {
    if (!selectedArchive) return;
    const updated = archives.find((a) => a.matchId === selectedArchive.matchId);
    if (updated) {
      setSelectedArchive(updated);
      if (updated.requestState === UnarchiveRequestState.RECEIVED) {
        markArchiveRequestSeenOnce(updated.matchId);
      }
    }
  }, [archives, selectedArchive]);

  const sortedArchives = useMemo(
    () => sortArchiveItems(archives, sort, profiles, distances),
    [archives, sort, profiles, distances]
  );

  const visibleSortOptions = useMemo(
    () => ARCHIVE_SORT_OPTIONS.filter((o) => matchingOn || !o.matchingOnly),
    [matchingOn]
  );

  const performSendRequest = async (item: ArchiveItem) => {
    const run = async (action?: CurrentHookAction) => {
      setBusyId(item.matchId);
      try {
        await sendUnarchiveAndSync(item.matchId, action);
        showToast('Request to continue sent.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not send unarchive request.', 'error');
      } finally {
        setBusyId(null);
      }
    };
    const prompt = buildHookFormingPrompt(
      'sendUnarchive',
      userState,
      allowance,
      profiles[item.peerId]?.name
    );
    if (prompt) {
      setPendingGuard({ prompt, run });
    } else {
      await run();
    }
  };

  const performRespondRequest = async (item: ArchiveItem, accept: boolean) => {
    if (!accept) {
      setBusyId(item.matchId);
      try {
        await respondUnarchiveAndSync(item.matchId, false);
        showToast('Request declined and archive removed.', 'info');
        if (selectedArchive?.matchId === item.matchId) setSelectedArchive(null);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not decline request.', 'error');
      } finally {
        setBusyId(null);
      }
      return;
    }

    const run = async (action?: CurrentHookAction) => {
      setBusyId(item.matchId);
      try {
        await respondUnarchiveAndSync(item.matchId, true, action);
        showToast('Conversation continued as an active hook.', 'success');
        onOpenedHook(item.matchId);
        onClose();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not accept request.', 'error');
      } finally {
        setBusyId(null);
      }
    };
    const prompt = buildHookFormingPrompt(
      'respondUnarchive',
      userState,
      allowance,
      profiles[item.peerId]?.name
    );
    if (prompt) {
      setPendingGuard({ prompt, run });
    } else {
      await run();
    }
  };

  const performWithdraw = async (item: ArchiveItem) => {
    setBusyId(item.matchId);
    try {
      await withdrawUnarchiveAndSync(item.matchId);
      showToast('Request withdrawn.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not withdraw request.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const performDelete = async (item: ArchiveItem) => {
    setBusyId(item.matchId);
    try {
      await deleteArchiveAndSync(item.matchId);
      setConfirmDelete(null);
      if (selectedArchive?.matchId === item.matchId) setSelectedArchive(null);
      showToast('Archived chat deleted.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete archived chat.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const selectedPeer = selectedArchive ? profiles[selectedArchive.peerId] : null;
  const remainingCount = totalRemainingArchives(allowance);

  return (
    <>
      <ModalDialog
        open={open}
        onClose={onClose}
        labelledBy="archived-chats-title"
        className="max-w-lg h-[82dvh]"
        testId="archived-chats-dialog"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {selectedArchive && (
              <button
                type="button"
                onClick={() => setSelectedArchive(null)}
                aria-label="Back to archived chats"
                data-track-exempt="disabled: pending telemetry web parity enablement for nav.back in archived thread"
                className={ICON_SECTION.modalHeader.button}
              >
                <ArrowLeft className={ICON_SECTION.modalHeader.icon} />
              </button>
            )}
            <Archive className={`${ICON_SECTION.modalHeader.icon} text-accent`} aria-hidden="true" />
            <h1 id="archived-chats-title" className="text-base font-bold text-text truncate">
              {selectedArchive ? (selectedPeer?.name || 'Archived chat') : 'Archived chats'}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!selectedArchive && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  disabled={archives.length < 2}
                  aria-haspopup="menu"
                  aria-expanded={sortOpen}
                  aria-label="Sort archived chats"
                  {...trackProps(UiElement.CHAT_CONVERSATION_SORT_OPEN)}
                  className={`${ICON_SECTION.modalHeader.button} disabled:opacity-40`}
                >
                  <ArrowUpDown className={ICON_SECTION.modalHeader.icon} />
                </button>
                {sortOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 w-48 bg-surface-card border border-border rounded-xl shadow-xl z-20 py-1.5"
                  >
                    {visibleSortOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === opt.id}
                        onClick={() => {
                          setSort(opt.id);
                          setSortOpen(false);
                        }}
                        {...trackProps(UiElement.CHAT_CONVERSATION_SORT, { targetId: opt.id })}
                        className="w-full px-3.5 py-2 text-left text-xs text-text hover:bg-surface-hover flex items-center justify-between cursor-pointer"
                      >
                        <span>{opt.label}</span>
                        {sort === opt.id && <Check className="w-3.5 h-3.5 text-accent" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close archived chats"
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className={ICON_SECTION.modalHeader.button}
            >
              <X className={ICON_SECTION.modalHeader.icon} />
            </button>
          </div>
        </div>

        {selectedArchive ? (
          <ArchivedReadOnlyThread
            item={selectedArchive}
            peerName={selectedPeer?.name || 'Member'}
            currentUserId={currentUser?.id}
            busy={busyId === selectedArchive.matchId}
            onRequestContinue={() => void performSendRequest(selectedArchive)}
            onWithdraw={() => void performWithdraw(selectedArchive)}
            onRespond={(accept) => void performRespondRequest(selectedArchive, accept)}
            onDelete={() => setConfirmDelete(selectedArchive)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {allowance && (
              <div className="p-3.5 rounded-xl bg-surface border border-border text-xs flex items-center justify-between gap-3">
                <span className="text-text-secondary">
                  {allowance.planIncluded > 0
                    ? `${allowance.planIncluded} included · ${allowance.planUsed} used`
                    : `${remainingCount} bought ${remainingCount === 1 ? 'archive' : 'archives'} available`}
                </span>
                {allowance.planIncluded > 0 && allowance.purchased > 0 && (
                  <span className="text-[11px] font-medium text-accent">
                    +{allowance.purchased} bought
                  </span>
                )}
              </div>
            )}

            {loading && archives.length === 0 ? (
              <div className="py-16 flex justify-center">
                <LoadingSpinner size="md" />
              </div>
            ) : error && archives.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-xs text-red-500">{error}</p>
                <button
                  type="button"
                  onClick={() => void refreshArchives()}
                  {...trackProps(UiElement.SHARED_ERROR_RECOVER)}
                  className="px-4 py-2 rounded-xl bg-accent text-bg text-xs font-semibold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : sortedArchives.length === 0 ? (
              <div className="py-16 text-center space-y-2 max-w-xs mx-auto">
                <Archive className="w-8 h-8 text-text-muted mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-text">No archived chats</p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  When you archive a conversation while letting a hook go, it stays here read-only so you can ask to continue later.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {sortedArchives.map((item) => {
                  const p = profiles[item.peerId];
                  const name = p?.name || 'Someone';
                  const isIncoming = item.requestState === UnarchiveRequestState.RECEIVED;
                  const isSent = item.requestState === UnarchiveRequestState.SENT;
                  const rowBusy = busyId === item.matchId;

                  return (
                    <li
                      key={item.matchId}
                      className={`p-3.5 rounded-2xl border ${
                        isIncoming ? 'border-accent/50 bg-accent/5' : 'border-border bg-surface'
                      } space-y-2.5`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArchive(item);
                          if (isIncoming) markArchiveRequestSeenOnce(item.matchId);
                        }}
                        // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVED_OPEN once enabled on web.
                        data-track-exempt="disabled: pending telemetry web parity enablement for chat.archived_open"
                        className="w-full flex items-center gap-3 text-left cursor-pointer"
                      >
                        <div className="w-11 h-11 rounded-full overflow-hidden border border-border bg-bg shrink-0">
                          <MediaImage
                            src={p?.avatarKey || FALLBACK_PROFILE_IMAGE}
                            alt={name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text truncate">{name}</span>
                            {isIncoming && !item.seen && (
                              <span
                                className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                                aria-label="New unarchive request"
                              />
                            )}
                          </div>
                          <p className="text-xs text-text-secondary truncate">
                            {isIncoming
                              ? item.held
                                ? 'Asked to continue — waiting on your decision window'
                                : 'Asked to continue this conversation'
                              : isSent
                                ? 'Request to continue pending'
                                : `Archived ${formatDay(item.archivedAt) || 'recently'}`}
                          </p>
                        </div>
                        <MessageCircle className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
                      </button>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {isIncoming && (
                          <>
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => void performRespondRequest(item, true)}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_RESPOND once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_respond"
                              className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => void performRespondRequest(item, false)}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_RESPOND once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_respond"
                              className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {isSent && (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void performWithdraw(item)}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_WITHDRAW once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_withdraw"
                            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
                          >
                            Withdraw request
                          </button>
                        )}
                        {item.canRequest && (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void performSendRequest(item)}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_SEND once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_send"
                            className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
                          >
                            Continue conversation
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => setConfirmDelete(item)}
                          // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_DELETE once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_delete"
                          className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                          aria-label={`Delete archive with ${name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </ModalDialog>

      <HookFormingGuardDialog
        prompt={pendingGuard?.prompt ?? null}
        busy={busyId !== null}
        onConfirm={(action) => {
          const run = pendingGuard?.run;
          setPendingGuard(null);
          if (run) void run(action);
        }}
        onCancel={() => setPendingGuard(null)}
      />

      <ModalDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        labelledBy="delete-archive-title"
        className="max-w-sm"
      >
        <div className="p-5 space-y-4">
          <h1 id="delete-archive-title" className="text-base font-bold text-text">
            Delete archived chat?
          </h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            This permanently deletes your archived conversation with{' '}
            {confirmDelete ? profiles[confirmDelete.peerId]?.name || 'this person' : 'them'} for both of you.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmDelete(null)}
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-text cursor-pointer"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => confirmDelete && void performDelete(confirmDelete)}
              // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_DELETE once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_delete"
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
}

function ArchivedReadOnlyThread({
  item,
  peerName,
  currentUserId,
  busy,
  onRequestContinue,
  onWithdraw,
  onRespond,
  onDelete,
}: {
  item: ArchiveItem;
  peerName: string;
  currentUserId?: string;
  busy: boolean;
  onRequestContinue: () => void;
  onWithdraw: () => void;
  onRespond: (accept: boolean) => void;
  onDelete: () => void;
}) {
  const { messages, loading, attachmentCache, refetch } = useChatMessages(item.matchId, item.peerId);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2.5 bg-surface border-b border-border flex items-center gap-2 text-xs text-text-secondary shrink-0">
        <PauseCircle className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        <span>This conversation is archived and read-only.</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-8">No messages in this archive.</p>
        ) : (
          messages.map((m, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const showDay = !prev || !sameLocalDay(prev.timestamp, m.timestamp);
            const mine = m.senderId === 'me';
            let decoded: ReturnType<typeof decodeMessagePlaintext> | null = null;
            if (!m.undecryptable) {
              try {
                decoded = decodeMessagePlaintext(m.ciphertext);
              } catch {
                decoded = null;
              }
            }
            return (
              <div key={m.messageId} className="space-y-2">
                {showDay && (
                  <div className="text-center">
                    <span className="text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-surface border border-border text-text-muted">
                      {formatDayLabel(
                        new Date(
                          new Date(m.timestamp).getFullYear(),
                          new Date(m.timestamp).getMonth(),
                          new Date(m.timestamp).getDate()
                        ).getTime()
                      )}
                    </span>
                  </div>
                )}
                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      mine
                        ? 'bg-ig-blue text-white'
                        : 'bg-surface border border-border text-text'
                    }`}
                  >
                    {m.undecryptable ? (
                      <LockedMessageNotice
                        inverted={mine}
                        onRestore={() => setRecoveryOpen(true)}
                      />
                    ) : decoded?.type === 'attachment' ? (
                      <AttachmentBubble
                        envelope={decoded.envelope}
                        matchId={item.matchId}
                        mine={mine}
                        cache={attachmentCache}
                        onRetry={() => {}}
                      />
                    ) : decoded?.type === 'structured' ? (
                      <StructuredMessageBubble
                        content={decoded.content}
                        mine={mine}
                        sentAt={m.timestamp}
                        live={{
                          sessions: {},
                          currentUserId: currentUserId ?? '',
                          peerId: item.peerId,
                          peerName,
                        }}
                      />
                    ) : decoded?.type === 'text' ? (
                      <span>{decoded.text}</span>
                    ) : (
                      <span>{m.ciphertext}</span>
                    )}
                    <span className={`block text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-text-muted'}`}>
                      {formatMessageTime(m.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ArchivedChatBar above read-only composer footer */}
      <div className="p-4 border-t border-border bg-surface space-y-2.5 shrink-0">
        {item.requestState === UnarchiveRequestState.RECEIVED && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text">
              {peerName} asked to continue this chat
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onRespond(true)}
                // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_RESPOND once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_respond"
                className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold cursor-pointer"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRespond(false)}
                // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_RESPOND once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_respond"
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        )}
        {item.requestState === UnarchiveRequestState.SENT && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-secondary flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Request to continue pending
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onWithdraw}
              // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_WITHDRAW once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_withdraw"
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text cursor-pointer"
            >
              Withdraw
            </button>
          </div>
        )}
        {item.canRequest && (
          <button
            type="button"
            disabled={busy}
            onClick={onRequestContinue}
            // TODO(telemetry-parity): switch to UiElement.CHAT_UNARCHIVE_REQUEST_SEND once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.unarchive_request_send"
            className="w-full py-2.5 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            Ask to continue this conversation
          </button>
        )}
        <div className="flex items-center justify-between text-xs text-text-muted pt-0.5">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" aria-hidden="true" /> Read-only archive
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVE_DELETE once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.archive_delete"
            className="text-red-500 font-semibold hover:underline cursor-pointer"
          >
            Delete archive
          </button>
        </div>
      </div>

      <HistoryRecoveryModal
        userId={currentUserId}
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        onRecovered={() => void refetch()}
      />
    </div>
  );
}
