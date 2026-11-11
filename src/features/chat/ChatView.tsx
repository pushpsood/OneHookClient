import { trackConversationOpened, trackProfileRevisit, trackSafetyUiOpen, Screen, UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MessageStatus } from 'onehook-api-client/graphql';
import {
  Shield,
  Settings,
  Plus,
  ChevronDown,
  X,
  Check,
  ArrowLeftRight,
  MapPin,
  Sparkles,
  AlertTriangle,
  Inbox,
  PauseCircle,
} from 'lucide-react';
import type { BlockReason } from 'onehook-api-client';
import type { ChatMessageDTO, Hook, UserProfile, UserStateSnapshot } from '../../types';
import { HOOK_REQUEST_SENT_CONFIRMATION, StateApi } from '../../api/state';
import { DistanceApi } from '../../api/rest';
import { useChatMessages, useHookRequests, usePartnerProfiles } from '../../hooks/use-api';
import { useAppStore } from '../../store/app-store';
import { isMatchingOn } from '../../lib/app-mode';
import { SUSPENDED_CALL_COPY, isConversationSuspended } from '../../lib/call-errors';
import type { PartnerProfile } from '../../lib/profile-model';
import { HookRequestsSheet } from './HookRequestsSheet';
import { HOOK_COPY, originLabel, sendRequestErrorCopy } from './hook-copy';
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
  useChatWallpaper,
  WALLPAPER_SCRIM_CLASS,
  type ChatWallpaper,
} from '../../lib/chat-appearance';
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
  useMrOneHookChat,
  type MrOneHookMessage,
  type MrOneHookScope,
  type PendingExcerptReview,
} from '../../lib/mr-onehook';
import {
  selectEphemeralExcerpts,
  toSelectableMessages,
  type ExcerptSelectionRequest,
} from '../../lib/mr-onehook-excerpts';
import { DEFAULT_SUBSCRIPTION_TIER, isPaidSubscriptionTier } from 'onehook-api-client/membership';
import type { SubscriptionTier } from '../../types';
import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { AttachmentBubble } from '../../components/chat/AttachmentBubble';
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
}) {
  const { showToast } = useToast();
  const [wallpaper, setWallpaper] = useChatWallpaper();
  const bumpRequests = useAppStore((s) => s.bumpRequests);
  const matchingOn = isMatchingOn(userState);

  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [selection, setSelection] = useState<Selection>(activeMatchId || MR_ONEHOOK);

  // Overlay state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportReason, setReportReason] = useState<BlockReason | null>(null);
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

  // A write was refused because the conversation is suspended (the state we hold is stale).
  const handleSuspended = useCallback(() => {
    showToast(HOOK_COPY.suspendedTitle + '. ' + HOOK_COPY.suspendedBody, 'info');
    void onRefetchState?.();
  }, [showToast, onRefetchState]);

  // Rows for the conversation picker: Mr.OneHook pinned first, then matches.
  const pickerRows: (SortableConversation & {
    photo?: string;
    transform?: string;
    subtitle: string;
    isMrOneHook?: boolean;
  })[] = useMemo(() => {
    const mr = {
      id: MR_ONEHOOK,
      isMrOneHook: true as const,
      name: 'Mr.OneHook',
      subtitle: 'OneHook AI · always here',
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
      };
    });
    return [mr, ...rows];
  }, [matches, distances]);

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
                  <ChevronDown className="w-3.5 h-3.5 stroke-[2] text-text/70 shrink-0" />
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
                  <Shield className="w-5 h-5 stroke-[1.75]" />
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
                  <Settings className="w-5 h-5 stroke-[1.75]" />
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
                  <Plus className="w-5 h-5 stroke-[1.75]" />
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
                  <ChevronDown className="w-3.5 h-3.5 stroke-[2] text-text/70 shrink-0" />
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
                <Shield className="w-5 h-5 stroke-[1.75]" />
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
                <Settings className="w-5 h-5 stroke-[1.75]" />
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
                <Plus className="w-5 h-5 stroke-[1.75]" />
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
          tier={userState?.subscriptionTier ?? DEFAULT_SUBSCRIPTION_TIER}
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
          currentUserId={currentUser.id}
          wallpaper={wallpaper}
          suspended={activeMatch.suspended}
          onSuspended={handleSuspended}
          onReportPeer={openBlockForActive}
          reportOpen={chatReportOpen}
          onCloseReport={() => setChatReportOpen(false)}
          onRequestUnmatch={() => void runUnmatch()}
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
}) {
  return (
    <div className="p-4 md:p-6 border-t border-border bg-surface-card shrink-0">
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
          className="w-full py-3 pr-20 pl-0 border-b border-border focus:border-accent transition-all outline-none text-sm bg-transparent placeholder:text-text-muted text-text disabled:cursor-not-allowed"
        />
        <button
          onClick={onSend}
          disabled={disabled || Boolean(readOnlyReason) || !value.trim()}
          {...trackProps(UiElement.CHAT_SEND_BUTTON)}
          className="absolute right-0 bottom-3 text-xs font-semibold text-ig-blue hover:opacity-80 transition-opacity disabled:opacity-30 flex items-center gap-1 cursor-pointer"
        >
          Send
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
}) {
  const decoded = useMemo(() => {
    try {
      const result = decodeMessagePlaintext(message.ciphertext);
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

function MatchConversation({
  matchId,
  peerId,
  peerName,
  currentUserId,
  wallpaper,
  suspended,
  onSuspended,
  onReportPeer,
  reportOpen,
  onCloseReport,
  onRequestUnmatch,
}: {
  key?: string;
  matchId: string;
  peerId?: string;
  peerName: string;
  currentUserId: string;
  wallpaper: ChatWallpaper;
  /** Read-only: a member of this hook must choose which hooks to keep (R24, E23). */
  suspended?: boolean;
  /** A write was refused with CONVERSATION_SUSPENDED (the state we hold was stale). */
  onSuspended?: () => void;
  onReportPeer?: () => void;
  reportOpen?: boolean;
  onCloseReport?: () => void;
  onRequestUnmatch?: () => void;
}) {
  const {
    messages,
    loading,
    error,
    sendMessage,
    sendAttachment,
    retryAttachment,
    attachmentTransfers,
    attachmentCache,
    markAsDelivered,
    markAsRead,
    refetch,
    loadEvidenceWindow,
    hasUndecryptable,
    historyHorizon,
  } = useChatMessages(matchId, peerId);
  const [input, setInput] = useState('');

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
            text = decoded.type === 'attachment' ? null : decoded.text;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
      | { kind: 'message'; ts: number; message: (typeof messages)[number] }
      | { kind: 'call'; ts: number; call: Call }
    > = [];
    for (const m of messages) items.push({ kind: 'message', ts: m.timestamp, message: m });
    for (const c of callHistory) items.push({ kind: 'call', ts: c.createdAt, call: c });
    return items.sort((a, b) => a.ts - b.ts);
  }, [messages, callHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleSend = async () => {
    if (!input.trim() || suspended) return;
    try {
      await sendMessage(input);
      setInput('');
      // The local user just sent — re-check whether that satisfied the "both messaged" gate.
      eligibility.recheck();
    } catch (err) {
      if (isConversationSuspended(err)) onSuspended?.();
      else if (err instanceof Error && err.message) showToast(err.message, 'error');
    }
  };

  const dispatchAttachment = useCallback(
    async (attachment: OutgoingAttachment) => {
      try {
        await sendAttachment(attachment);
      } catch (err) {
        if (isConversationSuspended(err)) onSuspended?.();
        else showToast(err instanceof Error ? err.message : 'That attachment could not be sent.', 'error');
      }
    },
    [sendAttachment, showToast, onSuspended]
  );

  const handlePickFile = useCallback(
    async (file: File, kind: AttachmentKind) => {
      const attachment = await buildOutgoingAttachment(file, kind);
      void dispatchAttachment(attachment);
    },
    [dispatchAttachment]
  );

  const handleVoiceNote = useCallback(
    (blob: Blob, mime: string, durationMs: number, waveform: number[]) => {
      const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      void dispatchAttachment({
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

  return (
    <>
      {suspended && (
        <div
          role="status"
          className="shrink-0 px-4 py-2.5 flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        >
          <PauseCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-relaxed">
            <span className="font-semibold">{HOOK_COPY.suspendedTitle}.</span> {HOOK_COPY.suspendedBody}
          </p>
        </div>
      )}
      <div className="shrink-0 h-10 px-4 flex items-center justify-end border-b border-border/60 bg-surface-card/60">
        {peerId && (
          <CallButtons
            peerName={peerName}
            disabled={call.active}
            // A suspended hook refuses call signalling (CONVERSATION_SUSPENDED): explain instead of ringing.
            locked={Boolean(suspended) || eligibility.locked}
            lockMessage={suspended ? SUSPENDED_CALL_COPY : eligibility.lockMessage}
            onAudio={() =>
              peerId && void call.startCall({ matchId, peerId, peerName, media: 'AUDIO' })
            }
            onVideo={() =>
              peerId && void call.startCall({ matchId, peerId, peerName, media: 'VIDEO' })
            }
          />
        )}
      </div>
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
        <div className="relative h-full p-6 md:p-8 space-y-6 overflow-y-auto min-h-0">
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
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-50">
              <p className="text-xs italic font-serif">
                No messages yet. Say hello to {peerName} whenever you&rsquo;re ready.
              </p>
            </div>
          ) : (
            timeline.map((item) =>
              item.kind === 'call' ? (
                <CallHistoryItem
                  key={`call-${item.call.callId}`}
                  call={item.call}
                  currentUserId={currentUserId}
                />
              ) : (
                ((m) => (
                  <div key={m.messageId} className={`max-w-md ${m.senderId === 'me' ? 'ml-auto' : ''}`}>
                    <div
                      className={`text-[9px] uppercase tracking-widest opacity-40 mb-1 flex items-center gap-2 ${
                        m.senderId === 'me' ? 'justify-end' : ''
                      }`}
                    >
                      <span>{m.senderId === 'me' ? 'You' : peerName}</span>
                      {statusIcon(m)}
                    </div>
                    <div
                      className={`p-4 md:p-5 rounded-2xl text-sm leading-relaxed ${
                        m.senderId === 'me'
                          ? 'bg-ig-blue text-white shadow-sm rounded-br-sm'
                          : 'bg-surface text-text border border-border/60 rounded-bl-sm'
                      }`}
                    >
                      {/*
                        MUST branch on `undecryptable`: an unreadable message carries an EMPTY body, so
                        rendering `ciphertext` unconditionally produced a silent blank bubble. Attachment
                        decoding, text, and both retry paths are handled inside MatchMessageBody.
                      */}
                      <MatchMessageBody
                        message={m}
                        mine={m.senderId === 'me'}
                        cache={attachmentCache}
                        matchId={matchId}
                        transfer={attachmentTransfers[m.messageId]}
                        onRetryAttachment={() => void retryAttachment(m.messageId)}
                        onRestore={() => setRecoveryOpen(true)}
                        onReportPeerMedia={onReportPeer}
                        onRetryText={(text) => void sendMessage(text)}
                      />
                    </div>
                  </div>
                ))(item.message)
              )
            )
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={handleSend}
        readOnlyReason={suspended ? HOOK_COPY.suspendedComposer : undefined}
        leading={
          <AttachmentComposer
            disabled={loading || Boolean(suspended)}
            onPickFile={(file, kind) => void handlePickFile(file, kind)}
            onVoiceNote={handleVoiceNote}
          />
        }
      />

      {/*
        Recovery runs against the ACCOUNT, not this conversation: importing the history key unlocks
        every match at once, so a successful transfer refetches this thread and any other open one
        re-decrypts on its next read.
      */}
      <HistoryRecoveryModal
        userId={currentUserId}
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        onRecovered={() => void refetch()}
      />

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

function MrOneHookConversation({
  currentUser,
  wallpaper,
  matches,
  tier,
}: {
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
  matches: HydratedMatch[];
  tier: SubscriptionTier;
}) {
  // Scope the conversation to product-only (default) or a single match the user picks here.
  const [scope, setScope] = useState<MrOneHookScope>({ type: 'product' });
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

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
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="max-w-[160px] truncate">
                {scope.type === 'product' ? 'OneHook (product only)' : activeMatchName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
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
        </div>
      </div>

      {scope.type === 'match' && activeMatch ? (
        <MrOneHookMatchScope
          key={activeMatch.matchId}
          currentUser={currentUser}
          wallpaper={wallpaper}
          match={activeMatch}
          matchName={activeMatchName}
          tier={tier}
          onOpenScope={setScope}
        />
      ) : (
        <MrOneHookProductScope currentUser={currentUser} wallpaper={wallpaper} tier={tier} onOpenScope={setScope} />
      )}
    </>
  );
}

/** Product-only Mr.OneHook: no match, no excerpts — the always-available baseline. */
function MrOneHookProductScope({
  currentUser,
  wallpaper,
  tier,
  onOpenScope,
}: {
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
  tier: SubscriptionTier;
  onOpenScope: (scope: MrOneHookScope) => void;
}) {
  const chat = useMrOneHookChat({
    userId: currentUser.id,
    scope: { type: 'product' },
    tier,
    onOpenScope,
  });
  return <MrOneHookChatBody chat={chat} wallpaper={wallpaper} tier={tier} scopeType="product" />;
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
  tier,
  onOpenScope,
}: {
  key?: string;
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
  match: HydratedMatch;
  matchName: string;
  tier: SubscriptionTier;
  onOpenScope: (scope: MrOneHookScope) => void;
}) {
  const { messages } = useChatMessages(match.matchId, match.peerId || undefined);

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
    tier,
    resolveLocalExcerpts,
    onOpenScope,
  });

  return (
    <MrOneHookChatBody chat={chat} wallpaper={wallpaper} matchName={matchName} tier={tier} scopeType="connection" />
  );
}

/**
 * Shared presentational body for both scopes: transcript, typing indicator, the inline excerpt
 * review panel (shown only when the model asked for more context AND the device found some), and the
 * composer. The review panel is the explicit consent gate — nothing is shared until the user approves.
 */
function MrOneHookChatBody({
  chat,
  wallpaper,
  matchName,
  tier,
  scopeType,
}: {
  chat: ReturnType<typeof useMrOneHookChat>;
  wallpaper: ChatWallpaper;
  matchName?: string;
  tier: SubscriptionTier;
  scopeType: 'product' | 'connection';
}) {
  const canSaveChats = isPaidSubscriptionTier(tier);
  const [confirm, setConfirm] = useState<null | { kind: 'replace'; oldest: string; title: string } | { kind: 'delete'; id: string; title: string }>(null);
  const [leavingId, setLeavingId] = useState<string | undefined>(undefined);
  const tabs = mrOneHookTabs(chat.sessions, chat.currentSessionId, canSaveChats, chat.replacing);
  const MAX_CHATS = 3;
  const addChat = () => {
    if (chat.loading) return;
    const oldest = leastRecentSession(chat.sessions);
    if (chat.sessions.length >= MAX_CHATS && chat.currentSessionId && !chat.replacing && oldest) {
      const title = tabs.find((t) => t.sessionId === oldest.sessionId)?.title ?? 'your least recent chat';
      setConfirm({ kind: 'replace', oldest: oldest.sessionId, title });
      return;
    }
    chat.clear();
  };
  const { messages, loading, mood, pendingReview, availability, send, confirmReview, cancelReview } = chat;
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  // Terminal availability (not entitled / signed out / not configured): block input entirely. The
  // reason is already surfaced as an assistant bubble by the hook, so the composer just locks.
  const unavailable = availability !== 'AVAILABLE';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pendingReview]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    await send(text);
  };

  return (
    <>
      <div className="flex-1 relative min-h-0">
        <ChatBackdrop wallpaper={wallpaper} />
        {/* The chat tabs float at the top of the conversation, on the wallpaper (not part of the header). */}
        <div className="absolute top-0 inset-x-0 z-10 px-4 md:px-6 pt-3 pointer-events-none">
          <div className="pointer-events-auto max-w-3xl mx-auto">
            <MrOneHookTabs
              tabs={tabs}
              activeId={chat.currentSessionId}
              locked={!canSaveChats}
              leavingId={leavingId}
              onSelect={(id) => void chat.resumeSession(id)}
              onDelete={(id) =>
                setConfirm({ kind: 'delete', id, title: tabs.find((t) => t.sessionId === id)?.title ?? 'this chat' })
              }
              onAdd={addChat}
            />
          </div>
        </div>
        {confirm?.kind === 'replace' && (
          <MrOneHookConfirm
            title={`Replace ${confirm.title}?`}
            body={`You can keep ${MAX_CHATS} chats. Starting a new one removes ${confirm.title}, the one you used least recently. Its messages will be deleted.`}
            confirmLabel="Replace"
            element={UiElement.CHAT_MR_ONEHOOK_SESSION_LIMIT}
            confirmOptions={{ value: 'replace_least_recent' }}
            cancelOptions={{ value: 'cancel' }}
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
          {chat.sessionLimit && (
            <div
              className="max-w-md rounded-2xl border border-accent/40 bg-accent/5 p-4 space-y-3"
              data-testid="session-limit"
            >
              <p className="text-sm text-text">
                You have {chat.sessionLimit.maxSessions} saved chats, the most you can keep. Replace your least
                recent chat, or delete one above.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void chat.replaceLeastRecentAndSend()}
                  {...trackProps(UiElement.CHAT_MR_ONEHOOK_SESSION_LIMIT, { value: 'replace_least_recent' })}
                  className="px-3 py-1.5 rounded-lg bg-ig-blue text-white text-xs font-semibold cursor-pointer"
                >
                  Replace least recent
                </button>
                <button
                  type="button"
                  onClick={chat.dismissSessionLimit}
                  {...trackProps(UiElement.CHAT_MR_ONEHOOK_SESSION_LIMIT, { value: 'cancel' })}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-70">
              <Mascot mood="Happy" className="w-16 h-16" />
              <p className="text-xs italic font-serif max-w-xs">
                Share what&rsquo;s on your mind, ask me anything about OneHook, or just say hi.
              </p>
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
        onSend={handleSend}
        disabled={loading || pendingReview !== null || unavailable}
        placeholder={
          unavailable
            ? availability === 'LIMIT_REACHED'
              ? 'Today’s free messages are used up. Upgrade to Super or come back tomorrow.'
              : availability === 'NOT_AUTHENTICATED'
                ? 'Sign in again to chat with Mr.OneHook.'
                : 'Mr.OneHook is temporarily unavailable.'
            : pendingReview
              ? 'Review the excerpts above first…'
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
        <Inbox className="w-5 h-5 stroke-[1.75]" />
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
}: {
  open: boolean;
  onClose: () => void;
  rows: (SortableConversation & {
    photo?: string;
    transform?: string;
    subtitle: string;
    isMrOneHook?: boolean;
  })[];
  selection: Selection;
  onSelect: (next: Selection) => void;
}) {
  const [sort, setSort] = useConversationSort();
  const [sortOpen, setSortOpen] = useState(false);
  const sorted = useMemo(() => sortConversations(rows, sort), [rows, sort]);
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
              <div className="flex items-center gap-1">
                <div className="relative">
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    {...trackProps(UiElement.CHAT_CONVERSATION_SORT_OPEN)}
                    className="p-2 border border-border hover:border-accent hover:bg-surface-hover transition-colors flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold rounded-lg cursor-pointer text-text"
                    title="Sort conversations"
                    aria-haspopup="menu"
                    aria-expanded={sortOpen}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
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
                  className="p-2 border border-border hover:border-accent hover:bg-bg transition-colors"
                  title="Close"
                  aria-label="Close conversations"
                >
                  <X className="w-4 h-4" />
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
            <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
              {sorted.map((row, rowIndex) => {
                const isActive =
                  row.id === selection || (row.isMrOneHook && selection === MR_ONEHOOK);
                return (
                  <button
                    key={row.id}
                    onClick={() => onSelect(row.isMrOneHook ? MR_ONEHOOK : row.id)}
                    {...(row.isMrOneHook
                      ? trackProps(UiElement.CHAT_MR_ONEHOOK_OPEN)
                      : trackProps(UiElement.CHAT_CONVERSATION_SWITCH, { index: rowIndex, targetId: row.id }))}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors relative cursor-pointer ${
                      isActive ? 'bg-surface font-semibold text-text' : 'hover:bg-surface-hover text-text'
                    }`}
                  >
                    {/* Avatar */}
                    {row.isMrOneHook ? (
                      <span className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-rose-100 to-white ring-2 ring-accent/40 flex items-center justify-center">
                        <Mascot mood="Happy" className="w-10 h-10" />
                      </span>
                    ) : (
                      <span className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-border bg-border">
                        <MediaImage
                          src={row.photo}
                          style={pictureTransformStyle(row.transform)}
                          alt=""
                          aria-hidden="true"
                          className="w-full h-full object-cover"
                        />
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

                    {isActive && <Check className="w-4 h-4 text-accent shrink-0" />}
                  </button>
                );
              })}
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
              <button onClick={onClose} {...trackProps(UiElement.CHAT_ADD_HOOK_OPEN, { action: 'dismiss' })} className="p-1 text-text-secondary hover:text-text cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
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
              <button onClick={onClose} {...trackProps(UiElement.CHAT_WALLPAPER_OPEN, { action: 'dismiss' })} className="p-1 text-text-secondary hover:text-text cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
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
              <button onClick={onClose} {...trackProps(UiElement.CHAT_PROFILE_OPEN, { action: 'dismiss' })} className="p-1 text-text-secondary hover:text-text cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
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
