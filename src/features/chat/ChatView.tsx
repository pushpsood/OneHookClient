import { trackConversationOpened, trackProfileRevisit, trackSafetyUiOpen, Screen, UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MessageStatus } from 'onehook-api-client/graphql';
import {
  Shield,
  Settings,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  ArrowLeftRight,
  MapPin,
  Sparkles,
  AlertTriangle,
  Inbox,
  PauseCircle,
  Radio,
  Archive,
  ArrowDown,
  Clock,
  Copy,
  CornerUpLeft,
  Info,
  MoreHorizontal,
  Search,
  Smile,
  Star,
  Trash2,
  UserMinus,
  HelpCircle,
} from 'lucide-react';
import type { BlockReason } from 'onehook-api-client';
import type { ChatMessageDTO, ChatMessageView, Hook, UserProfile, UserStateSnapshot } from '../../types';
import { HOOK_REQUEST_SENT_CONFIRMATION, StateApi } from '../../api/state';
import { DistanceApi, PartnerRestrictionsApi, type PartnerChatRestrictions } from '../../api/rest';
import { useChatMessages, useHookRequests, usePartnerProfiles } from '../../hooks/use-api';
import { useAppStore } from '../../store/app-store';
import {
  clearChatActivity,
  refreshArchives,
  useArchiveStore,
  useChatActivityStore,
} from '../../store/archive-store';
import { isMatchingOn } from '../../lib/app-mode';
import {
  ARCHIVED_CALL_COPY,
  SUSPENDED_CALL_COPY,
  conversationSuspensionReason,
  type SuspensionReason,
} from '../../lib/call-errors';
import type { PartnerProfile } from '../../lib/profile-model';
import { HookRequestsSheet } from './HookRequestsSheet';
import { HOOK_COPY, originLabel, readOnlyCopy, sendRequestErrorCopy } from './hook-copy';
import { useCallEligibility } from '../../hooks/use-calls';
import { useCall } from '../../app/CallProvider';
import { CallButtons } from '../../components/call/CallButtons';
import { CallHistoryItem } from '../../components/call/CallHistoryItem';
import { CallApi, type Call } from '../../api/calls';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../components/common/Toast';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { pictureTransformStyle } from '../../utils/photo-transform';
import { MediaImage } from '../../components/common/MediaImage';
import { BrandWordmark } from '../../components/common/BrandWordmark';
import { Mascot } from '../../components/Chatbot/Mascot';
import { HistoryRecoveryModal } from '../../components/chat/HistoryRecoveryModal';
import {
  HistoryHorizonMarker,
  HistoryLockedBanner,
  LockedMessageNotice,
} from '../../components/chat/LockedMessage';
import {
  getChatFontSizeOption,
  useChatFontSize,
  useChatWallpaper,
  WALLPAPER_SCRIM_CLASS,
  type ChatWallpaper,
} from '../../lib/chat-appearance';
import { ChatContactInfoModal } from './ChatContactInfoModal';
import { DecisionWindowBar, useDecisionWindowGate } from '../../components/chat/DecisionWindowBar';
import { LetHookGoDialog } from './LetHookGoDialog';
import { ArchivedChatsDialog } from './ArchivedChatsDialog';
import {
  ChatIntroStoriesDialog,
  EmojiReactionPickerDialog,
  MessageInfoDialog,
  ReactionDetailsDialog,
} from '../../components/chat/ChatOverlays';
import { ModalDialog } from '../../components/common/ModalDialog';
import { useMrOneHookPersistentUploads } from '../../store/mr-onehook-upload-store';
import { useMrOneHookPrefs } from '../../lib/mr-onehook-prefs';
import {
  QUICK_REACTIONS,
  buildReactionChips,
  toggleReaction,
} from '../../lib/chat-reactions';
import {
  DISAPPEARING_PRESETS,
  EMPTY_PARTNER_RESTRICTIONS,
  PartnerRestrictionGate,
  computeBubblePositions,
  formatDayLabel,
  formatDisappearingShort,
  formatMessageTime,
  getSentDisappearingSeconds,
  messagePreviewText,
  sameLocalDay,
  searchConversationMessages,
  type ConversationSearchFilter,
} from '../../lib/chat-timeline';
import { WallpaperGrid } from '../../components/chat/WallpaperGrid';
import {
  useConversationSort,
  sortConversations,
  CONVERSATION_SORTS,
  getSortOption,
  type SortableConversation,
} from '../../lib/chat-sort';
import { MrOneHookConfirm, MrOneHookTabs } from '../../components/chat/MrOneHookTabs';
import {
  leastRecentSession,
  mrOneHookTabs,
  openChatAttachmentContent,
  uploadMatchChatAttachments,
  useMrOneHookAttachments,
  useMrOneHookChat,
  type MrOneHookMessage,
  type MrOneHookScope,
  type PendingExcerptReview,
  MESSAGE_HISTORY_NOT_ALLOWED_COPY,
} from '../../lib/mr-onehook';
import { MrOneHookPlan } from 'onehook-mr-onehook-client';
import {
  composerAction,
  rejectionCopy,
  type PendingAttachment,
} from '../../lib/mr-onehook-attachments';
import { attachmentProblemCopy, type AttachmentProblem } from '../../lib/mr-onehook-contract';
import type { MrOneHookPlanContext } from '../../lib/mr-onehook-pro';
import { notePlanFromChat, openMrOneHookPro, useMrOneHookPro } from '../../store/mr-onehook-pro-store';
import {
  AskingAboutBar,
  AskMrOneHookButton,
  AskMrOneHookConfirm,
  composerSendLabel,
  MrOneHookAttachButton,
  PendingAttachmentChips,
  SentAttachmentChips,
} from '../../components/chat/MrOneHookAttachments';
import {
  selectEphemeralExcerpts,
  toSelectableMessages,
  type ExcerptSelectionRequest,
  type SelectedExcerpt,
} from '../../lib/mr-onehook-excerpts';
import {
  ASK_HISTORY_NOT_ALLOWED_COPY,
  DEFAULT_ASK_LIMITS,
  askCandidates,
  askCountPhrase,
  askSelectionTotals,
  buildAskShare,
  noteMessageHistoryNotAllowed,
  toggleAskSelection,
  useMessageHistoryNotAllowed,
  type AskCandidate,
  type AskLimits,
  type AskShare,
} from '../../lib/mr-onehook-ask';
import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { AttachmentBubble } from '../../components/chat/AttachmentBubble';
import {
  StructuredMessageBubble,
  type LiveLocationContext,
} from '../../components/chat/StructuredMessageBubble';
import { useLiveLocations } from '../../hooks/use-live-locations';
import { liveSharing, useLiveSharing } from '../../hooks/use-live-sharing';
import {
  TAB_BOUND_COPY,
  endNotice,
  makeLiveWindow,
  newLiveSessionId,
  withLocalEnds,
} from '../../lib/live-location-sharing';
import { formatClockTime, mergeLiveSession } from '../../lib/live-location';
import {
  buildLiveLocationStartPayload,
  buildLocationPayload,
  frameStructuredContent,
  type LocationFix,
} from '../../lib/chat-structured';
import { LocationShareSheet } from '../../components/chat/LocationShareSheet';
import { ContactShareSheet, useContactShare } from '../../components/chat/ContactShareSheet';
import { AttachmentComposer } from '../../components/chat/AttachmentComposer';
import {
  decodeMessagePlaintext,
  AttachmentDecodeError,
  type AttachmentKind,
} from '../../lib/chat-attachments';
import { ReportFlowDialog } from '../../features/moderation/report/ReportFlowDialog';
import type { SourceMessage } from '../../features/moderation/report/window-selection';
import { probeImage, probeVideo } from '../../lib/attachment-media';
import type { AttachmentObjectUrlCache } from '../../lib/attachment-transport';
import type { OutgoingAttachment, AttachmentTransferState } from '../../hooks/use-api';


/** Sentinel selection value for the in-place Mr.OneHook AI conversation. */
const MR_ONEHOOK = 'MR_ONEHOOK' as const;
type Selection = string | typeof MR_ONEHOOK;

const BLOCK_REASONS: { value: BlockReason; label: string }[] = [
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'FAKE_PROFILE', label: 'Fake profile' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern' },
  { value: 'OTHER', label: 'Other' },
];

/** A current hook as chat shows it: State's hook plus the partner's chat profile once it loads. */
/** "Ask Mr OneHook" from a match chat: the confirmed messages and the uploaded files for the next question. */
export interface AskHandoff {
  items: PendingAttachment[];
  excerpts: SelectedExcerpt[];
}

/** The select-mode checkbox's accessible name: the file's name, or the start of the message. */
function askCheckboxLabel(candidate: AskCandidate): string {
  if (candidate.file || candidate.oversizedFile) {
    return `Select ${(candidate.file ?? candidate.oversizedFile)!.name || 'this file'} for Mr OneHook`;
  }
  const text = candidate.text ?? '';
  const snippet = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return `Select the message “${snippet}” for Mr OneHook`;
}

interface HydratedMatch {
  matchId: string;
  /** Epoch ms the hook formed (for sorting by recency). */
  createdAt: number;
  peerId: string;
  origin: Hook['origin'];
  /** Read-only while a member of it chooses which hooks to keep after a downgrade. */
  suspended: boolean;
  peerProfile?: PartnerProfile | null;
}

export function ChatView({
  currentUser,
  userState,
  activeMatchId,
  onSelectMatch,
  onRefetchState,
  onNavigateToDiscovery,
  onOpenMatchingSettings,
  openRequestsTrigger = 0,
  openArchivesTrigger = 0,
}: {
  key?: string;
  currentUser: UserProfile;
  userState: UserStateSnapshot | null;
  activeMatchId?: string | null;
  onSelectMatch?: (matchId: string | null) => void;
  onRefetchState?: () => Promise<void>;
  /** Present only while matching is ON (a chat-only member has no discovery). */
  onNavigateToDiscovery?: () => void;
  onOpenMatchingSettings?: () => void;
  openRequestsTrigger?: number;
  openArchivesTrigger?: number;
}) {
  const { showToast } = useToast();
  const [wallpaper, setWallpaper] = useChatWallpaper();
  const bumpRequests = useAppStore((s) => s.bumpRequests);
  const matchingOn = isMatchingOn(userState);

  // A live share that ends by itself (expiry, stopped on another device, hook ended or paused, server
  // refusal, location access revoked) says so once. Stop here needs no explanation.
  useEffect(
    () =>
      liveSharing().onEnd((end) => {
        const notice = endNotice(end.reason);
        if (notice) showToast(notice, end.reason === 'expired' || end.reason === 'ended_elsewhere' ? 'info' : 'error');
      }),
    [showToast]
  );

  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [selection, setSelection] = useState<Selection>(activeMatchId || MR_ONEHOOK);
  // The member's Mr OneHook plan (Free / Pro) and whether Pro's entry points show.
  const pro = useMrOneHookPro(currentUser.id);
  // "Ask Mr OneHook" from a match chat: the confirmed messages and the files (already uploaded), waiting
  // for that match's Mr OneHook chat.
  const [askHandoff, setAskHandoff] = useState<({ matchId: string } & AskHandoff) | null>(null);

  // Overlay state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [archivedDialogOpen, setArchivedDialogOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [letGoTarget, setLetGoTarget] = useState<{ matchId: string; peerName: string } | null>(null);
  const [reportReason, setReportReason] = useState<BlockReason | null>(null);
  const unreadMatchIds = useChatActivityStore((s) => s.unreadMatchIds);
  const archiveCount = useArchiveStore((s) => s.list?.archives.length ?? 0);
  useEffect(() => {
    if (matchingOn) void refreshArchives();
  }, [matchingOn]);

  useEffect(() => {
    if (openRequestsTrigger > 0) setRequestsOpen(true);
  }, [openRequestsTrigger]);

  useEffect(() => {
    if (openArchivesTrigger > 0) setArchivedDialogOpen(true);
  }, [openArchivesTrigger]);
  // Who the block confirmation is for: the open conversation's partner, or a request's sender.
  const [blockTarget, setBlockTarget] = useState<{ userId: string; name: string; fromRequest: boolean } | null>(null);
  const [reporting, setReporting] = useState(false);
  // New member report flow (moderation Phase 2). Chat-sourced reports render inside the conversation
  // (where the decrypted messages live, for the optional evidence share); profile-sourced reports
  // render here without evidence.
  const [chatReportOpen, setChatReportOpen] = useState(false);
  const [profileReportOpen, setProfileReportOpen] = useState(false);

  // Hook requests (State): the badge and the sheet share one read.
  const requests = useHookRequests();
  const unlockedIncoming = requests.incoming.filter((r) => !r.locked).length;
  const pendingIncoming = requests.incoming.length;

  const [portalNode, setPortalNode] = useState<HTMLElement | null>(() => {
    if (typeof document !== 'undefined') {
      return document.getElementById('topbar-center-slot');
    }
    return null;
  });

  useEffect(() => {
    if (!portalNode && typeof document !== 'undefined') {
      setPortalNode(document.getElementById('topbar-center-slot'));
    }
  }, [portalNode]);

  // Analytics: a conversation was opened (investment / return signal). No-op unless analytics is
  // enabled + consented; the mascot (MR_ONEHOOK) is not a real match so it's excluded.
  useEffect(() => {
    if (selection && selection !== MR_ONEHOOK) {
      trackConversationOpened(String(selection));
      clearChatActivity(String(selection));
    }
  }, [selection]);

  // The chat list is the state's hooks (both origins), each naming its partner (§12).
  const hooks = userState?.hooks;
  const peerIds = useMemo(() => (hooks ?? []).map((h) => h.peerId), [hooks]);
  // Partner chat profiles, opened with the state's chat view pass (lib/view-pass.ts).
  const partnerProfiles = usePartnerProfiles(peerIds);
  const matches: HydratedMatch[] = useMemo(
    () =>
      (hooks ?? []).map((h) => ({
        matchId: h.matchId,
        createdAt: h.hookedAt * 1000,
        peerId: h.peerId,
        origin: h.origin,
        suspended: h.suspended,
        peerProfile: partnerProfiles[h.peerId],
      })),
    [hooks, partnerProfiles]
  );
  const loadingMatches = !userState;

  // Coarsened distance is a Matching route: only while the member's matching is ON (a partner who is
  // chat-only simply has none).
  const peerKey = peerIds.join(',');
  useEffect(() => {
    if (!matchingOn || !peerKey) return;
    let active = true;
    for (const peerId of peerKey.split(',')) {
      DistanceApi.get(peerId)
        .then((d) => {
          if (active) setDistances((prev) => ({ ...prev, [peerId]: d.available ? d.distanceKm : null }));
        })
        .catch(() => {
          if (active) setDistances((prev) => ({ ...prev, [peerId]: null }));
        });
    }
    return () => {
      active = false;
    };
  }, [matchingOn, peerKey]);

  // Analytics: the peer's profile was re-opened from chat (sustained-interest signal).
  useEffect(() => {
    if (profileOpen && selection && selection !== MR_ONEHOOK) {
      const peerId = matches.find((m) => m.matchId === selection)?.peerId;
      trackProfileRevisit(peerId || String(selection), Screen.CHAT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen]);

  // Analytics: the safety / report panel was opened (intent — the action itself stays server-side).
  useEffect(() => {
    if (shieldOpen) trackSafetyUiOpen('report');
  }, [shieldOpen]);

  // Keep selection valid: honor an incoming activeMatchId, else keep the current one, else fall
  // back to the first match, else Mr.OneHook (which is always available).
  useEffect(() => {
    if (activeMatchId && matches.some((m) => m.matchId === activeMatchId)) {
      setSelection(activeMatchId);
      return;
    }
    setSelection((prev) => {
      if (prev === MR_ONEHOOK) return prev;
      if (matches.some((m) => m.matchId === prev)) return prev;
      return matches[0]?.matchId ?? MR_ONEHOOK;
    });
  }, [activeMatchId, matches]);

  const isMrOneHook = selection === MR_ONEHOOK;
  const activeMatch = isMrOneHook ? null : matches.find((m) => m.matchId === selection) || null;
  const peerProfile = activeMatch?.peerProfile || null;
  const peerName = peerProfile?.displayName || peerProfile?.name || 'Your Match';
  const peerPhoto = peerProfile?.avatarKey || FALLBACK_PROFILE_IMAGE;
  const activeDistance = activeMatch ? distances[activeMatch.peerId] : undefined;

  const selectConversation = (next: Selection) => {
    setSelection(next);
    setPickerOpen(false);
    onSelectMatch?.(next === MR_ONEHOOK ? null : next);
  };

  // ── Header avatar accessible label (name + distance live here, not in visible text) ──
  const avatarLabel = isMrOneHook
    ? 'Mr.OneHook — OneHook AI · Open conversation picker'
    : `${peerName}${
        activeDistance != null
          ? ` · ${activeDistance} km away`
          : ''
      }${activeMatch?.suspended ? ' · paused' : ''} · Open conversation picker`;

  const openBlockForActive = () => {
    if (!activeMatch?.peerId) return;
    setBlockTarget({ userId: activeMatch.peerId, name: peerName, fromRequest: false });
    setReportReason('OTHER');
  };

  const moveOffConversation = (matchId: string) => {
    const remaining = matches.filter((m) => m.matchId !== matchId);
    const next: Selection = remaining[0]?.matchId ?? MR_ONEHOOK;
    setSelection(next);
    onSelectMatch?.(next === MR_ONEHOOK ? null : next);
  };

  // ── Block flow (State: POST /state/blocks) ───────────────────────────────
  // State releases any hook between the two (and erases its chat) and deletes pending requests both
  // ways before it answers, so there is no separate unhook. If the block fails, NOTHING changes.
  const runBlock = async (reason: BlockReason) => {
    const target = blockTarget;
    if (!target) return;
    setReporting(true);
    try {
      await StateApi.blockUser(target.userId, reason);
    } catch {
      showToast('We couldn’t block this person. Please try again.', 'error');
      setReporting(false);
      return; // NO state change on block failure.
    }
    const hooked = matches.find((m) => m.peerId === target.userId);
    if (hooked) moveOffConversation(hooked.matchId);
    setReportReason(null);
    setBlockTarget(null);
    setReporting(false);
    showToast(`${target.name} is blocked. You won’t hear from them again.`, 'success');
    bumpRequests();
    if (onRefetchState) await onRefetchState();
  };

  // Standalone unmatch (ends the connection without a block) — used by the report flow's
  // "This isn't a safety issue" redirect. Uses the existing release-hook call.
  const runUnmatch = async () => {
    if (!activeMatch?.matchId) return;
    try {
      await StateApi.releaseHook(activeMatch.matchId, 'OTHER');
    } catch {
      showToast('We couldn’t unmatch just now. Please try again.', 'error');
      return;
    }
    moveOffConversation(activeMatch.matchId);
    setReporting(false);
    showToast('Unmatched.', 'success');
    // A slot freed up: locked requests may have unlocked.
    bumpRequests();
    if (onRefetchState) await onRefetchState();
  };

  // A write was refused because the conversation is suspended or archived (the state we hold is
  // stale). An archived match leaves State's hooks, so the refresh drops it from the chat list.
  const handleSuspended = useCallback(
    (reason: SuspensionReason) => {
      const copy = readOnlyCopy(reason);
      showToast(copy.title + '. ' + copy.body, 'info');
      void onRefetchState?.();
    },
    [showToast, onRefetchState]
  );

  // Rows for the conversation picker: active hooks + Mr.OneHook.
  const pickerRows: (SortableConversation & {
    photo?: string;
    transform?: string;
    subtitle: string;
    isMrOneHook?: boolean;
    unread?: boolean;
  })[] = useMemo(() => {
    const mr = {
      id: MR_ONEHOOK,
      isMrOneHook: true as const,
      name: 'Mr.OneHook',
      subtitle: 'OneHook AI · always here',
      unread: false,
    };
    const rows = matches.map((m) => {
      const p = m.peerProfile;
      const name = p?.displayName || p?.name || 'Your Match';
      const subtitle = m.suspended ? 'Paused' : originLabel(m.origin);
      const photo = p?.avatarKey || FALLBACK_PROFILE_IMAGE;
      return {
        id: m.matchId,
        name,
        age: p?.age ?? null,
        distanceKm: distances[m.peerId] ?? null,
        relationshipType: null,
        lastActivity: m.createdAt,
        photo,
        subtitle,
        unread: unreadMatchIds.has(m.matchId),
      };
    });
    return [...rows, mr];
  }, [matches, distances, unreadMatchIds]);

  // Position of the active conversation within the picker list (for CHAT_CONVERSATION_SWITCH index).
  const selectionIndex = pickerRows.findIndex((r) => r.id === selection);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-bg text-text"
    >
      {/* ── CHAT CONTROLS in Main Header Center (or local fallback) ── */}
      {portalNode ? (
        createPortal(
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Conversation avatar + name */}
            <div className="relative group/picker flex items-center">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="h-9 px-2.5 flex items-center gap-2 min-w-0 group cursor-pointer rounded-xl hover:bg-surface-hover text-text transition-colors"
                title={avatarLabel}
                aria-label={avatarLabel}
                aria-haspopup="dialog"
                {...trackProps(UiElement.CHAT_CONVERSATION_SWITCHER_OPEN)}
              >
                <span className="block w-6 h-6 rounded-full overflow-hidden border border-border group-hover:ring-2 group-hover:ring-accent/30 transition-all bg-surface shrink-0">
                  {isMrOneHook ? (
                    <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-100 to-white dark:from-neutral-800 dark:to-neutral-900 ring-1 ring-accent/20">
                      <Mascot mood="Happy" className="w-5 h-5" />
                    </span>
                  ) : (
                    <MediaImage
                      src={peerPhoto}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-cover"
                    />
                  )}
                </span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold truncate text-text max-w-[80px] xs:max-w-[120px] sm:max-w-[160px]">
                    {isMrOneHook ? 'Mr.OneHook' : peerName}
                  </span>
                  <ChevronDown className={`${ICON_SECTION.header.caret} text-text/70`} />
                </div>
              </button>
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/picker:opacity-100 transition-all duration-150 shadow-md z-50">
                Switch conversation
              </div>
            </div>

            <div className="h-4 w-[1px] bg-border/60 mx-0.5 hidden xs:block" />

            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Shield / safety menu */}
              <div className="relative group/shield flex items-center">
                <button
                  type="button"
                  onClick={() => setShieldOpen((v) => !v)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
                  title="Safety & report"
                  aria-haspopup="menu"
                  aria-expanded={shieldOpen}
                  aria-label="Safety and report options"
                  {...trackProps(UiElement.CHAT_SAFETY_MENU_OPEN)}
                >
                  <Shield className={ICON_SECTION.header.icon} />
                </button>
                {!shieldOpen && (
                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/shield:opacity-100 transition-all duration-150 shadow-md z-50">
                    Safety &amp; report
                  </div>
                )}
                <AnimatePresence>
                  {shieldOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShieldOpen(false)} data-track-exempt="backdrop: click-away that closes the shield menu." />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        role="menu"
                        className="absolute right-0 mt-2 w-52 bg-surface-card border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShieldOpen(false);
                            setProfileOpen(true);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                          {...trackProps(UiElement.CHAT_PROFILE_OPEN)}
                        >
                          {isMrOneHook ? 'About Mr.OneHook' : 'View profile'}
                        </button>
                        {!isMrOneHook && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setShieldOpen(false);
                                setContactInfoOpen(true);
                              }}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_CONTACT_INFO_OPEN once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.contact_info_open"
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                            >
                              Contact info &amp; media
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setShieldOpen(false);
                                if (activeMatch) setLetGoTarget({ matchId: activeMatch.matchId, peerName });
                              }}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_UNMATCH once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.unmatch"
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                            >
                              Archive or unhook
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={reporting}
                              onClick={() => {
                                setShieldOpen(false);
                                setChatReportOpen(true);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-red-500 disabled:opacity-40 cursor-pointer"
                              {...trackProps(UiElement.CHAT_REPORT_OPEN)}
                            >
                              Report
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={reporting}
                              onClick={() => {
                                setShieldOpen(false);
                                openBlockForActive();
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-red-500 disabled:opacity-40 cursor-pointer"
                              {...trackProps(UiElement.CHAT_BLOCK_OPEN)}
                            >
                              Block
                            </button>
                          </>
                        )}
                        <div className="my-0.5 border-t border-border" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShieldOpen(false);
                            setWallpaperOpen(true);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                          {...trackProps(UiElement.CHAT_WALLPAPER_OPEN)}
                        >
                          Choose wallpaper
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShieldOpen(false);
                            setIntroOpen(true);
                          }}
                          // TODO(telemetry-parity): switch to UiElement.CHAT_INTRO_TOUR_OPEN once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.intro_tour_open"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                        >
                          How OneHook chat works
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Chat settings (gear) */}
              <div className="relative group/settings flex items-center">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
                  title="Chat settings"
                  aria-label="Chat settings"
                  {...trackProps(UiElement.CHAT_SETTINGS_OPEN)}
                >
                  <Settings className={ICON_SECTION.header.icon} />
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/settings:opacity-100 transition-all duration-150 shadow-md z-50">
                  Chat settings
                </div>
              </div>

              {/* Hook requests (received + sent) */}
              <RequestsButton count={pendingIncoming} unlocked={unlockedIncoming} onOpen={() => setRequestsOpen(true)} tooltip="center" />

              {/* Add by username */}
              <div className="relative group/add flex items-center">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
                  title="Add by username"
                  aria-label="Add someone by username"
                  {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN)}
                >
                  <Plus className={ICON_SECTION.header.icon} />
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/add:opacity-100 transition-all duration-150 shadow-md z-50">
                  Add by username
                </div>
              </div>
            </div>
          </div>,
          portalNode
        )
      ) : (
        /* Standalone fallback when TopBar is not present */
        <header className="px-4 h-12 border-b border-border flex items-center justify-between bg-surface-card shrink-0 relative z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group/picker flex items-center">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="h-9 px-2.5 flex items-center gap-2 min-w-0 group cursor-pointer rounded-xl hover:bg-surface-hover text-text transition-colors"
                title={avatarLabel}
                aria-label={avatarLabel}
                aria-haspopup="dialog"
                {...trackProps(UiElement.CHAT_CONVERSATION_SWITCHER_OPEN)}
              >
                <span className="block w-6 h-6 rounded-full overflow-hidden border border-border group-hover:ring-2 group-hover:ring-accent/30 transition-all bg-surface shrink-0">
                  {isMrOneHook ? (
                    <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-100 to-white dark:from-neutral-800 dark:to-neutral-900 ring-1 ring-accent/20">
                      <Mascot mood="Happy" className="w-5 h-5" />
                    </span>
                  ) : (
                    <MediaImage
                      src={peerPhoto}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-cover"
                    />
                  )}
                </span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold truncate text-text">
                    {isMrOneHook ? 'Mr.OneHook' : peerName}
                  </span>
                  <ChevronDown className={`${ICON_SECTION.header.caret} text-text/70`} />
                </div>
              </button>
              <div className="pointer-events-none absolute left-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/picker:opacity-100 transition-all duration-150 shadow-md z-50">
                Switch conversation
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="relative group/shield flex items-center">
              <button
                type="button"
                onClick={() => setShieldOpen((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
                title="Safety & report"
                aria-haspopup="menu"
                aria-expanded={shieldOpen}
                aria-label="Safety and report options"
                {...trackProps(UiElement.CHAT_SAFETY_MENU_OPEN)}
              >
                <Shield className={ICON_SECTION.header.icon} />
              </button>
              {!shieldOpen && (
                <div className="pointer-events-none absolute right-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/shield:opacity-100 transition-all duration-150 shadow-md z-50">
                  Safety &amp; report
                </div>
              )}
              <AnimatePresence>
                {shieldOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShieldOpen(false)} data-track-exempt="backdrop: click-away that closes the shield menu." />
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      role="menu"
                      className="absolute right-0 mt-2 w-52 bg-surface-card border border-border rounded-xl shadow-xl z-40 py-1 overflow-hidden"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShieldOpen(false);
                          setProfileOpen(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                        {...trackProps(UiElement.CHAT_PROFILE_OPEN)}
                      >
                        {isMrOneHook ? 'About Mr.OneHook' : 'View profile'}
                      </button>
                      {!isMrOneHook && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={reporting}
                            onClick={() => {
                              setShieldOpen(false);
                              setChatReportOpen(true);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-red-500 disabled:opacity-40 cursor-pointer"
                            {...trackProps(UiElement.CHAT_REPORT_OPEN)}
                          >
                            Report
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={reporting}
                            onClick={() => {
                              setShieldOpen(false);
                              openBlockForActive();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-red-500 disabled:opacity-40 cursor-pointer"
                            {...trackProps(UiElement.CHAT_BLOCK_OPEN)}
                          >
                            Block
                          </button>
                        </>
                      )}
                      <div className="my-0.5 border-t border-border" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShieldOpen(false);
                          setWallpaperOpen(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                        {...trackProps(UiElement.CHAT_WALLPAPER_OPEN)}
                      >
                        Choose wallpaper
                      </button>
                      {!isMrOneHook && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShieldOpen(false);
                              setContactInfoOpen(true);
                            }}
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.contact_info_open"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                          >
                            Contact info &amp; media
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShieldOpen(false);
                              if (activeMatch) setLetGoTarget({ matchId: activeMatch.matchId, peerName });
                            }}
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.unmatch"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                          >
                            Archive or unhook
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShieldOpen(false);
                          setIntroOpen(true);
                        }}
                        data-track-exempt="disabled: pending telemetry web parity enablement for chat.intro_tour_open"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors text-text cursor-pointer"
                      >
                        How OneHook chat works
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="relative group/settings flex items-center">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
                title="Chat settings"
                aria-label="Chat settings"
                {...trackProps(UiElement.CHAT_SETTINGS_OPEN)}
              >
                <Settings className={ICON_SECTION.header.icon} />
              </button>
              <div className="pointer-events-none absolute right-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/settings:opacity-100 transition-all duration-150 shadow-md z-50">
                Chat settings
              </div>
            </div>

            <RequestsButton count={pendingIncoming} unlocked={unlockedIncoming} onOpen={() => setRequestsOpen(true)} tooltip="right" />

            <div className="relative group/add flex items-center">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
                title="Add by username"
                aria-label="Add someone by username"
                {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN)}
              >
                <Plus className={ICON_SECTION.header.icon} />
              </button>
              <div className="pointer-events-none absolute right-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/add:opacity-100 transition-all duration-150 shadow-md z-50">
                Add by username
              </div>
            </div>
          </div>
        </header>
      )}

      {/* ── ACTIVE CONVERSATION (in-place; header + composer are constant) ── */}
      {isMrOneHook ? (
        <MrOneHookConversation
          currentUser={currentUser}
          wallpaper={wallpaper}
          matches={matches}
          pro={pro}
          handoff={askHandoff}
          onHandoffTaken={() => setAskHandoff(null)}
        />
      ) : loadingMatches && !activeMatch ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : activeMatch ? (
        <MatchConversation
          // Remount on suspend/resume so call eligibility (cached once unlocked) is read again.
          key={`${activeMatch.matchId}${activeMatch.suspended ? ':paused' : ''}`}
          matchId={activeMatch.matchId}
          peerId={activeMatch.peerId || undefined}
          peerName={peerName}
          peerPhoto={peerPhoto}
          currentUserId={currentUser.id}
          wallpaper={wallpaper}
          suspended={activeMatch.suspended}
          onSuspended={handleSuspended}
          onReportPeer={openBlockForActive}
          reportOpen={chatReportOpen}
          onCloseReport={() => setChatReportOpen(false)}
          onRequestUnmatch={() => void runUnmatch()}
          contactInfoOpen={contactInfoOpen}
          onOpenContactInfo={() => setContactInfoOpen(true)}
          onCloseContactInfo={() => setContactInfoOpen(false)}
          onViewProfile={() => setProfileOpen(true)}
          onOpenChatSettings={() => setSettingsOpen(true)}
          onOpenLetGo={() => setLetGoTarget({ matchId: activeMatch.matchId, peerName })}
          onOpenIntro={() => setIntroOpen(true)}
          onArchived={async () => {
            if (onRefetchState) await onRefetchState();
          }}
          pro={pro}
          onAskMrOneHook={(handoff) => {
            setAskHandoff({ matchId: activeMatch.matchId, ...handoff });
            selectConversation(MR_ONEHOOK);
          }}
        />
      ) : (
        <EmptyState
          onNavigateToDiscovery={onNavigateToDiscovery}
          onOpenPicker={() => setPickerOpen(true)}
          onAddByUsername={() => setAddOpen(true)}
        />
      )}

      {/* ── CONVERSATION PICKER ────────────────────────────────────────────── */}
      <ConversationPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        rows={pickerRows}
        selection={selection}
        onSelect={selectConversation}
        archiveCount={archiveCount}
        onOpenArchived={() => {
          setPickerOpen(false);
          setArchivedDialogOpen(true);
        }}
        onOpenContactInfo={(matchId) => {
          selectConversation(matchId);
          setContactInfoOpen(true);
        }}
        onLetGo={(matchId, name) => {
          setPickerOpen(false);
          setLetGoTarget({ matchId, peerName: name });
        }}
      />

      {/* ── ADD BY USERNAME ───────────────────────────────────────────────── */}
      <AddByUsernameModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSent={() => bumpRequests()}
      />

      {/* ── HOOK REQUESTS (received and sent) ─────────────────────────────── */}
      <HookRequestsSheet
        open={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        incoming={requests.incoming}
        outgoing={requests.outgoing}
        loading={requests.loading}
        onChanged={() => bumpRequests()}
        onAccepted={async (matchId) => {
          if (onRefetchState) await onRefetchState();
          selectConversation(matchId);
        }}
        onBlock={(userId, name) => {
          setBlockTarget({ userId, name, fromRequest: true });
          setReportReason('OTHER');
        }}
      />

      {/* ── WALLPAPER PICKER (shared store with the settings sheet) ────────── */}
      <WallpaperPickerModal
        open={wallpaperOpen}
        onClose={() => setWallpaperOpen(false)}
        current={wallpaper}
        onChoose={setWallpaper}
      />

      {/* ── CHAT SETTINGS (also exposes the same wallpaper store) ──────────── */}
      <ChatSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        wallpaper={wallpaper}
        onChooseWallpaper={setWallpaper}
      />

      {/* ── PROFILE / ABOUT ───────────────────────────────────────────────── */}
      <ProfileInspectorModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        isMrOneHook={isMrOneHook}
        peerProfile={peerProfile}
        peerName={peerName}
        peerPhoto={peerPhoto}
        distanceKm={activeDistance ?? null}
        originText={activeMatch ? originLabel(activeMatch.origin) : undefined}
        suspended={Boolean(activeMatch?.suspended)}
        onReport={
          !isMrOneHook && activeMatch?.peerId
            ? () => {
                setProfileOpen(false);
                setProfileReportOpen(true);
              }
            : undefined
        }
      />

      {/* ── REPORT FLOW (profile entry; no evidence — evidence is chat-only) ── */}
      {activeMatch?.peerId && (
        <ReportFlowDialog
          open={profileReportOpen}
          onClose={() => setProfileReportOpen(false)}
          source="profile"
          reportedUserId={activeMatch.peerId}
          reportedName={peerName}
          onRequestBlock={openBlockForActive}
          onRequestUnmatch={() => void runUnmatch()}
        />
      )}

      {/* ── REPORT & BLOCK (reason picker) ────────────────────────────────── */}
      <ReportBlockModal
        open={reportReason !== null && blockTarget !== null}
        reason={reportReason ?? 'OTHER'}
        onReason={setReportReason}
        submitting={reporting}
        peerName={blockTarget?.name ?? peerName}
        fromRequest={Boolean(blockTarget?.fromRequest)}
        onCancel={() => {
          setReportReason(null);
          setBlockTarget(null);
        }}
        onConfirm={(reason) => void runBlock(reason)}
      />

      {/* ── ARCHIVED CHATS, LET HOOK GO & CHAT WALKTHROUGH ─────────────────── */}
      <ArchivedChatsDialog
        open={archivedDialogOpen}
        onClose={() => setArchivedDialogOpen(false)}
        onOpenedHook={(matchId) => {
          setArchivedDialogOpen(false);
          if (onRefetchState) void onRefetchState();
          selectConversation(matchId);
        }}
      />

      {letGoTarget && (
        <LetHookGoDialog
          open={Boolean(letGoTarget)}
          onClose={() => setLetGoTarget(null)}
          matchId={letGoTarget.matchId}
          partnerName={letGoTarget.peerName}
          onUnhooked={async () => {
            const leftId = letGoTarget.matchId;
            setLetGoTarget(null);
            moveOffConversation(leftId);
            if (onRefetchState) await onRefetchState();
          }}
          onArchived={async () => {
            const leftId = letGoTarget.matchId;
            setLetGoTarget(null);
            moveOffConversation(leftId);
            if (onRefetchState) await onRefetchState();
          }}
        />
      )}

      <ChatIntroStoriesDialog
        open={introOpen}
        onClose={() => setIntroOpen(false)}
        onExploreDiscover={() => onNavigateToDiscovery?.()}
        onAddByUsername={() => setAddOpen(true)}
      />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared presentational pieces
// ─────────────────────────────────────────────────────────────────────────────

/** Wallpaper + legibility scrim painted behind the message list. */
function ChatBackdrop({ wallpaper }: { wallpaper: ChatWallpaper }) {
  return (
    <>
      <div className={`absolute inset-0 ${wallpaper.gradientClass}`} aria-hidden="true" />
      {/* Translucent scrim keeps dark-on-light text ≥ 4.5:1 (WCAG 1.4.3). */}
      <div className={`absolute inset-0 ${WALLPAPER_SCRIM_CLASS}`} aria-hidden="true" />
    </>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  footerRight,
  leading,
  readOnlyReason,
  above,
  sendLabel,
  sendEnabled,
  sendUpsell,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  footerRight?: string;
  leading?: ReactNode;
  /** The conversation is read-only (suspended); the field is disabled and says why. */
  readOnlyReason?: string;
  /** Shown above the field (e.g. attachment chips). */
  above?: ReactNode;
  /** Replaces "Send" (e.g. "Get Mr OneHook Pro"). */
  sendLabel?: string;
  /** Overrides when the send button is enabled (default: there is text and nothing disables it). */
  sendEnabled?: boolean;
  /**
   * The send button opens the Mr OneHook Pro screen instead of sending; the value says why (Free with
   * files selected, or out of today's free messages).
   */
  sendUpsell?: 'composer' | 'daily_limit';
}) {
  const canSend = sendEnabled ?? (!disabled && !readOnlyReason && Boolean(value.trim()));
  return (
    <div className="p-4 md:p-6 border-t border-border bg-surface-card shrink-0">
      {above}
      <div className="relative flex items-center">
        {leading}
        <input
          value={readOnlyReason ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !readOnlyReason && onSend()}
          type="text"
          disabled={Boolean(readOnlyReason)}
          aria-label={readOnlyReason ?? 'Message'}
          placeholder={readOnlyReason || placeholder || 'Write a message…'}
          className={`w-full py-3 ${sendLabel ? 'pr-40' : 'pr-20'} pl-0 border-b border-border focus:border-accent transition-all outline-none text-sm bg-transparent placeholder:text-text-muted text-text disabled:cursor-not-allowed`}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          {...(sendUpsell
            ? trackProps(UiElement.CHAT_MR_ONEHOOK_GET_PRO, { value: sendUpsell })
            : trackProps(UiElement.CHAT_SEND_BUTTON))}
          className="absolute right-0 bottom-3 text-xs font-semibold text-ig-blue hover:opacity-80 transition-opacity disabled:opacity-30 flex items-center gap-1 cursor-pointer"
        >
          {sendLabel ?? 'Send'}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted font-mono">
        <span>Encrypted</span>
        <span>{footerRight || 'One Connection at a Time'}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Match (E2EE) conversation — preserves existing send/receive, receipts, locked
// history & recovery behaviour.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives the outgoing attachment (including best-effort dimensions/duration/thumbnail) from a picked
 * file. Probing is best-effort: a failure yields no metadata rather than blocking the send.
 */
async function buildOutgoingAttachment(
  file: File,
  kind: AttachmentKind
): Promise<OutgoingAttachment> {
  const base: OutgoingAttachment = {
    blob: file,
    kind,
    // A dropped file can have an empty type; octet-stream keeps it a valid, downloadable `file` bubble.
    mime: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
  };
  if (kind === 'image') {
    const meta = await probeImage(file);
    return { ...base, width: meta.width, height: meta.height, thumbnail: meta.thumbnail };
  }
  if (kind === 'video') {
    const meta = await probeVideo(file);
    return {
      ...base,
      width: meta.width,
      height: meta.height,
      durationMs: meta.durationMs,
      thumbnail: meta.thumbnail,
    };
  }
  return base;
}

/**
 * Renders the inner body of one match message: locked-history notice, attachment bubble, an
 * unreadable-attachment fallback, or plain text. Kept a component (not inline in the list) so the
 * envelope decode can be memoised per message and so both an attachment failure and a text failure
 * route to the right retry — a framed attachment envelope must NEVER be re-sent as a text message.
 */
function MatchMessageBody({
  message,
  mine,
  cache,
  matchId,
  transfer,
  onRetryAttachment,
  onRestore,
  onReportPeerMedia,
  onRetryText,
  live,
  canSaveMedia = true,
}: {
  message: ChatMessageDTO & { undecryptable?: boolean };
  mine: boolean;
  cache: AttachmentObjectUrlCache;
  matchId: string;
  transfer?: AttachmentTransferState;
  onRetryAttachment: () => void;
  onRestore: () => void;
  onReportPeerMedia?: () => void;
  onRetryText: (text: string) => void;
  /** Live-location shares of this conversation, for live-location bubbles. */
  live: LiveLocationContext;
  /** Partner chat restriction check: false hides saving peer decrypted media. */
  canSaveMedia?: boolean;
}) {
  const decoded = useMemo(() => {
    try {
      const result = decodeMessagePlaintext(message.ciphertext);
      if (result.type === 'structured') return result;
      return result.type === 'attachment'
        ? ({ type: 'attachment', envelope: result.envelope } as const)
        : ({ type: 'text', text: result.text } as const);
    } catch (err) {
      return {
        type: 'attachment-error',
        unsupportedVersion: err instanceof AttachmentDecodeError && err.unsupportedVersion,
      } as const;
    }
  }, [message.ciphertext]);

  const renderDecoded = () => {
    // While an attachment is still uploading its body may briefly be empty (the envelope is written
    // once the object key exists). Show the transfer overlay in that window, not an empty text bubble.
    if (transfer && decoded.type !== 'attachment') {
      return <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Preparing…</p>;
    }
    if (decoded.type === 'structured') {
      // Location, live location or contact (0x03), from either member.
      return (
        <>
          <StructuredMessageBubble
            content={decoded.content}
            mine={mine}
            sentAt={message.timestamp}
            live={live}
          />
          {message.status === 'FAILED' && (
            <div className="mt-2 text-[10px] text-red-300 flex items-center gap-1">
              <span>Didn&rsquo;t send</span>
              {/* A live share that failed to start is not re-sent later: its window has moved on. */}
              {decoded.content.type !== 'live_location' && (
                <button
                  onClick={() => onRetryText(message.ciphertext)}
                  {...trackProps(UiElement.CHAT_RETRY)}
                  className="underline hover:opacity-70"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </>
      );
    }
    if (decoded.type === 'attachment') {
      return (
        <AttachmentBubble
          envelope={decoded.envelope}
          matchId={matchId}
          mine={mine}
          cache={cache}
          transfer={transfer}
          onRetry={onRetryAttachment}
          onReportPeerMedia={onReportPeerMedia}
          canSaveMedia={canSaveMedia}
        />
      );
    }
    if (decoded.type === 'attachment-error') {
      return (
        <div className="flex items-center gap-2 text-xs italic opacity-80">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {decoded.unsupportedVersion
              ? 'This attachment was sent from a newer version of the app. Update to view it.'
              : 'This attachment could not be displayed.'}
          </span>
        </div>
      );
    }
    return (
      <>
        {decoded.text}
        {message.status === 'FAILED' && (
          <div className="mt-2 text-[10px] text-red-300 flex items-center gap-1">
            <span>Didn&rsquo;t send</span>
            <button onClick={() => onRetryText(decoded.text)} {...trackProps(UiElement.CHAT_RETRY)} className="underline hover:opacity-70">
              Try again
            </button>
          </div>
        )}
      </>
    );
  };

  // Undecryptable takes priority: an unreadable message carries an EMPTY body, so it must never fall
  // through to the text/attachment branches. Kept as an explicit `undecryptable ?` ternary — the guard
  // in locked-message-rendering.test.ts asserts every message renderer branches on this flag.
  return message.undecryptable ? (
    <LockedMessageNotice onRestore={onRestore} inverted={mine} />
  ) : (
    renderDecoded()
  );
}

const EMPTY_REACTIONS: Record<string, Record<string, string>> = {};
const EMPTY_STARRED = new Set<string>();

/** One conversation with a person. Exported for UI tests (the "Ask Mr OneHook" select mode). */
export function MatchConversation({
  matchId,
  peerId,
  peerName,
  peerPhoto,
  currentUserId,
  wallpaper,
  suspended: suspendedByState,
  onSuspended,
  onReportPeer,
  reportOpen,
  onCloseReport,
  onRequestUnmatch,
  contactInfoOpen,
  onOpenContactInfo,
  onCloseContactInfo,
  onViewProfile,
  onOpenChatSettings,
  onOpenLetGo,
  onOpenIntro,
  onArchived,
  pro,
  onAskMrOneHook,
}: {
  key?: string;
  matchId: string;
  peerId?: string;
  peerName: string;
  peerPhoto?: string;
  currentUserId: string;
  wallpaper: ChatWallpaper;
  /** Read-only: a member of this hook must choose which hooks to keep (R24, E23). */
  suspended?: boolean;
  /** A write was refused with CONVERSATION_SUSPENDED (the state we hold was stale), and why. */
  onSuspended?: (reason: SuspensionReason) => void;
  onReportPeer?: () => void;
  reportOpen?: boolean;
  onCloseReport?: () => void;
  onRequestUnmatch?: () => void;
  contactInfoOpen?: boolean;
  onOpenContactInfo?: () => void;
  onCloseContactInfo?: () => void;
  onViewProfile?: () => void;
  onOpenChatSettings?: () => void;
  onOpenLetGo?: () => void;
  onOpenIntro?: () => void;
  onArchived?: () => Promise<void> | void;
  /** The member's Mr OneHook plan; "Ask Mr OneHook" shows only while Pro is on in this environment. */
  pro: MrOneHookPlanContext;
  /**
   * The member confirmed the selected messages and files (the files are uploaded): open this match's Mr
   * OneHook chat with them attached to the next question.
   */
  onAskMrOneHook: (handoff: AskHandoff) => void;
}) {
  // A write refused as ARCHIVED (docs/archives.md) makes the chat read-only at once, before the state
  // refresh removes it: the archived match is no longer one of State's hooks.
  const [archived, setArchived] = useState(false);
  const suspended = Boolean(suspendedByState) || archived;
  const readOnly = readOnlyCopy(archived ? 'ARCHIVED' : 'PAUSED');
  /** True (and reported) when `err` is a CONVERSATION_SUSPENDED refusal. */
  const refusedAsSuspended = useCallback(
    (err: unknown): boolean => {
      const reason = conversationSuspensionReason(err);
      if (!reason) return false;
      if (reason === 'ARCHIVED') setArchived(true);
      onSuspended?.(reason);
      return true;
    },
    [onSuspended]
  );
  const {
    messages,
    reactionsByMessage = EMPTY_REACTIONS,
    starredIds = EMPTY_STARRED,
    peerTyping = false,
    peerPresence = null,
    peerScreenshotAt = null,
    defaultDisappearingSeconds = 0,
    loading,
    error,
    sendMessage,
    sendAttachment,
    retryAttachment,
    deleteOwnMessage,
    reactToMessage,
    toggleStarred,
    sendTyping,
    attachmentTransfers,
    attachmentCache,
    markAsDelivered,
    markAsRead,
    refetch,
    loadEvidenceWindow,
    hasUndecryptable,
    historyHorizon,
    decryptPayload,
    sealPayload,
  } = useChatMessages(matchId, peerId);

  const [fontSizeId] = useChatFontSize();
  const fontSizeOption = getChatFontSizeOption(fontSizeId);
  const [mrOneHookPrefs] = useMrOneHookPrefs(currentUserId);
  const [restrictions, setRestrictions] = useState<PartnerChatRestrictions>(EMPTY_PARTNER_RESTRICTIONS);
  useEffect(() => {
    if (!peerId || !matchId) return;
    let active = true;
    PartnerRestrictionsApi.get(peerId, matchId)
      .then((res) => {
        if (active) setRestrictions(res);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [peerId, matchId]);

  const decisionWindow = useDecisionWindowGate(matchId, peerName);

  // Disappearing timer override for outgoing messages in this thread.
  const [disappearSeconds, setDisappearSeconds] = useState<number>(defaultDisappearingSeconds);
  useEffect(() => {
    setDisappearSeconds(defaultDisappearingSeconds);
  }, [defaultDisappearingSeconds, matchId]);

  // Live-location shares: running shares on open, then onLiveLocation. Positions open on device.
  const liveLocations = useLiveLocations(matchId, decryptPayload);
  // This tab's own sharing (the tab-bound engine): the running share here, and shares it just ended so
  // their bubbles read "Ended" at once instead of after the server's echo.
  const sharing = useLiveSharing();
  const myShare = sharing.shares[matchId];
  const sessions = useMemo(
    () => withLocalEnds(liveLocations.sessions, sharing.ended, matchId, currentUserId, Date.now(), mergeLiveSession),
    [liveLocations.sessions, sharing.ended, matchId, currentUserId]
  );
  const stopShare = useCallback(
    (sessionId: string) => void liveSharing().stopRemote(matchId, sessionId),
    [matchId]
  );
  const liveContext: LiveLocationContext = useMemo(
    () => ({
      sessions,
      loadedAt: liveLocations.loadedAt,
      currentUserId,
      peerId,
      peerName,
      onStopShare: stopShare,
      sharingHereSessionId: myShare?.sessionId,
    }),
    [sessions, liveLocations.loadedAt, currentUserId, peerId, peerName, stopShare, myShare?.sessionId]
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const contactShare = useContactShare();
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<{ messageId: string; timestamp: number; senderLabel: string; preview: string } | null>(null);
  const [localContactInfoOpen, setLocalContactInfoOpen] = useState(false);

  // "Ask Mr OneHook about messages and files": the member selects text messages (any plan) and, with Mr
  // OneHook Pro available, photos and files of this conversation, sees exactly what would be shared and
  // confirms. Then (Pro) the files are uploaded, decrypted here, never by a server, and this match's Mr
  // OneHook chat opens with the messages and files attached to the next question. Rules:
  // lib/mr-onehook-ask.ts.
  // An archived match is no longer active, so the server does not allow its history; a 403
  // MESSAGE_CONTEXT_NOT_ALLOWED for this match is remembered too.
  const historyDenied = useMessageHistoryNotAllowed(matchId);
  const historyAllowed = !archived && !historyDenied;
  const askLimits: AskLimits = useMemo(
    () => ({
      ...DEFAULT_ASK_LIMITS,
      maxFiles: pro.limits.maxAttachmentsPerMessage,
      maxFileBytes: pro.limits.maxAttachmentBytes,
    }),
    [pro.limits.maxAttachmentsPerMessage, pro.limits.maxAttachmentBytes]
  );
  const shareableMessages = useMemo(
    () => PartnerRestrictionGate.shareableWithMrOneHook(messages, restrictions),
    [messages, restrictions]
  );
  const candidates = useMemo(
    () =>
      askCandidates(shareableMessages, {
        historyAllowed,
        filesAllowed: pro.proVisible,
        limits: askLimits,
      }),
    [shareableMessages, historyAllowed, pro.proVisible, askLimits]
  );
  const [askMode, setAskMode] = useState(false);
  const [askSelected, setAskSelected] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [askConfirm, setAskConfirm] = useState<AskShare | null>(null);
  // A selected message that is no longer selectable (deleted, or the history became unavailable) drops out.
  useEffect(() => {
    setAskSelected((prev) => {
      const kept = prev.filter((id) => candidates.has(id));
      return kept.length === prev.length ? prev : kept;
    });
  }, [candidates]);
  const askTotals = askSelectionTotals(askSelected, candidates);
  const toggleAskSelected = (messageId: string) => {
    const result = toggleAskSelection(askSelected, messageId, candidates, askLimits);
    setAskSelected(result.selected);
    setAskNotice(result.outcome === 'refused' ? result.notice : null);
  };
  const exitAskMode = () => {
    setAskMode(false);
    setAskSelected([]);
    setAskNotice(null);
    setAskConfirm(null);
  };
  /** "Ask Mr OneHook" in the bar: Free with files opens the Pro screen; otherwise the confirmation. */
  const askMrOneHook = () => {
    if (askTotals.files > 0 && pro.plan !== MrOneHookPlan.PRO) {
      // Free keeps the selection; the button reads "Get Mr OneHook Pro".
      openMrOneHookPro();
      return;
    }
    if (asking || askSelected.length === 0) return;
    setAskNotice(null);
    setAskConfirm(buildAskShare(askSelected, candidates));
  };
  /** The member confirmed: upload the files (Pro), then hand everything to the Mr OneHook chat. */
  const confirmAsk = async () => {
    const share = askConfirm;
    if (!share || asking) return;
    setAskConfirm(null);
    if (share.files.length === 0) {
      exitAskMode();
      onAskMrOneHook({ items: [], excerpts: share.excerpts });
      return;
    }
    setAsking(true);
    try {
      const files = [];
      for (const file of share.files) {
        const blob = await attachmentCache.resolveBlob(file.envelope, matchId);
        files.push({
          name: file.envelope.name || `${file.envelope.kind}-${file.messageId}`,
          size: blob.size,
          type: file.envelope.mime,
          blob,
          origin: { matchId, sender: file.sender },
        });
      }
      const result = await uploadMatchChatAttachments(files);
      if (result.ok === false) {
        if (result.problem.kind === 'MESSAGE_CONTEXT_NOT_ALLOWED') noteMessageHistoryNotAllowed(matchId);
        setAskNotice(attachmentProblemCopy(result.problem));
        if (result.problem.kind === 'PRO_REQUIRED') openMrOneHookPro();
        return;
      }
      exitAskMode();
      onAskMrOneHook({ items: result.items, excerpts: share.excerpts });
    } catch {
      setAskNotice('Those files couldn’t be opened on this device. Try again.');
    } finally {
      setAsking(false);
    }
  };
  const askFilesOffered = pro.proVisible;

  // Snapshot of decrypted messages for the optional evidence share. Text comes from the SAME local
  // decrypt the chat UI uses (the E2EE hook); attachments/undecryptable/system messages map to a
  // null/undecryptable entry so the window selector skips them. Never leaves the device unless the
  // reporter ticks the (never pre-ticked) share box and submits.
  const evidenceMessages: SourceMessage[] = useMemo(
    () =>
      messages.map((m) => {
        let text: string | null = null;
        if (!m.undecryptable) {
          try {
            const decoded = decodeMessagePlaintext(m.ciphertext);
            text = decoded.type === 'text' ? decoded.text : null;
          } catch {
            text = null;
          }
        }
        return {
          messageId: m.messageId,
          sentAtMs: m.timestamp,
          senderSide: m.senderId === 'me' ? 'reporter' : 'reported',
          text,
          undecryptable: m.undecryptable,
        };
      }),
    [messages]
  );
  const { showToast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Interactive message UI state: action menus, reaction picker/details, info, delete confirm, search, jump
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [reactionDetailsFor, setReactionDetailsFor] = useState<{ messageId: string; emoji?: string } | null>(null);
  const [infoMessage, setInfoMessage] = useState<ChatMessageView | null>(null);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState<ChatMessageView | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // In-conversation search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<ConversationSearchFilter>('all');
  const [searchIdx, setSearchIdx] = useState(0);

  // Unread divider & scroll-away Jump-to-latest pill
  const initialUnreadIdRef = useRef<string | null>(null);
  const [initialUnreadId, setInitialUnreadId] = useState<string | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [unseenWhileAway, setUnseenWhileAway] = useState(0);
  const prevLenRef = useRef(0);

  const jumpToMessage = useCallback((messageId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(messageId) : messageId;
    const el = container.querySelector(`[data-message-id="${escaped}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(messageId);
      window.setTimeout(() => setHighlightedId((curr) => (curr === messageId ? null : curr)), 1800);
    }
  }, []);

  const searchHits = useMemo(
    () => (searchOpen ? searchConversationMessages(messages, searchQuery, searchFilter) : []),
    [searchOpen, messages, searchQuery, searchFilter]
  );

  useEffect(() => {
    if (searchHits.length > 0) {
      const clamped = Math.min(searchIdx, searchHits.length - 1);
      if (clamped !== searchIdx) setSearchIdx(clamped);
    } else if (searchIdx !== 0) {
      setSearchIdx(0);
    }
  }, [searchHits, searchIdx]);

  // Capture initial unread inbound message once per conversation load.
  useEffect(() => {
    if (initialUnreadIdRef.current !== null || messages.length === 0) return;
    const firstUnread = messages.find((m) => m.senderId !== 'me' && m.status !== MessageStatus.Read);
    if (firstUnread) {
      initialUnreadIdRef.current = firstUnread.messageId;
      setInitialUnreadId(firstUnread.messageId);
    } else {
      initialUnreadIdRef.current = '';
    }
  }, [messages]);

  // When the report dialog opens, page + decrypt the COMPLETE evidence window (the live `messages`
  // snapshot is a single oldest-first page and can omit the most recent messages in a long chat).
  // Until it resolves, the snapshot is used as a non-blocking fallback. Reset on close so a decrypted
  // copy never lingers.
  const [fullEvidence, setFullEvidence] = useState<SourceMessage[] | null>(null);
  useEffect(() => {
    if (!reportOpen) {
      setFullEvidence(null);
      return;
    }
    let cancelled = false;
    void loadEvidenceWindow()
      .then((w) => {
        if (!cancelled) setFullEvidence(w);
      })
      .catch(() => {
        /* non-fatal: fall back to the single-page snapshot */
      });
    return () => {
      cancelled = true;
    };
  }, [reportOpen, loadEvidenceWindow]);

  // Voice / video calling goes through the ONE app-level controller (OneHookBackend/docs/
  // voice-video-calls.md §10): the ring modal and in-call surface are owned by CallProvider at the
  // app root, so a call rings on any screen. This conversation only STARTS calls and shows history.
  const call = useCall();

  // Whether calling is unlocked yet ("you've both messaged"). Fetched on open, re-checked (throttled)
  // after a send and when a peer message arrives, and fails open on error — startCall is the backstop.
  const eligibility = useCallEligibility(matchId, Boolean(peerId));

  // Server call rows for this conversation's timeline (§8 D5). Refetched whenever a call ends
  // anywhere (the controller bumps historyNonce), so a finished call appears without reopening.
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    CallApi.getCallHistory(matchId)
      .then((rows) => {
        if (active) setCallHistory(rows);
      })
      .catch(() => undefined); // best effort: a missing history must never break the conversation
    return () => {
      active = false;
    };
  }, [matchId, call.historyNonce]);

  // Re-check eligibility when a NEW message from the peer arrives, so the buttons unlock without
  // reopening the chat. Tracks the latest inbound message id; the tracker throttles the actual call.
  const lastPeerMessageId = useRef<string | null>(null);
  useEffect(() => {
    let latest: string | null = null;
    for (const m of messages) {
      if (m.senderId !== 'me') latest = m.messageId;
    }
    if (latest && latest !== lastPeerMessageId.current) {
      lastPeerMessageId.current = latest;
      eligibility.recheck();
    }
  }, [messages, eligibility.recheck]);

  // Merge server call rows into the message timeline, ordered by time (§8 D5: server rows).
  const timeline = useMemo(() => {
    const items: Array<
      | { kind: 'message'; ts: number; message: ChatMessageView }
      | { kind: 'call'; ts: number; call: Call }
    > = [];
    for (const m of messages) items.push({ kind: 'message', ts: m.timestamp, message: m as ChatMessageView });
    for (const c of callHistory) items.push({ kind: 'call', ts: c.createdAt, call: c });
    return items.sort((a, b) => a.ts - b.ts);
  }, [messages, callHistory]);

  const bubblePositions = useMemo(() => computeBubblePositions(messages), [messages]);
  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessageView>();
    for (const m of messages) map.set(m.messageId, m as ChatMessageView);
    return map;
  }, [messages]);

  useEffect(() => {
    if (!awayFromBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (messages.length > prevLenRef.current) {
      const added = messages.slice(prevLenRef.current).filter((m) => m.senderId !== 'me').length;
      if (added > 0) setUnseenWhileAway((n) => n + added);
    }
    prevLenRef.current = messages.length;
  }, [messages, awayFromBottom]);

  useEffect(() => {
    messages
      .filter((m) => m.senderId !== 'me' && m.status === 'SENT')
      .forEach((m) => markAsDelivered(m.messageId));
  }, [messages, markAsDelivered]);

  useEffect(() => {
    const timer = setTimeout(() => {
      messages
        .filter((m) => m.senderId !== 'me' && m.status === 'DELIVERED')
        .forEach((m) => markAsRead(m.messageId));
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, markAsRead]);

  // Typing indicator emit (throttled true on edit, false on idle/clear/unmount)
  const typingTimerRef = useRef<number | null>(null);
  const handleInputChange = (val: string) => {
    setInput(val);
    if (!sendTyping || suspended) return;
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (val.trim()) {
      sendTyping(true);
      typingTimerRef.current = window.setTimeout(() => sendTyping(false), 3500);
    } else {
      sendTyping(false);
    }
  };
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      sendTyping?.(false);
    };
  }, [sendTyping]);

  const sendOptions = useMemo(
    () => ({
      ...(replyTo ? { replyToMessageId: replyTo.messageId, replyToTimestamp: replyTo.timestamp } : {}),
      ...(disappearSeconds > 0 ? { expireSeconds: disappearSeconds } : {}),
    }),
    [replyTo, disappearSeconds]
  );

  const handleSend = () => {
    if (!input.trim() || suspended) return;
    const text = input;
    const opts = sendOptions;
    decisionWindow.gateSend(async () => {
      try {
        await sendMessage(text, opts);
        setInput('');
        setReplyTo(null);
        sendTyping?.(false);
        // The local user just sent — re-check whether that satisfied the "both messaged" gate.
        eligibility.recheck();
      } catch (err) {
        if (refusedAsSuspended(err)) return;
        if (err instanceof Error && err.message) showToast(err.message, 'error');
      }
    });
  };

  const dispatchAttachment = useCallback(
    (attachment: OutgoingAttachment) => {
      decisionWindow.gateSend(async () => {
        try {
          await sendAttachment(attachment);
        } catch (err) {
          if (refusedAsSuspended(err)) return;
          showToast(err instanceof Error ? err.message : 'That attachment could not be sent.', 'error');
        }
      });
    },
    [sendAttachment, showToast, refusedAsSuspended, decisionWindow]
  );

  const handlePickFile = useCallback(
    async (file: File, kind: AttachmentKind) => {
      const attachment = await buildOutgoingAttachment(file, kind);
      dispatchAttachment(attachment);
    },
    [dispatchAttachment]
  );

  const handleVoiceNote = useCallback(
    (blob: Blob, mime: string, durationMs: number, waveform: number[]) => {
      const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      dispatchAttachment({
        blob,
        kind: 'audio',
        mime,
        name: `voice-note-${Date.now()}.${extension}`,
        size: blob.size,
        durationMs,
        waveform,
      });
    },
    [dispatchAttachment]
  );

  /**
   * Sends a location or contact card: framed as structured content (0x03) and sealed by sendMessage
   * like any text, with no contentType, so the backend cannot tell it from a typed message. Throws a
   * message for the sheet to show.
   */
  const sendStructured = useCallback(
    async (payload: Record<string, unknown>) => {
      await new Promise<void>((resolve, reject) => {
        decisionWindow.gateSend(async () => {
          try {
            const sent = await sendMessage(frameStructuredContent(payload), sendOptions);
            if (!sent) {
              reject(new Error("This chat isn't ready yet. Try again in a moment."));
              return;
            }
            setReplyTo(null);
            eligibility.recheck();
            resolve();
          } catch (err) {
            if (refusedAsSuspended(err)) {
              reject(new Error(`${readOnlyCopy(conversationSuspensionReason(err) ?? 'PAUSED').title}.`));
              return;
            }
            reject(err);
          }
        });
      });
    },
    [sendMessage, refusedAsSuspended, eligibility.recheck, decisionWindow, sendOptions]
  );

  const sendCurrentLocation = useCallback(
    (fix: LocationFix) => sendStructured(buildLocationPayload(fix)),
    [sendStructured]
  );

  /**
   * Starts a live share from this tab: stop the one running here first (one share per member per
   * conversation), send the `live_location` message, then hand the share to the tab's engine, which
   * publishes the first position at once and keeps publishing until it ends.
   */
  const startLiveShare = useCallback(
    async (fix: LocationFix, durationMs: number) => {
      const engine = liveSharing();
      if (engine.share(matchId)) await engine.stop(matchId);
      const sessionId = newLiveSessionId();
      const { startedAt, expiresAt } = makeLiveWindow(durationMs, Date.now());
      await sendStructured(buildLiveLocationStartPayload({ sessionId, startedAt, expiresAt, fix }));
      await engine.begin(
        { matchId, sessionId, startedAt, expiresAt, userId: currentUserId, peerName, seal: sealPayload },
        fix
      );
    },
    [matchId, currentUserId, peerName, sealPayload, sendStructured]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      const kind: AttachmentKind = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'file';
      void handlePickFile(file, kind);
    },
    [handlePickFile]
  );

  const statusIcon = (message: ChatMessageDTO) => {
    if (message.senderId !== 'me') return null;
    switch (message.status) {
      case MessageStatus.Sending:
        return <span className="text-[8px] opacity-30">⏱</span>;
      case MessageStatus.Sent:
        return <span className="text-[8px] opacity-50">✓</span>;
      case MessageStatus.Delivered:
        return <span className="text-[8px] opacity-70">✓✓</span>;
      case MessageStatus.Read:
        return <span className="text-[8px] text-blue-500">✓✓</span>;
      case MessageStatus.Failed:
        return <span className="text-[8px] text-red-500">✗</span>;
      default:
        return null;
    }
  };

  const handleTimelineScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const away = distanceToBottom > 140;
    setAwayFromBottom(away);
    if (!away && unseenWhileAway > 0) setUnseenWhileAway(0);
  };

  const handleQuickReaction = async (messageId: string, emoji: string) => {
    if (!reactToMessage || suspended) return;
    const myCurrent = reactionsByMessage[messageId]?.[currentUserId] ?? null;
    const next = toggleReaction(myCurrent, emoji);
    try {
      await reactToMessage(messageId, next, emoji);
    } catch {
      showToast('Could not update reaction.', 'error');
    }
  };

  const handleCopyMessage = async (m: ChatMessageView) => {
    const preview = messagePreviewText(m);
    try {
      await navigator.clipboard.writeText(preview);
      showToast('Message copied.', 'success');
    } catch {
      showToast('Could not copy message.', 'error');
    }
  };

  const handleReplyMessage = (m: ChatMessageView) => {
    setReplyTo({
      messageId: m.messageId,
      timestamp: m.timestamp,
      senderLabel: m.senderId === 'me' ? 'You' : peerName,
      preview: messagePreviewText(m),
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmMsg || !deleteOwnMessage) return;
    const target = deleteConfirmMsg;
    setDeleteConfirmMsg(null);
    try {
      await deleteOwnMessage(target.messageId, target.timestamp);
      showToast('Message deleted for everyone.', 'success');
    } catch {
      showToast('Could not delete that message.', 'error');
    }
  };

  const presenceText = peerPresence
    ? peerPresence.status === 'ONLINE'
      ? 'Online'
      : peerPresence.lastSeenAt
        ? `Last seen ${formatMessageTime(peerPresence.lastSeenAt)}`
        : null
    : null;

  const isContactOpen = contactInfoOpen ?? localContactInfoOpen;
  const closeContact = () => {
    setLocalContactInfoOpen(false);
    onCloseContactInfo?.();
  };

  return (
    <>
      {suspended && (
        <div
          role="status"
          className="shrink-0 px-4 py-2.5 flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        >
          <PauseCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-relaxed">
            <span className="font-semibold">{readOnly.title}.</span> {readOnly.body}
          </p>
        </div>
      )}
      {myShare && (
        <div
          role="status"
          className="shrink-0 px-4 py-2.5 flex items-center gap-3 border-b border-green-600/30 bg-green-500/10 text-green-900 dark:text-green-100"
        >
          <Radio className="w-4 h-4 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-relaxed flex-1 min-w-0">
            <span className="font-semibold">
              Sharing your live location with {peerName} until {formatClockTime(myShare.expiresAt, Date.now())}.
            </span>{' '}
            {TAB_BOUND_COPY}
          </p>
          <button
            type="button"
            onClick={() => void liveSharing().stop(matchId)}
            aria-label="Stop sharing your live location"
            {...trackProps(UiElement.CHAT_LIVE_LOCATION_STOP)}
            className="shrink-0 px-3 py-1 rounded-lg border border-current/40 text-xs font-semibold hover:bg-current/10 cursor-pointer"
          >
            Stop
          </button>
        </div>
      )}

      <div className="shrink-0 h-10 px-4 flex items-center justify-between gap-2 border-b border-border/60 bg-surface-card/60">
        <div className="flex items-center gap-3 min-w-0">
          {(candidates.size > 0 || (!historyAllowed && timeline.length > 0)) && !askMode && (
            <button
              type="button"
              onClick={() => setAskMode(true)}
              {...trackProps(UiElement.CHAT_SELECT_OPEN, { value: 'header' })}
              className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80 cursor-pointer shrink-0"
            >
              <Sparkles className={ICON_SECTION.toolbar.pillIcon} aria-hidden="true" />{' '}
              {askFilesOffered ? 'Ask Mr OneHook about messages and files' : 'Ask Mr OneHook about messages'}
            </button>
          )}
          {presenceText && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-text-secondary truncate">
              {peerPresence?.status === 'ONLINE' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              )}
              {presenceText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search in conversation"
            title="Search conversation"
            // TODO(telemetry-parity): switch to UiElement.CHAT_SEARCH_OPEN once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.search_open"
            className={`${ICON_SECTION.toolbar.subHeaderButton} ${
              searchOpen ? 'bg-accent text-bg' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
            }`}
          >
            <Search className={ICON_SECTION.toolbar.subHeaderIcon} />
          </button>
          <button
            type="button"
            onClick={() => (onOpenContactInfo ? onOpenContactInfo() : setLocalContactInfoOpen(true))}
            aria-label="Contact info"
            title="Contact info & shared media"
            // TODO(telemetry-parity): switch to UiElement.CHAT_CONTACT_INFO_OPEN once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.contact_info_open"
            className={`${ICON_SECTION.toolbar.subHeaderButton} text-text-secondary hover:bg-surface-hover hover:text-text`}
          >
            <Info className={ICON_SECTION.toolbar.subHeaderIcon} />
          </button>
          {onOpenIntro && (
            <button
              type="button"
              onClick={onOpenIntro}
              aria-label="How OneHook chat works"
              title="How OneHook chat works"
              // TODO(telemetry-parity): switch to UiElement.CHAT_INTRO_TOUR_OPEN once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.intro_tour_open"
              className={`hidden sm:flex ${ICON_SECTION.toolbar.subHeaderButton} text-text-secondary hover:bg-surface-hover hover:text-text`}
            >
              <HelpCircle className={ICON_SECTION.toolbar.subHeaderIcon} />
            </button>
          )}
          {peerId && (
            <CallButtons
              peerName={peerName}
              disabled={call.active}
              // A suspended hook refuses call signalling (CONVERSATION_SUSPENDED): explain instead of ringing.
              locked={Boolean(suspended) || eligibility.locked}
              lockMessage={suspended ? (archived ? ARCHIVED_CALL_COPY : SUSPENDED_CALL_COPY) : eligibility.lockMessage}
              onAudio={() =>
                peerId && void call.startCall({ matchId, peerId, peerName, media: 'AUDIO' })
              }
              onVideo={() =>
                peerId && void call.startCall({ matchId, peerId, peerName, media: 'VIDEO' })
              }
            />
          )}
        </div>
      </div>

      {/* In-conversation Search bar */}
      {searchOpen && (
        <div className="shrink-0 px-4 py-2.5 bg-surface-card border-b border-border space-y-2">
          <search className="flex items-center gap-2">
            <label htmlFor="chat-in-thread-search" className="sr-only">
              Search messages
            </label>
            <input
              id="chat-in-thread-search"
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchIdx(0);
              }}
              placeholder="Search messages…"
              className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-text outline-none focus:border-accent"
            />
            {searchHits.length > 0 && (
              <span className="text-[11px] text-text-secondary tabular-nums shrink-0">
                {searchIdx + 1} / {searchHits.length}
              </span>
            )}
            <button
              type="button"
              disabled={searchHits.length === 0}
              onClick={() => {
                const next = searchIdx - 1 >= 0 ? searchIdx - 1 : searchHits.length - 1;
                setSearchIdx(next);
                if (searchHits[next]) jumpToMessage(searchHits[next]);
              }}
              aria-label="Older match"
              // TODO(telemetry-parity): switch to UiElement.CHAT_SEARCH_STEP once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.search_step"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border disabled:opacity-40 cursor-pointer"
            >
              <ChevronUp className={ICON_SECTION.composer.inlineActionIcon} />
            </button>
            <button
              type="button"
              disabled={searchHits.length === 0}
              onClick={() => {
                const next = (searchIdx + 1) % searchHits.length;
                setSearchIdx(next);
                if (searchHits[next]) jumpToMessage(searchHits[next]);
              }}
              aria-label="Newer match"
              // TODO(telemetry-parity): switch to UiElement.CHAT_SEARCH_STEP once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.search_step"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border disabled:opacity-40 cursor-pointer"
            >
              <ChevronDown className={ICON_SECTION.composer.inlineActionIcon} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              aria-label="Close search"
              // TODO(telemetry-parity): switch to UiElement.CHAT_SEARCH_OPEN once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.search_open"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-hover cursor-pointer"
            >
              <X className={ICON_SECTION.composer.inlineActionIcon} />
            </button>
          </search>
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Search filters">
            {(
              [
                ['all', 'All'],
                ['from_me', 'From me'],
                ['from_them', 'From them'],
                ['media', 'Media'],
                ['links', 'Links'],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={searchFilter === f}
                onClick={() => {
                  setSearchFilter(f);
                  setSearchIdx(0);
                }}
                // TODO(telemetry-parity): switch to UiElement.CHAT_SEARCH_FILTER once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for chat.search_filter"
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border cursor-pointer ${
                  searchFilter === f
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-surface border-border text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="flex-1 relative min-h-0"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <ChatBackdrop wallpaper={wallpaper} />
        {dragActive && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent pointer-events-none"
            aria-hidden="true"
          >
            <p className="text-xs uppercase tracking-[0.3em] font-black text-accent">Drop to send</p>
          </div>
        )}
        <div
          ref={scrollContainerRef}
          onScroll={handleTimelineScroll}
          className="relative h-full p-6 md:p-8 space-y-2 overflow-y-auto min-h-0 z-[1]"
        >
          {/*
            A horizon means the account was reset, so those messages can never be opened again and
            offering recovery would be a false promise. Otherwise fall back to the restore prompt.
          */}
          {hasUndecryptable &&
            (historyHorizon ? (
              <HistoryHorizonMarker horizonAt={historyHorizon} />
            ) : (
              <HistoryLockedBanner onRestore={() => setRecoveryOpen(true)} />
            ))}
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner size="md" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-center p-8">
              <p className="text-xs text-red-500 italic">{error.message}</p>
            </div>
          ) : timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-70">
              <p className="text-xs italic font-serif">
                No messages yet. Say hello to {peerName} whenever you&rsquo;re ready.
              </p>
              {onOpenIntro && (
                <button
                  type="button"
                  onClick={onOpenIntro}
                  // TODO(telemetry-parity): switch to UiElement.CHAT_INTRO_TOUR_OPEN once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat.intro_tour_open"
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  How OneHook chat works
                </button>
              )}
            </div>
          ) : (
            timeline.map((item, idx) => {
              const prevItem = idx > 0 ? timeline[idx - 1] : null;
              const showDayHeader = !prevItem || !sameLocalDay(prevItem.ts, item.ts);

              if (item.kind === 'call') {
                return (
                  <div key={`call-${item.call.callId}`} className="space-y-2 pt-2">
                    {showDayHeader && (
                      <div className="flex justify-center my-2">
                        <span className="px-3 py-0.5 rounded-full bg-surface/80 border border-border/60 text-[10px] font-semibold text-text-secondary">
                          {formatDayLabel(item.ts)}
                        </span>
                      </div>
                    )}
                    <CallHistoryItem call={item.call} currentUserId={currentUserId} />
                  </div>
                );
              }

              const m = item.message;
              const mine = m.senderId === 'me';
              const pos = bubblePositions.get(m.messageId) ?? 'single';
              const isGroupedTop = pos === 'middle' || pos === 'last';
              const isGroupEnd = pos === 'single' || pos === 'last';
              const quoted = m.replyToMessageId ? messageById.get(m.replyToMessageId) : undefined;
              const msgReactions = reactionsByMessage[m.messageId] ?? {};
              const reactionChips = buildReactionChips(msgReactions, currentUserId);
              const expiringSec = getSentDisappearingSeconds(m.messageId);
              const isStarred = starredIds.has(m.messageId);
              const showUnreadDivider = initialUnreadId && initialUnreadId === m.messageId;
              const isSearchHit = highlightedId === m.messageId || (searchOpen && searchHits[searchIdx] === m.messageId);

              const cornerClass = mine
                ? isGroupEnd
                  ? 'rounded-2xl rounded-br-sm'
                  : 'rounded-2xl rounded-r-md'
                : isGroupEnd
                  ? 'rounded-2xl rounded-bl-sm'
                  : 'rounded-2xl rounded-l-md';

              return (
                <div key={m.messageId} className={isGroupedTop ? 'pt-0.5' : 'pt-3'}>
                  {showDayHeader && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-0.5 rounded-full bg-surface/80 border border-border/60 text-[10px] font-semibold text-text-secondary">
                        {formatDayLabel(m.timestamp)}
                      </span>
                    </div>
                  )}
                  {showUnreadDivider && (
                    <div className="flex items-center gap-3 my-3" role="separator" aria-label="Unread messages">
                      <div className="h-px flex-1 bg-accent/40" />
                      <span className="text-[10px] uppercase tracking-widest font-bold text-accent">
                        Unread messages
                      </span>
                      <div className="h-px flex-1 bg-accent/40" />
                    </div>
                  )}
                  <div
                    data-message-id={m.messageId}
                    data-track-exempt="gesture: context menu opens tracked message action menu"
                    onContextMenu={(e) => {
                      if (askMode || m.undecryptable) return;
                      e.preventDefault();
                      setMenuMessageId((prev) => (prev === m.messageId ? null : m.messageId));
                    }}
                    className={`group/msg max-w-md relative transition-all ${mine ? 'ml-auto' : ''} ${
                      askMode && askSelected.includes(m.messageId) ? 'ring-2 ring-accent rounded-2xl' : ''
                    } ${isSearchHit ? 'ring-2 ring-amber-400 rounded-2xl' : ''}`}
                  >
                    {askMode && candidates.has(m.messageId) && (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={askSelected.includes(m.messageId)}
                        aria-label={askCheckboxLabel(candidates.get(m.messageId)!)}
                        onClick={() => toggleAskSelected(m.messageId)}
                        {...trackProps(UiElement.CHAT_SELECT_TOGGLE, {
                          value: askSelected.includes(m.messageId) ? 'deselected' : 'selected',
                        })}
                        className={`absolute top-6 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer ${
                          mine ? '-left-8' : '-right-8'
                        } ${askSelected.includes(m.messageId) ? 'bg-accent border-accent text-bg' : 'bg-surface border-border'}`}
                      >
                        {askSelected.includes(m.messageId) && <Check className="w-3.5 h-3.5" />}
                      </button>
                    )}

                    {!isGroupedTop && (
                      <div
                        className={`text-[9px] uppercase tracking-widest opacity-45 mb-1 flex items-center gap-2 ${
                          mine ? 'justify-end' : ''
                        }`}
                      >
                        <span>{mine ? 'You' : peerName}</span>
                      </div>
                    )}

                    <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div
                        className={`p-3.5 md:p-4 ${cornerClass} ${fontSizeOption.textClass} leading-relaxed flex-1 min-w-0 ${
                          mine
                            ? 'bg-ig-blue text-white shadow-sm'
                            : 'bg-surface text-text border border-border/60'
                        }`}
                      >
                        {/* Quoted Reply Preview */}
                        {m.replyToMessageId && (
                          <button
                            type="button"
                            onClick={() => jumpToMessage(m.replyToMessageId!)}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_REPLY_JUMP once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.reply_jump"
                            className={`w-full text-left mb-2 px-2.5 py-1.5 rounded-lg border-l-2 text-xs truncate cursor-pointer ${
                              mine
                                ? 'bg-black/15 border-white/70 text-white/90'
                                : 'bg-bg/70 border-accent text-text-secondary'
                            }`}
                          >
                            <span className="block text-[10px] font-bold">
                              {quoted?.senderId === 'me' ? 'You' : peerName}
                            </span>
                            <span className="block truncate opacity-80">
                              {quoted ? messagePreviewText(quoted) : 'Original message'}
                            </span>
                          </button>
                        )}

                        {/*
                          MUST branch on `undecryptable`: an unreadable message carries an EMPTY body, so
                          rendering `ciphertext` unconditionally produced a silent blank bubble. Attachment
                          decoding, text, and both retry paths are handled inside MatchMessageBody.
                        */}
                        <MatchMessageBody
                          message={m}
                          mine={mine}
                          cache={attachmentCache}
                          matchId={matchId}
                          transfer={attachmentTransfers[m.messageId]}
                          onRetryAttachment={() => decisionWindow.gateSend(() => retryAttachment(m.messageId))}
                          onRestore={() => setRecoveryOpen(true)}
                          onReportPeerMedia={onReportPeer}
                          onRetryText={(text) => decisionWindow.gateSend(() => sendMessage(text, sendOptions))}
                          live={liveContext}
                          canSaveMedia={PartnerRestrictionGate.canSaveMedia(mine, restrictions)}
                        />

                        <div
                          className={`mt-1.5 flex items-center gap-1.5 text-[10px] opacity-65 ${
                            mine ? 'justify-end text-white/80' : 'text-text-muted'
                          }`}
                        >
                          {expiringSec && <Clock className="w-2.5 h-2.5" aria-label="Disappearing message" />}
                          {isStarred && <Star className="w-2.5 h-2.5 fill-current text-amber-400" aria-label="Starred message" />}
                          <span>{formatMessageTime(m.timestamp)}</span>
                          {statusIcon(m)}
                        </div>
                      </div>

                      {/* Accessible keyboard / hover message actions trigger */}
                      {!askMode && !m.undecryptable && (
                        <div className="relative opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleReplyMessage(m)}
                            aria-label="Reply to message"
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_REPLY once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_reply"
                            className="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text cursor-pointer"
                          >
                            <CornerUpLeft className={ICON_SECTION.composer.inlineActionIcon} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMenuMessageId((prev) => (prev === m.messageId ? null : m.messageId))
                            }
                            aria-label="Message actions"
                            aria-haspopup="menu"
                            aria-expanded={menuMessageId === m.messageId}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_MENU_OPEN once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_menu_open"
                            className="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text cursor-pointer"
                          >
                            <MoreHorizontal className={ICON_SECTION.composer.inlineActionIcon} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Message Context / Action Menu */}
                    {menuMessageId === m.messageId && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setMenuMessageId(null)}
                          data-track-exempt="backdrop: click-away closing message menu"
                        />
                        <div
                          role="menu"
                          className={`absolute z-40 mt-1 w-52 rounded-2xl border border-border bg-surface-card shadow-xl p-1.5 space-y-1 ${
                            mine ? 'right-0' : 'left-0'
                          }`}
                        >
                          <div className="flex items-center justify-between px-1.5 py-1 border-b border-border/60">
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  setMenuMessageId(null);
                                  void handleQuickReaction(m.messageId, emoji);
                                }}
                                // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_REACT once enabled on web.
                                data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_react"
                                className="w-7 h-7 rounded-lg hover:bg-surface-hover text-base flex items-center justify-center cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              type="button"
                              aria-label="More reactions"
                              onClick={() => {
                                setMenuMessageId(null);
                                setReactionPickerFor(m.messageId);
                              }}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_REACTION_PICKER_OPEN once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.reaction_picker_open"
                              className="w-7 h-7 rounded-lg hover:bg-surface-hover flex items-center justify-center text-text-secondary cursor-pointer"
                            >
                              <Smile className={ICON_SECTION.composer.menuItemIcon} />
                            </button>
                          </div>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuMessageId(null);
                              handleReplyMessage(m);
                            }}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_REPLY once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_reply"
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-lg cursor-pointer"
                          >
                            <CornerUpLeft className={ICON_SECTION.composer.inlineActionIcon} /> Reply
                          </button>

                          {mrOneHookPrefs.asksInMessageMenus && candidates.has(m.messageId) && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuMessageId(null);
                                setAskMode(true);
                                toggleAskSelected(m.messageId);
                              }}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_ASK_MR_ONEHOOK once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_ask_mr_onehook"
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-accent hover:bg-surface-hover rounded-lg cursor-pointer"
                            >
                              <Sparkles className={ICON_SECTION.composer.inlineActionIcon} /> Ask Mr.OneHook
                            </button>
                          )}

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuMessageId(null);
                              void toggleStarred?.(m.messageId).catch(() =>
                                showToast('Could not update star.', 'error')
                              );
                            }}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MEDIA_STAR once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.media_star"
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-lg cursor-pointer"
                          >
                            <Star className={ICON_SECTION.composer.inlineActionIcon} /> {isStarred ? 'Unstar' : 'Star'}
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuMessageId(null);
                              void handleCopyMessage(m);
                            }}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_COPY once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_copy"
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-lg cursor-pointer"
                          >
                            <Copy className={ICON_SECTION.composer.inlineActionIcon} /> Copy
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuMessageId(null);
                              setInfoMessage(m);
                            }}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_INFO once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_info"
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text hover:bg-surface-hover rounded-lg cursor-pointer"
                          >
                            <Info className={ICON_SECTION.composer.inlineActionIcon} /> Message info
                          </button>

                          {mine && deleteOwnMessage && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuMessageId(null);
                                setDeleteConfirmMsg(m);
                              }}
                              // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_DELETE once enabled on web.
                              data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_delete"
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-500 hover:bg-surface-hover rounded-lg cursor-pointer"
                            >
                              <Trash2 className={ICON_SECTION.composer.inlineActionIcon} /> Delete for everyone
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Encrypted reaction chips */}
                    {reactionChips.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {reactionChips.map((chip) => (
                          <button
                            key={chip.emoji}
                            type="button"
                            onClick={() => void handleQuickReaction(m.messageId, chip.emoji)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setReactionDetailsFor({ messageId: m.messageId, emoji: chip.emoji });
                            }}
                            // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_REACT once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_react"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors cursor-pointer ${
                              chip.includesMine
                                ? 'bg-accent/15 border-accent text-text'
                                : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
                            }`}
                          >
                            <span>{chip.emoji}</span>
                            {chip.count > 1 && <span className="text-[10px] font-semibold">{chip.count}</span>}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setReactionDetailsFor({ messageId: m.messageId })}
                          aria-label="Who reacted"
                          // TODO(telemetry-parity): switch to UiElement.CHAT_REACTION_DETAILS_OPEN once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.reaction_details_open"
                          className="px-1.5 py-0.5 rounded-full text-[10px] border border-border bg-surface text-text-muted hover:text-text cursor-pointer"
                        >
                          Details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Typing bubble */}
          {peerTyping && (
            <div className="max-w-xs pt-2" role="status" aria-live="polite">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-surface border border-border/60 text-xs text-text-secondary">
                <span>{peerName} is typing</span>
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-text-secondary animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1 h-1 rounded-full bg-text-secondary animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1 h-1 rounded-full bg-text-secondary animate-bounce" />
                </span>
              </div>
            </div>
          )}

          {/* Peer screenshot alert */}
          {peerScreenshotAt && (
            <div className="flex justify-center pt-2">
              <span className="px-3 py-1 rounded-full bg-surface border border-border text-[11px] text-text-secondary">
                {peerName} took a screenshot · {formatMessageTime(peerScreenshotAt)}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Jump-to-latest pill with filled accent unread badge (feat/ui-round4 parity) */}
        {awayFromBottom && (
          <button
            type="button"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              setUnseenWhileAway(0);
              setAwayFromBottom(false);
            }}
            // TODO(telemetry-parity): switch to UiElement.CHAT_JUMP_TO_LATEST once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.jump_to_latest"
            className="absolute bottom-4 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-accent text-bg text-xs font-semibold shadow-lg hover:opacity-95 cursor-pointer"
          >
            <ArrowDown className={ICON_SECTION.composer.inlineActionIcon} aria-hidden="true" />
            <span>Latest</span>
            {unseenWhileAway > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-bg text-accent text-[10px] font-bold">
                {unseenWhileAway}
              </span>
            )}
          </button>
        )}
      </div>

      {askMode && (
        <div
          className="shrink-0 px-4 py-3 border-t border-accent/40 bg-accent/5 flex items-center gap-3 flex-wrap"
          data-testid="ask-mr-onehook-bar"
        >
          <div className="flex-1 min-w-0 text-xs text-text">
            <p className="font-semibold">
              {askSelected.length > 0
                ? `${askCountPhrase(askTotals.messages, askTotals.files) || `${askSelected.length}`} selected`
                : historyAllowed
                  ? askFilesOffered
                    ? `Select messages, or up to ${askLimits.maxFiles} photos or files`
                    : 'Select messages'
                  : askFilesOffered
                    ? `Select up to ${askLimits.maxFiles} photos or files`
                    : 'Nothing to select'}
            </p>
            <p className="text-text-secondary" role={askNotice ? 'status' : undefined}>
              {askNotice ??
                (!historyAllowed
                  ? `${ASK_HISTORY_NOT_ALLOWED_COPY}${askFilesOffered ? ' You can still select files.' : ''}`
                  : restrictions.mrOneHook
                    ? PartnerRestrictionGate.mrOneHookLeftOutNotice(peerName)
                    : 'Mr OneHook reads them for one answer. They are not kept.')}
            </p>
          </div>
          <button
            type="button"
            onClick={exitAskMode}
            {...trackProps(UiElement.CHAT_SELECT_CANCEL)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text cursor-pointer"
          >
            Cancel
          </button>
          <AskMrOneHookButton
            plan={pro.plan}
            selectedCount={askSelected.length}
            fileCount={askTotals.files}
            busy={asking}
            onClick={askMrOneHook}
          />
        </div>
      )}
      {askConfirm && (
        <AskMrOneHookConfirm
          share={askConfirm}
          matchName={peerName}
          maxMessageCharacters={askLimits.maxMessageCharacters}
          onCancel={exitAskMode}
          onConfirm={() => void confirmAsk()}
        />
      )}

      {/* Decision window bar above composer */}
      {!suspended && (
        <DecisionWindowBar
          matchId={matchId}
          peerName={peerName}
          onLetGo={() => onOpenLetGo?.()}
        />
      )}

      <Composer
        value={input}
        onChange={handleInputChange}
        onSend={handleSend}
        readOnlyReason={suspended ? readOnly.composer : undefined}
        above={
          <>
            {replyTo && (
              <div className="flex items-start gap-2 mb-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
                <CornerUpLeft className={`${ICON_SECTION.composer.inlineActionIcon} text-accent mt-0.5`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text">Replying to {replyTo.senderLabel}</p>
                  <p className="truncate text-text-secondary">{replyTo.preview}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                  // TODO(telemetry-parity): switch to UiElement.CHAT_REPLY_CANCEL once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat.reply_cancel"
                  className="p-0.5 text-text-muted hover:text-text cursor-pointer"
                >
                  <X className={ICON_SECTION.composer.inlineActionIcon} />
                </button>
              </div>
            )}
            {!suspended && (
              <div className="flex items-center justify-end mb-1.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
                  <Clock className={ICON_SECTION.section.badgeIcon} aria-hidden="true" />
                  <span>Disappearing:</span>
                  <select
                    value={String(disappearSeconds)}
                    onChange={(e) => setDisappearSeconds(Number(e.target.value) || 0)}
                    aria-label="Disappearing messages timer"
                    className="bg-transparent text-text font-medium outline-none cursor-pointer"
                  >
                    {DISAPPEARING_PRESETS.map((p) => (
                      <option key={p.seconds} value={String(p.seconds)}>
                        {p.seconds === 0 ? 'Off' : formatDisappearingShort(p.seconds)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </>
        }
        leading={
          <AttachmentComposer
            disabled={loading || Boolean(suspended)}
            onPickFile={(file, kind) => void handlePickFile(file, kind)}
            onVoiceNote={handleVoiceNote}
            onPickLocation={() => setLocationOpen(true)}
            onPickContact={contactShare.openContact}
          />
        }
      />

      <LocationShareSheet
        open={locationOpen && !suspended}
        peerName={peerName}
        runningShare={myShare}
        onClose={() => setLocationOpen(false)}
        onSendCurrent={sendCurrentLocation}
        onStartLive={startLiveShare}
      />

      <ContactShareSheet
        state={suspended ? { ...contactShare.state, open: false } : contactShare.state}
        peerName={peerName}
        onPickAgain={contactShare.pickAgain}
        onClose={contactShare.close}
        onSend={sendStructured}
      />

      <HistoryRecoveryModal
        userId={currentUserId}
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        onRecovered={() => void refetch()}
      />

      <ChatContactInfoModal
        open={isContactOpen}
        onClose={closeContact}
        matchId={matchId}
        peerName={peerName}
        peerPhoto={peerPhoto}
        presenceText={presenceText}
        messages={messages}
        starredIds={starredIds}
        attachmentCache={attachmentCache}
        restrictions={restrictions}
        onToggleStar={(id) => void toggleStarred?.(id)}
        onJumpToMessage={jumpToMessage}
        onStartCall={
          peerId && !suspended && !eligibility.locked
            ? (media) => void call.startCall({ matchId, peerId, peerName, media })
            : undefined
        }
        onOpenSearch={() => setSearchOpen(true)}
        onViewProfile={() => onViewProfile?.()}
        onOpenChatSettings={() => onOpenChatSettings?.()}
        onUnhook={() => onOpenLetGo?.()}
        onBlock={() => onReportPeer?.()}
        onReport={() => onViewProfile?.()}
        onArchived={onArchived}
      />

      <EmojiReactionPickerDialog
        open={Boolean(reactionPickerFor)}
        onClose={() => setReactionPickerFor(null)}
        currentReactionSet={reactionPickerFor ? reactionsByMessage[reactionPickerFor]?.[currentUserId] : null}
        onPick={(emoji) => {
          if (reactionPickerFor) void handleQuickReaction(reactionPickerFor, emoji);
        }}
      />

      <ReactionDetailsDialog
        open={Boolean(reactionDetailsFor)}
        onClose={() => setReactionDetailsFor(null)}
        reactions={reactionDetailsFor ? reactionsByMessage[reactionDetailsFor.messageId] ?? {} : {}}
        myUserId={currentUserId}
        partnerName={peerName}
        initialEmoji={reactionDetailsFor?.emoji}
        onToggleMine={(emoji) => {
          if (reactionDetailsFor) void handleQuickReaction(reactionDetailsFor.messageId, emoji);
        }}
      />

      <MessageInfoDialog
        message={infoMessage}
        onClose={() => setInfoMessage(null)}
        starred={infoMessage ? starredIds.has(infoMessage.messageId) : false}
      />

      <ModalDialog
        open={Boolean(deleteConfirmMsg)}
        onClose={() => setDeleteConfirmMsg(null)}
        label="Delete message for everyone?"
      >
        <div className="p-5 space-y-4">
          <h3 className="text-base font-serif italic font-bold text-text">Delete this message for everyone?</h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            This removes the message from both devices.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setDeleteConfirmMsg(null)}
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteConfirm()}
              // TODO(telemetry-parity): switch to UiElement.CHAT_MESSAGE_DELETE once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for chat.message_delete"
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </ModalDialog>

      {decisionWindow.confirmDialog}

      {peerId && (
        <ReportFlowDialog
          open={!!reportOpen}
          onClose={() => onCloseReport?.()}
          source="chat"
          reportedUserId={peerId}
          reportedName={peerName}
          conversationId={matchId}
          sourceMessages={fullEvidence ?? evidenceMessages}
          onRequestBlock={onReportPeer}
          onRequestUnmatch={onRequestUnmatch}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mr.OneHook conversation — authenticated member chat. Local-only transcript; it
// never writes to the E2EE match APIs and is never surfaced as a match. A scope
// is either product-only or exactly ONE authorized match; match scope can ground
// answers in locally-decrypted history, but only after the model asks for context
// and the user explicitly approves the excerpts.
// ─────────────────────────────────────────────────────────────────────────────

/** The Mr OneHook conversation with its scope header. Exported for UI tests (the header's Pro button). */
export function MrOneHookConversation({
  currentUser,
  wallpaper,
  matches,
  pro,
  handoff,
  onHandoffTaken,
}: {
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
  matches: HydratedMatch[];
  pro: MrOneHookPlanContext;
  /** "Ask Mr OneHook" from a match chat: open that match's chat with these messages and files attached. */
  handoff: ({ matchId: string } & AskHandoff) | null;
  onHandoffTaken: () => void;
}) {
  // Scope the conversation to product-only (default) or a single match the user picks here.
  const [scope, setScope] = useState<MrOneHookScope>(() =>
    handoff ? { type: 'match', matchId: handoff.matchId } : { type: 'product' },
  );
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  useEffect(() => {
    if (handoff) setScope({ type: 'match', matchId: handoff.matchId });
  }, [handoff]);

  const activeMatch =
    scope.type === 'match' ? matches.find((m) => m.matchId === scope.matchId) ?? null : null;

  // If the chosen match disappears (unmatch/block), fall back to product scope.
  useEffect(() => {
    if (scope.type === 'match' && !matches.some((m) => m.matchId === scope.matchId)) {
      setScope({ type: 'product' });
    }
  }, [scope, matches]);

  const activeMatchName =
    activeMatch?.peerProfile?.displayName || activeMatch?.peerProfile?.name || 'your match';

  return (
    <>
      {/* Scope selector: Product-only, or ground answers in one authorized match's local history. */}
      <div className="shrink-0 px-4 md:px-6 pt-3 pb-2 border-b border-border/60 bg-surface-card/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest font-bold text-text-muted">
            Context
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setScopeMenuOpen((v) => !v)}
              {...trackProps(UiElement.CHAT_MR_ONEHOOK_SCOPE_OPEN)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-semibold text-text hover:bg-surface-hover transition-colors cursor-pointer"
              aria-haspopup="menu"
              aria-expanded={scopeMenuOpen}
            >
              <Sparkles className={`${ICON_SECTION.toolbar.pillIcon} text-accent`} />
              <span className="max-w-[160px] truncate">
                {scope.type === 'product' ? 'OneHook (product only)' : activeMatchName}
              </span>
              <ChevronDown className={`${ICON_SECTION.toolbar.pillIcon} opacity-70`} />
            </button>
            <AnimatePresence>
              {scopeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setScopeMenuOpen(false)} data-track-exempt="backdrop: click-away that closes the scope menu." />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    role="menu"
                    className="absolute left-0 mt-2 w-64 max-h-72 overflow-y-auto bg-surface-card border border-border rounded-xl shadow-xl z-50 py-1"
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={scope.type === 'product'}
                      onClick={() => {
                        setScope({ type: 'product' });
                        setScopeMenuOpen(false);
                      }}
                      {...trackProps(UiElement.CHAT_MR_ONEHOOK_SCOPE_SELECT, { targetId: 'product' })}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors flex items-center justify-between text-text cursor-pointer"
                    >
                      <span>OneHook (product only)</span>
                      {scope.type === 'product' && <Check className="w-3.5 h-3.5 text-accent" />}
                    </button>
                    {matches.length > 0 && <div className="my-0.5 border-t border-border" />}
                    {matches.map((m) => {
                      const name = m.peerProfile?.displayName || m.peerProfile?.name || 'Your Match';
                      const checked = scope.type === 'match' && scope.matchId === m.matchId;
                      return (
                        <button
                          key={m.matchId}
                          type="button"
                          role="menuitemradio"
                          aria-checked={checked}
                          onClick={() => {
                            setScope({ type: 'match', matchId: m.matchId });
                            setScopeMenuOpen(false);
                          }}
                          {...trackProps(UiElement.CHAT_MR_ONEHOOK_SCOPE_SELECT, { targetId: m.matchId })}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors flex items-center justify-between text-text cursor-pointer"
                        >
                          <span className="truncate">{name}</span>
                          {checked && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          {scope.type === 'match' && (
            <span className="text-[10px] text-text-muted italic">
              Mr.OneHook can reference this chat only after you review &amp; approve excerpts.
            </span>
          )}
          {pro.proVisible && (
            <button
              type="button"
              onClick={openMrOneHookPro}
              {...trackProps(UiElement.CHAT_MR_ONEHOOK_GET_PRO, { value: 'header' })}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full border border-accent/40 text-xs font-semibold text-accent hover:bg-accent/5 cursor-pointer"
            >
              <Sparkles className={ICON_SECTION.toolbar.pillIcon} aria-hidden="true" />
              {pro.plan === MrOneHookPlan.PRO ? 'Mr OneHook Pro' : 'Get Mr OneHook Pro'}
            </button>
          )}
        </div>
      </div>

      {scope.type === 'match' && activeMatch ? (
        <MrOneHookMatchScope
          key={activeMatch.matchId}
          currentUser={currentUser}
          wallpaper={wallpaper}
          match={activeMatch}
          matchName={activeMatchName}
          pro={pro}
          onOpenScope={setScope}
          handoff={handoff?.matchId === activeMatch.matchId ? handoff : undefined}
          onHandoffTaken={onHandoffTaken}
        />
      ) : (
        <MrOneHookProductScope currentUser={currentUser} wallpaper={wallpaper} pro={pro} onOpenScope={setScope} />
      )}
    </>
  );
}

/** Product-only Mr.OneHook: no match, no excerpts — the always-available baseline. */
function MrOneHookProductScope({
  currentUser,
  wallpaper,
  pro,
  onOpenScope,
}: {
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
  pro: MrOneHookPlanContext;
  onOpenScope: (scope: MrOneHookScope) => void;
}) {
  const chat = useMrOneHookChat({
    userId: currentUser.id,
    scope: { type: 'product' },
    onPlan: notePlanFromChat,
    onOpenScope,
  });
  return (
    <MrOneHookChatBody
      chat={chat}
      currentUserId={currentUser.id}
      wallpaper={wallpaper}
      pro={pro}
      scopeType="product"
    />
  );
}

/**
 * Match-scoped Mr.OneHook. Reads the match's decrypted messages via the SAME `useChatMessages` hook
 * the real conversation uses, and exposes a pure local-search resolver so a `needsMoreContext` turn
 * can select bounded excerpts from that already-decrypted history for the user to review.
 */
function MrOneHookMatchScope({
  currentUser,
  wallpaper,
  match,
  matchName,
  pro,
  onOpenScope,
  handoff,
  onHandoffTaken,
}: {
  key?: string;
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
  match: HydratedMatch;
  matchName: string;
  pro: MrOneHookPlanContext;
  onOpenScope: (scope: MrOneHookScope) => void;
  handoff?: AskHandoff;
  onHandoffTaken: () => void;
}) {
  const { messages } = useChatMessages(match.matchId, match.peerId || undefined);
  const [mrPrefs] = useMrOneHookPrefs(currentUser.id);

  // Stable snapshot of the decrypted turns for the pure selector; recomputed as history changes.
  const selectable = useMemo(() => toSelectableMessages(messages), [messages]);
  const selectableRef = useRef(selectable);
  selectableRef.current = selectable;

  const resolveLocalExcerpts = useCallback(
    (request: ExcerptSelectionRequest) => selectEphemeralExcerpts(selectableRef.current, request),
    [],
  );

  const chat = useMrOneHookChat({
    userId: currentUser.id,
    scope: { type: 'match', matchId: match.matchId },
    onPlan: notePlanFromChat,
    resolveLocalExcerpts: mrPrefs.answersContextRequests ? resolveLocalExcerpts : undefined,
    onOpenScope,
  });

  return (
    <MrOneHookChatBody
      chat={chat}
      currentUserId={currentUser.id}
      wallpaper={wallpaper}
      matchName={matchName}
      pro={pro}
      scopeType="connection"
      handoff={handoff}
      onHandoffTaken={onHandoffTaken}
    />
  );
}

/**
 * Shared presentational body for both scopes: transcript, typing indicator, the inline excerpt
 * review panel (shown only when the model asked for more context AND the device found some), and the
 * composer with its files (Pro). The review panel is the explicit consent gate — nothing is shared
 * until the user approves. Exported for UI tests (the composer and its files).
 */
export function MrOneHookChatBody({
  chat,
  currentUserId,
  wallpaper,
  matchName,
  pro,
  scopeType,
  handoff,
  onHandoffTaken,
}: {
  chat: ReturnType<typeof useMrOneHookChat>;
  currentUserId?: string;
  wallpaper: ChatWallpaper;
  matchName?: string;
  pro: MrOneHookPlanContext;
  scopeType: 'product' | 'connection';
  /** "Ask Mr OneHook" from the match chat (connection scope): confirmed messages and uploaded files. */
  handoff?: AskHandoff;
  onHandoffTaken?: () => void;
}) {
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState<null | { kind: 'replace'; oldest: string; title: string } | { kind: 'delete'; id: string; title: string }>(null);
  const [leavingId, setLeavingId] = useState<string | undefined>(undefined);
  const tabs = mrOneHookTabs(chat.sessions, chat.currentSessionId, chat.replacing);
  // The plan's saved chats (Free 1, Pro 3). At the cap a new chat replaces the least recent one.
  const maxChats = pro.limits.maxSessions;
  const isPro = pro.plan === MrOneHookPlan.PRO;
  const addChat = () => {
    if (chat.loading) return;
    const oldest = leastRecentSession(chat.sessions);
    // Warn only when the cap is known (the Pro status was read); otherwise the server still replaces the
    // least recent chat if it must, and the eviction notice says so.
    if (pro.proVisible && chat.sessions.length >= maxChats && chat.currentSessionId && !chat.replacing && oldest) {
      const title = tabs.find((t) => t.sessionId === oldest.sessionId)?.title ?? 'your least recent chat';
      setConfirm({ kind: 'replace', oldest: oldest.sessionId, title });
      return;
    }
    chat.clear();
  };
  const { messages, loading, mood, pendingReview, availability, send, confirmReview, cancelReview } = chat;
  const [input, setInput] = useState('');
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Terminal availability (not entitled / signed out / not configured): block input entirely. The
  // reason is already surfaced as an assistant bubble by the hook, so the composer just locks.
  const unavailable = availability !== 'AVAILABLE';
  const ephemeralAttachments = useMrOneHookAttachments({ plan: pro.plan, limits: pro.limits });
  const persistentAttachments = useMrOneHookPersistentUploads({
    userId: currentUserId,
    plan: pro.plan,
    limits: pro.limits,
  });
  const attachments = currentUserId ? persistentAttachments : ephemeralAttachments;

  // "Ask Mr OneHook" from the match chat: the files arrive uploaded (keep polling them here), and the
  // messages the member confirmed wait for the next question (memory only; sent once with it).
  const { adopt } = attachments;
  const adoptedHandoff = useRef<AskHandoff | undefined>(undefined);
  const [askExcerpts, setAskExcerpts] = useState<SelectedExcerpt[]>([]);
  useEffect(() => {
    if (!handoff || adoptedHandoff.current === handoff) return;
    if (handoff.items.length === 0 && handoff.excerpts.length === 0) return;
    adoptedHandoff.current = handoff;
    if (handoff.items.length > 0) adopt(handoff.items);
    if (scopeType === 'connection') setAskExcerpts(handoff.excerpts);
    onHandoffTaken?.();
  }, [handoff, adopt, onHandoffTaken, scopeType]);

  // "Your oldest chat was replaced" fades after a few seconds.
  const { evictionNotice, dismissEvictionNotice } = chat;
  useEffect(() => {
    if (!evictionNotice) return;
    const id = window.setTimeout(dismissEvictionNotice, 6000);
    return () => window.clearTimeout(id);
  }, [evictionNotice, dismissEvictionNotice]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pendingReview]);

  const action = composerAction(pro.plan, attachments.items, input);
  // Out of today's free messages: the composer offers Pro instead of sending.
  const limitUpsell = availability === 'LIMIT_REACHED' && pro.proVisible;

  const handleSend = async () => {
    if (limitUpsell || action === 'GET_PRO') {
      openMrOneHookPro();
      return;
    }
    if (action !== 'SEND' || loading || pendingReview || unavailable) return;
    const text = input;
    const turn = attachments.items.length > 0 ? attachments.turnAttachments() : undefined;
    const shared = askExcerpts.length > 0 ? askExcerpts : undefined;
    setInput('');
    setComposerNotice(null);
    // Confirmed messages are a few out of the conversation, so the context is partial (as on iOS).
    const outcome = await send(text, turn, shared ? { excerpts: shared, historyTruncated: true } : undefined);
    if (outcome.status === 'sent') {
      if (turn) attachments.clear();
      if (shared) setAskExcerpts([]);
      return;
    }
    if (outcome.status !== 'attachment_problem') return;
    // The turn was not sent: keep the text and the files.
    setInput(text);
    const problem: AttachmentProblem = outcome.problem;
    if (problem.kind === 'MESSAGE_CONTEXT_NOT_ALLOWED' && shared) {
      // The match does not allow its messages to be used: take them out; the files stay.
      setAskExcerpts([]);
      setComposerNotice(MESSAGE_HISTORY_NOT_ALLOWED_COPY);
      return;
    }
    switch (problem.kind) {
      case 'PRO_REQUIRED':
        openMrOneHookPro();
        break;
      case 'NOT_READY':
        attachments.repoll();
        break;
      case 'NOT_USABLE':
      case 'NOT_FOUND':
        attachments.markFailed(problem);
        break;
      default:
        break;
    }
    setComposerNotice(attachmentProblemCopy(problem));
  };

  const openSentAttachment = (attachmentId: string, name: string) => {
    void openChatAttachmentContent(attachmentId, name).then((ok) => {
      if (!ok) showToast('That file is no longer available.', 'error');
    });
  };

  return (
    <>
      <div className="flex-1 relative min-h-0">
        <ChatBackdrop wallpaper={wallpaper} />
        {/* The chat tabs float at the top of the conversation, on the wallpaper (not part of the header). */}
        <div className="absolute top-0 inset-x-0 z-10 px-4 md:px-6 pt-3 pointer-events-none">
          <div className="pointer-events-auto max-w-3xl mx-auto space-y-2">
            <MrOneHookTabs
              tabs={tabs}
              activeId={chat.currentSessionId}
              leavingId={leavingId}
              onSelect={(id) => void chat.resumeSession(id)}
              onDelete={(id) =>
                setConfirm({ kind: 'delete', id, title: tabs.find((t) => t.sessionId === id)?.title ?? 'this chat' })
              }
              onAdd={addChat}
            />
            {evictionNotice && (
              <div
                role="status"
                className="mx-auto w-fit flex items-center gap-2 rounded-full bg-surface/95 border border-border px-3 py-1 text-xs text-text shadow-sm"
                data-testid="mr-onehook-eviction-notice"
              >
                <span>{evictionNotice}</span>
                <button
                  type="button"
                  onClick={dismissEvictionNotice}
                  {...trackProps(UiElement.CHAT_MR_ONEHOOK_SESSION_LIMIT, { action: 'dismiss' })}
                  aria-label="Dismiss"
                  className="w-4 h-4 flex items-center justify-center text-text/50 hover:text-text cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        {confirm?.kind === 'replace' && (
          <MrOneHookConfirm
            title={`Replace ${confirm.title}?`}
            body={
              maxChats === 1
                ? `On the Free plan you can keep 1 chat. Starting a new one removes ${confirm.title} and its messages.${pro.proVisible && !isPro ? ' With Mr OneHook Pro you can keep 3.' : ''}`
                : `You can keep ${maxChats} chats. Starting a new one removes ${confirm.title}, the one you used least recently. Its messages will be deleted.`
            }
            confirmLabel="Replace"
            element={UiElement.CHAT_MR_ONEHOOK_SESSION_LIMIT}
            confirmOptions={{ value: 'replace_least_recent' }}
            cancelOptions={{ value: 'cancel' }}
            {...(pro.proVisible && !isPro
              ? {
                  extra: {
                    label: 'Get Mr OneHook Pro',
                    onClick: () => {
                      setConfirm(null);
                      openMrOneHookPro();
                    },
                  },
                }
              : {})}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              const old = confirm.oldest;
              setConfirm(null);
              setLeavingId(old);
              window.setTimeout(() => {
                setLeavingId(undefined);
                chat.startReplacingLeastRecent();
              }, 280);
            }}
          />
        )}
        {confirm?.kind === 'delete' && (
          <MrOneHookConfirm
            title="Delete this chat?"
            body="Its messages with Mr. OneHook will be deleted."
            confirmLabel="Delete"
            element={UiElement.CHAT_MR_ONEHOOK_SESSION_DELETE}
            cancelOptions={{ action: 'dismiss' }}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              const id = confirm.id;
              setConfirm(null);
              void chat.deleteSession(id).catch(() => undefined);
            }}
          />
        )}
        <div className="relative h-full px-6 md:px-8 pb-6 md:pb-8 pt-20 space-y-6 overflow-y-auto min-h-0">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="space-y-2 opacity-80">
                <Mascot mood="Happy" className="w-16 h-16 mx-auto" />
                <p className="text-xs italic font-serif max-w-xs">
                  {scopeType === 'connection' && matchName
                    ? `Ask me for thoughtful ideas, conversation starters, or reflection around ${matchName}.`
                    : 'Share what’s on your mind, ask me anything about OneHook, or just say hi.'}
                </p>
              </div>
              {!unavailable && (
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {(scopeType === 'connection'
                    ? [
                        `Suggest a thoughtful reply to ${matchName ?? 'my match'}`,
                        'Ideas for a first meetup',
                        'Help me keep the conversation flowing',
                      ]
                    : [
                        'How does OneHook matching work?',
                        'Help me improve my prompts',
                        'How do archives and unhooks work?',
                      ]
                  ).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      // TODO(telemetry-parity): switch to UiElement.CHAT_MR_ONEHOOK_OPEN once prompt cards have dedicated ID.
                      data-track-exempt="disabled: pending telemetry web parity enablement for chat.mr_onehook_open"
                      className="px-3 py-1.5 rounded-full border border-border bg-surface hover:bg-surface-hover text-xs text-text transition-colors cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m: MrOneHookMessage, i) => (
              <div key={i} className={`max-w-md ${m.role === 'user' ? 'ml-auto' : ''}`}>
                <div
                  className={`text-[9px] uppercase tracking-widest opacity-40 mb-1 ${
                    m.role === 'user' ? 'text-right' : ''
                  }`}
                >
                  {m.role === 'user' ? 'You' : 'Mr.OneHook'}
                </div>
                <div
                  className={`p-4 md:p-5 rounded-2xl text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-ig-blue text-white shadow-sm rounded-br-sm'
                      : m.isError
                        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 rounded-bl-sm'
                        : 'bg-surface text-text border border-border/60 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                  {m.attachments && m.attachments.length > 0 && (
                    <SentAttachmentChips
                      refs={m.attachments}
                      inverted={m.role === 'user'}
                      onOpen={(ref) => ref.attachmentId && openSentAttachment(ref.attachmentId, ref.name)}
                    />
                  )}
                </div>
              </div>
            ))
          )}

          {/* Inline excerpt review — explicit consent before any match message leaves the device. */}
          {pendingReview && (
            <ExcerptReviewPanel
              review={pendingReview}
              matchName={matchName}
              onConfirm={() => void confirmReview()}
              onCancel={cancelReview}
              disabled={loading}
            />
          )}

          {loading && (
            <div className="max-w-md">
              <div className="text-[9px] uppercase tracking-widest opacity-40 mb-1">Mr.OneHook</div>
              <div className="p-4 rounded-2xl bg-surface text-text border border-border/60 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce [animation-delay:-0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce [animation-delay:-0.1s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={() => void handleSend()}
        disabled={loading || pendingReview !== null || unavailable}
        above={
          <>
            <AskingAboutBar excerpts={askExcerpts} matchName={matchName} onRemove={() => setAskExcerpts([])} />
            <PendingAttachmentChips items={attachments.items} onRemove={attachments.remove} />
            {composerNotice && (
              <p role="status" className="pb-2 text-[11px] text-orange-600 dark:text-orange-400">
                {composerNotice}
              </p>
            )}
          </>
        }
        leading={
          pro.proVisible && !unavailable ? (
            <MrOneHookAttachButton
              disabled={loading || pendingReview !== null}
              onFiles={(files) => {
                const rejected = attachments.add(files);
                setComposerNotice(rejected.length ? rejectionCopy(rejected, pro.limits) : null);
              }}
            />
          ) : undefined
        }
        sendUpsell={limitUpsell ? 'daily_limit' : action === 'GET_PRO' ? 'composer' : undefined}
        sendLabel={limitUpsell ? 'Get Mr OneHook Pro' : composerSendLabel(action)}
        sendEnabled={
          limitUpsell || action === 'GET_PRO'
            ? true
            : action === 'SEND' && !loading && pendingReview === null && !unavailable
        }
        placeholder={
          unavailable
            ? availability === 'LIMIT_REACHED'
              ? 'Today’s free messages are used up. Get Mr OneHook Pro or come back tomorrow.'
              : availability === 'NOT_AUTHENTICATED'
                ? 'Sign in again to chat with Mr.OneHook.'
                : 'Mr.OneHook is temporarily unavailable.'
            : pendingReview
              ? 'Review the excerpts above first…'
              : askExcerpts.length > 0
                ? askExcerpts.length === 1
                  ? 'Ask about this message…'
                  : 'Ask about these messages…'
                : scopeType === 'connection' && attachments.items.length > 0
                ? `Ask about these files and ${matchName ?? 'your match'}…`
                : 'Say something to Mr.OneHook…'
        }
        footerRight={
          typeof chat.remainingMessages === 'number'
            ? `${chat.remainingMessages} free message${chat.remainingMessages === 1 ? '' : 's'} left today`
            : 'OneHook AI · Always Here'
        }
      />
    </>
  );
}

/**
 * The consent gate. Shows the EXACT excerpts that would be shared (speaker, time, text) and sends
 * nothing until the user approves. Mirrors the privacy contract: the user sees precisely what leaves
 * the device.
 */
function ExcerptReviewPanel({
  review,
  matchName,
  onConfirm,
  onCancel,
  disabled,
}: {
  review: PendingExcerptReview;
  matchName?: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="max-w-md rounded-2xl border border-accent/40 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent shrink-0" />
        <p className="text-xs font-semibold text-text">
          Share these {review.excerpts.length} message
          {review.excerpts.length === 1 ? '' : 's'}
          {matchName ? ` with ${matchName}'s chat` : ''} with Mr.OneHook?
        </p>
      </div>
      <p className="text-[11px] text-text-muted leading-relaxed">
        Only the excerpts below are sent, just for this answer. They&rsquo;re never stored or logged.
      </p>
      <ul className="space-y-2 max-h-56 overflow-y-auto">
        {review.excerpts.map((excerpt, i) => (
          <li
            key={`${excerpt.sentAt}-${i}`}
            className="rounded-xl bg-surface border border-border/60 p-3 text-xs"
          >
            <div className="flex items-center justify-between mb-1 text-[9px] uppercase tracking-widest opacity-50">
              <span>{excerpt.speaker === 'self' ? 'You' : matchName || 'Match'}</span>
              <span>{new Date(excerpt.sentAt).toLocaleString()}</span>
            </div>
            <p className="text-text leading-relaxed break-words">{excerpt.text}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          {...trackProps(UiElement.CHAT_MR_ONEHOOK_CONTEXT_SHARE, { action: 'dismiss' })}
          className="flex-1 py-2 border border-border text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text disabled:opacity-40 cursor-pointer"
        >
          Don&rsquo;t share
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          {...trackProps(UiElement.CHAT_MR_ONEHOOK_CONTEXT_SHARE)}
          className="flex-1 py-2 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          Share &amp; continue
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state (matches exist path never triggers this; shown when a match id is
// selected but cannot be resolved).
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  onNavigateToDiscovery,
  onOpenPicker,
  onAddByUsername,
}: {
  onNavigateToDiscovery?: () => void;
  onOpenPicker: () => void;
  onAddByUsername: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 md:p-12 text-center bg-bg text-text">
      <div className="max-w-md w-full bg-surface-card border border-border p-8 md:p-12 space-y-6 shadow-sm rounded-2xl">
        <h3 className="text-xl font-bold text-text">Pick a conversation</h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          Open the picker to chat with a connection or with Mr.OneHook, or add someone you know by
          their username{onNavigateToDiscovery ? ', or explore Discovery for new connections' : ''}.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onOpenPicker}
            {...trackProps(UiElement.CHAT_CONVERSATION_SWITCHER_OPEN)}
            className="w-full py-3 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            Open conversations
          </button>
          <button
            onClick={onAddByUsername}
            {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN)}
            className="w-full py-3 border border-border text-text text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Add by username
          </button>
          {onNavigateToDiscovery && (
            <button
              onClick={onNavigateToDiscovery}
              {...trackProps(UiElement.NAV_TAB_SELECT, { value: 'DISCOVER' })}
              className="w-full py-3 border border-border text-text text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Go to Discovery
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Header button for the hook requests sheet, with a count of received requests. */
function RequestsButton({
  count,
  unlocked,
  onOpen,
  tooltip,
}: {
  count: number;
  unlocked: number;
  onOpen: () => void;
  tooltip: 'center' | 'right';
}) {
  const label =
    count === 0
      ? 'Hook requests'
      : `Hook requests, ${count} received${unlocked < count ? ` (${count - unlocked} locked)` : ''}`;
  return (
    <div className="relative group/requests flex items-center">
      <button
        type="button"
        onClick={onOpen}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
        title="Requests"
        aria-label={label}
        aria-haspopup="dialog"
        {...trackProps(UiElement.CHAT_REQUESTS_OPEN)}
      >
        <Inbox className={ICON_SECTION.header.icon} />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <div
        className={`pointer-events-none absolute ${
          tooltip === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0'
        } top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/requests:opacity-100 transition-all duration-150 shadow-md z-50`}
      >
        Requests
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation picker (LIST, not grid). Mr.OneHook pinned first; sort control
// left of the ✕; active row gets an accent checkmark.
// ─────────────────────────────────────────────────────────────────────────────

function ConversationPickerModal({
  open,
  onClose,
  rows,
  selection,
  onSelect,
  archiveCount,
  onOpenArchived,
  onOpenContactInfo,
  onLetGo,
}: {
  open: boolean;
  onClose: () => void;
  rows: (SortableConversation & {
    photo?: string;
    transform?: string;
    subtitle: string;
    isMrOneHook?: boolean;
    unread?: boolean;
  })[];
  selection: Selection;
  onSelect: (next: Selection) => void;
  archiveCount: number;
  onOpenArchived: () => void;
  onOpenContactInfo: (matchId: string) => void;
  onLetGo: (matchId: string, peerName: string) => void;
}) {
  const [sort, setSort] = useConversationSort();
  const [sortOpen, setSortOpen] = useState(false);
  const sorted = useMemo(() => {
    const all = sortConversations(rows, sort);
    // iOS feat/ui-round4 parity: active hook conversations appear first, with Mr.OneHook below them.
    const hooksOnly = all.filter((r) => !r.isMrOneHook);
    const mrOnly = all.filter((r) => r.isMrOneHook);
    return [...hooksOnly, ...mrOnly];
  }, [rows, sort]);
  const activeSort = getSortOption(sort);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 md:p-6 md:pt-16"
          onClick={onClose}
          data-track-exempt="backdrop: click-away that closes the conversation switcher; the explicit close control (chat.conversation_switcher_open dismiss) is tracked."
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="dialog"
            aria-label="Conversations"
            className="w-full max-w-md bg-surface-card text-text border border-border shadow-2xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            {/* Header: title, sort control immediately LEFT of the ✕ */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-text">Conversations</h2>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    {...trackProps(UiElement.CHAT_CONVERSATION_SORT_OPEN)}
                    className={ICON_SECTION.modalHeader.button}
                    title="Sort conversations"
                    aria-haspopup="menu"
                    aria-expanded={sortOpen}
                  >
                    <ArrowLeftRight className={ICON_SECTION.modalHeader.icon} />
                  </button>
                  <AnimatePresence>
                    {sortOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} data-track-exempt="backdrop: click-away that closes the sort menu." />
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          role="menu"
                          className="absolute right-0 mt-2 w-56 bg-surface-card border border-border rounded-xl shadow-xl z-20 py-2 text-text overflow-hidden"
                        >
                          {CONVERSATION_SORTS.map((opt) => (
                            <button
                              key={opt.id}
                              role="menuitemradio"
                              aria-checked={sort === opt.id}
                              onClick={() => {
                                setSort(opt.id);
                                setSortOpen(false);
                              }}
                              {...trackProps(UiElement.CHAT_CONVERSATION_SORT, { targetId: opt.id })}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-surface-hover transition-colors flex items-center justify-between text-text cursor-pointer"
                            >
                              <span>{opt.label}</span>
                              {sort === opt.id && <Check className="w-3.5 h-3.5 text-ig-blue" />}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={onClose}
                  {...trackProps(UiElement.CHAT_CONVERSATION_SWITCHER_OPEN, { action: 'dismiss' })}
                  className={ICON_SECTION.modalHeader.button}
                  title="Close"
                  aria-label="Close conversations"
                >
                  <X className={ICON_SECTION.modalHeader.icon} />
                </button>
              </div>
            </div>

            {/* Active order eyebrow */}
            <div className="px-5 pt-3 pb-1 shrink-0">
              <span className="text-[9px] uppercase tracking-[0.25em] opacity-40 font-bold">
                {activeSort.eyebrow}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0 space-y-1">
              {sorted.map((row, rowIndex) => {
                const isActive =
                  row.id === selection || (row.isMrOneHook && selection === MR_ONEHOOK);
                return (
                  <div
                    key={row.id}
                    className={`flex items-center gap-1 rounded-xl transition-colors ${
                      isActive ? 'bg-surface' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <button
                      onClick={() => onSelect(row.isMrOneHook ? MR_ONEHOOK : row.id)}
                      {...(row.isMrOneHook
                        ? trackProps(UiElement.CHAT_MR_ONEHOOK_OPEN)
                        : trackProps(UiElement.CHAT_CONVERSATION_SWITCH, { index: rowIndex, targetId: row.id }))}
                      className={`flex-1 min-w-0 flex items-center gap-3 p-3 text-left relative cursor-pointer ${
                        isActive ? 'font-semibold text-text' : 'text-text'
                      }`}
                    >
                      {/* Avatar */}
                      {row.isMrOneHook ? (
                        <span className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-rose-100 to-white ring-2 ring-accent/40 flex items-center justify-center">
                          <Mascot mood="Happy" className="w-10 h-10" />
                        </span>
                      ) : (
                        <span className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-border bg-border relative">
                          <MediaImage
                            src={row.photo}
                            style={pictureTransformStyle(row.transform)}
                            alt=""
                            aria-hidden="true"
                            className="w-full h-full object-cover"
                          />
                          {row.unread && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-surface-card absolute top-0.5 right-0.5"
                              aria-label="New activity"
                            />
                          )}
                        </span>
                      )}

                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm font-bold truncate">
                            {row.name}
                            {row.age != null && (
                              <span className="font-normal opacity-70">, {row.age}</span>
                            )}
                          </span>
                          {row.isMrOneHook && (
                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-accent text-white rounded-full inline-flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> AI
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] opacity-50 truncate mt-0.5">
                          {row.subtitle || (row.isMrOneHook ? '' : 'Connected')}
                        </span>
                      </span>

                      {isActive && <Check className={`${ICON_SECTION.section.rowIcon} text-accent`} />}
                    </button>

                    {!row.isMrOneHook && (
                      <div className="flex items-center gap-0.5 pr-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenContactInfo(row.id)}
                          aria-label={`Contact info for ${row.name}`}
                          // TODO(telemetry-parity): switch to UiElement.CHAT_CONTACT_INFO_OPEN once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.contact_info_open"
                          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-bg/60 cursor-pointer"
                        >
                          <Info className={ICON_SECTION.section.rowIcon} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onLetGo(row.id, row.name)}
                          aria-label={`Archive or unhook ${row.name}`}
                          // TODO(telemetry-parity): switch to UiElement.CHAT_UNMATCH once enabled on web.
                          data-track-exempt="disabled: pending telemetry web parity enablement for chat.unmatch"
                          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-bg/60 cursor-pointer"
                        >
                          <UserMinus className={ICON_SECTION.section.rowIcon} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Archived chats row */}
              <div className="pt-2 mt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onOpenArchived}
                  // TODO(telemetry-parity): switch to UiElement.CHAT_ARCHIVED_OPEN once enabled on web.
                  data-track-exempt="disabled: pending telemetry web parity enablement for chat.archived_open"
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-surface-hover text-left text-text transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-accent">
                      <Archive className={ICON_SECTION.section.rowIcon} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Archived chats</span>
                      <span className="block text-[11px] text-text-muted">Read-only history &amp; continue requests</span>
                    </span>
                  </span>
                  {archiveCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-xs font-semibold">
                      {archiveCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add by username
// ─────────────────────────────────────────────────────────────────────────────

function AddByUsernameModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const handle = username.trim().replace(/^@/, '');
    if (!handle || submitting) return;
    setSubmitting(true);
    try {
      await StateApi.sendHookRequest(handle);
      // CRITICAL: identical confirmation for every outcome — never reveal whether the handle
      // exists, is full, has blocked you, or declines (R4, E10).
      showToast(HOOK_REQUEST_SENT_CONFIRMATION, 'success');
      setUsername('');
      onSent();
      onClose();
    } catch (err) {
      // Only the caller's own state produces an error (no free slot, choosing hooks, not set up).
      showToast(sendRequestErrorCopy(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={onClose}
          data-track-exempt="backdrop: click-away that closes the add-by-username dialog; the explicit close control (chat.add_hook_open dismiss) is tracked."
        >
          <div
            className="max-w-md w-full bg-surface-card text-text border border-border p-8 space-y-6 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-text">Add by username</h3>
              <button onClick={onClose} {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN, { action: 'dismiss' })} className={ICON_SECTION.modalHeader.button} aria-label="Close">
                <X className={ICON_SECTION.modalHeader.icon} />
              </button>
            </div>
            <p id="add-by-username-help" className="text-xs text-text-secondary leading-relaxed">
              Enter the username of someone you know. If they accept your request, you&rsquo;re
              hooked and can chat. It counts toward your plan&rsquo;s hooks, like a match does.
            </p>
            <input
              type="text"
              autoFocus
              aria-label="Username"
              aria-describedby="add-by-username-help"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="@username"
              className="w-full p-3 border border-border text-sm bg-surface text-text rounded-xl outline-none focus:border-accent"
            />
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                disabled={submitting}
                {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN, { action: 'dismiss' })}
                className="flex-1 py-3 border border-border text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !username.trim()}
                {...trackProps(UiElement.DISCOVER_ADD_HOOK_SUBMIT)}
                className="flex-1 py-3 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? <LoadingSpinner size="sm" /> : 'Send request'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallpaper picker (shield-menu entry). The settings sheet renders the SAME
// options against the SAME store (see chat-appearance.ts) so they can't disagree.
// ─────────────────────────────────────────────────────────────────────────────

function WallpaperPickerModal({
  open,
  onClose,
  current,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  current: ChatWallpaper;
  onChoose: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={onClose}
          data-track-exempt="backdrop: click-away that closes the wallpaper picker; the explicit close control (chat.wallpaper_open dismiss) is tracked."
        >
          <div
            className="max-w-md w-full bg-surface-card text-text border border-border p-8 space-y-6 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-text">Choose wallpaper</h3>
              <button onClick={onClose} {...trackProps(UiElement.CHAT_WALLPAPER_OPEN, { action: 'dismiss' })} className={ICON_SECTION.modalHeader.button} aria-label="Close">
                <X className={ICON_SECTION.modalHeader.icon} />
              </button>
            </div>
            <WallpaperGrid current={current} onChoose={onChoose} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile inspector / About Mr.OneHook
// ─────────────────────────────────────────────────────────────────────────────

function ProfileInspectorModal({
  open,
  onClose,
  isMrOneHook,
  peerProfile,
  peerName,
  peerPhoto,
  distanceKm,
  originText,
  suspended,
  onReport,
}: {
  open: boolean;
  onClose: () => void;
  isMrOneHook: boolean;
  /** The partner's CHAT profile: all a hook partner ever sees here (E51, E66). */
  peerProfile: PartnerProfile | null;
  peerName: string;
  peerPhoto: string;
  distanceKm: number | null;
  /** How the hook formed. */
  originText?: string;
  suspended?: boolean;
  onReport?: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={onClose}
          data-track-exempt="backdrop: click-away that closes the peer profile sheet; the explicit close control (chat.profile_open dismiss) is tracked."
        >
          <div
            className="max-w-md w-full bg-surface-card text-text border border-border p-8 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-text">
                {isMrOneHook ? 'About Mr.OneHook' : 'Profile'}
              </h3>
              <button onClick={onClose} {...trackProps(UiElement.CHAT_PROFILE_OPEN, { action: 'dismiss' })} className={ICON_SECTION.modalHeader.button} aria-label="Close">
                <X className={ICON_SECTION.modalHeader.icon} />
              </button>
            </div>

            {isMrOneHook ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-rose-100 to-white ring-2 ring-accent/40 flex items-center justify-center">
                  <Mascot mood="Happy" className="w-20 h-20" />
                </div>
                <p className="text-sm leading-relaxed opacity-70 italic">
                  Mr.OneHook is OneHook&rsquo;s friendly AI companion. Chat about dating, get advice,
                  or ask anything about OneHook. This conversation is private to this device and never
                  leaves as a match.
                </p>
              </div>
            ) : (
              <>
                <div className="aspect-[3/4] w-full bg-border overflow-hidden grayscale grayscale-hover border border-border">
                  <MediaImage src={peerPhoto} alt={peerName} className="w-full h-full object-cover" />
                </div>
                <div className="flex items-center gap-2">
                  <h4 className="text-2xl font-serif italic">{peerName}</h4>
                  {peerProfile?.age && (
                    <span className="text-base opacity-50 font-serif">, {peerProfile.age}</span>
                  )}
                </div>
                {originText && <div className="text-xs opacity-60">{originText}</div>}
                {suspended && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <PauseCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{HOOK_COPY.suspendedTitle}</span>
                  </div>
                )}
                {/* Distance is coarsened server-side; only shown when available. */}
                {distanceKm != null && (
                  <div className="flex items-center gap-1.5 text-xs opacity-60">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{distanceKm} km away</span>
                  </div>
                )}
                {onReport && (
                  <button
                    type="button"
                    onClick={onReport}
                    className="w-full mt-2 py-3 border border-border text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors text-red-500 cursor-pointer"
                    data-track-exempt="duplicate: opens the member report flow from the profile; reported via the report_flow signal (report.open)."
                  >
                    Report
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report & block (reason picker)
// ─────────────────────────────────────────────────────────────────────────────

function ReportBlockModal({
  open,
  reason,
  onReason,
  submitting,
  peerName,
  fromRequest,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  reason: BlockReason;
  onReason: (r: BlockReason) => void;
  submitting: boolean;
  peerName: string;
  /** Blocking the sender of a hook request rather than a hook partner. */
  fromRequest?: boolean;
  onCancel: () => void;
  onConfirm: (reason: BlockReason) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="block-dialog-title"
            className="max-w-md w-full bg-surface-card text-text border border-border p-8 space-y-6 shadow-2xl rounded-2xl"
          >
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
              <h3 id="block-dialog-title" className="text-xl font-bold text-text">Block {peerName}?</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {fromRequest
                ? `Their request is removed and they can't send you another. They are not told.`
                : `This ends your hook and erases your chat with ${peerName}. They can't send you a request again. They are not told.`}
            </p>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary block">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => {
                  trackUi(UiElement.CHAT_REPORT_REASON_SELECT);
                  onReason(e.target.value as BlockReason);
                }}
                className="w-full p-3 border border-border text-xs bg-surface text-text rounded-xl outline-none focus:border-accent"
              >
                {BLOCK_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-border">
              <button
                onClick={onCancel}
                disabled={submitting}
                {...trackProps(UiElement.CHAT_BLOCK_CONFIRM, { action: 'dismiss' })}
                className="flex-1 py-3 border border-border text-xs font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(reason)}
                disabled={submitting}
                {...trackProps(UiElement.CHAT_BLOCK_CONFIRM)}
                className="flex-1 py-3 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? <LoadingSpinner size="sm" /> : 'Block'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
