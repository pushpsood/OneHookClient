import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
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
  Briefcase,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import type { ChatMessageDTO, UserProfile, UserStateSnapshot } from '../../types';
import { StateApi } from '../../api/state';
import { ProfileApi } from '../../api/profile';
import {
  DistanceApi,
  BlocksApi,
  ConnectApi,
  ADD_BY_USERNAME_CONFIRMATION,
  type BlockReason,
} from '../../api/rest';
import { useChatMessages } from '../../hooks/use-api';
import { ApiError } from '../../lib/api-client';
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
  humanizeEnum,
  CONVERSATION_SORTS,
  getSortOption,
  type SortableConversation,
} from '../../lib/chat-sort';
import { useMrOneHookChat, type MrOneHookMessage } from '../../lib/mr-onehook';
import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { AttachmentBubble } from '../../components/chat/AttachmentBubble';
import { AttachmentComposer } from '../../components/chat/AttachmentComposer';
import {
  decodeMessagePlaintext,
  AttachmentDecodeError,
  type AttachmentKind,
} from '../../lib/chat-attachments';
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

interface HydratedMatch {
  matchId: string;
  createdAt: number;
  peerId: string;
  peerProfile?: UserProfile | null;
}

export function ChatView({
  currentUser,
  userState,
  activeMatchId,
  onSelectMatch,
  onRefetchState,
  onNavigateToDiscovery,
}: {
  key?: string;
  currentUser: UserProfile;
  userState: UserStateSnapshot | null;
  activeMatchId?: string | null;
  onSelectMatch?: (matchId: string | null) => void;
  onRefetchState?: () => Promise<void>;
  onNavigateToDiscovery?: () => void;
}) {
  const { showToast } = useToast();
  const [wallpaper, setWallpaper] = useChatWallpaper();

  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [selection, setSelection] = useState<Selection>(activeMatchId || MR_ONEHOOK);

  // Overlay state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportReason, setReportReason] = useState<BlockReason | null>(null);
  const [reporting, setReporting] = useState(false);

  const matchIds = useMemo(() => userState?.matchIds || [], [userState?.matchIds]);

  const loadMatches = useCallback(async () => {
    if (!matchIds.length) {
      setMatches([]);
      setLoadingMatches(false);
      return;
    }
    setLoadingMatches(true);
    try {
      const records = await Promise.all(
        matchIds.map(async (id) => {
          try {
            const record = await StateApi.getMatch(id);
            const peerId = record.userA === currentUser.id ? record.userB : record.userA;
            return {
              matchId: id,
              createdAt: record.createdAt || Date.now(),
              peerId: peerId || '',
            } as HydratedMatch;
          } catch {
            return { matchId: id, createdAt: Date.now(), peerId: '' } as HydratedMatch;
          }
        })
      );
      setMatches(records);

      // Hydrate peer profiles + coarsened distances in the background (best-effort).
      records.forEach(async (m, index) => {
        if (!m.peerId) return;
        try {
          const profile: any = await ProfileApi.get(m.peerId);
          if (profile) {
            profile.id = profile.userId || m.peerId;
            profile.name = profile.displayName || profile.name || 'Your Match';
            profile.photos =
              profile.pictures && profile.pictures.length > 0
                ? profile.pictures
                : profile.photos || [];
          }
          setMatches((prev) =>
            prev.map((item, i) => (i === index ? { ...item, peerProfile: profile } : item))
          );
        } catch {
          /* profile hydration is best-effort */
        }
        // Distance is coarsened server-side; unavailable stays null (never invented).
        try {
          const d = await DistanceApi.get(m.peerId);
          setDistances((prev) => ({ ...prev, [m.peerId]: d.available ? d.distanceKm : null }));
        } catch {
          setDistances((prev) => ({ ...prev, [m.peerId]: null }));
        }
      });
    } finally {
      setLoadingMatches(false);
    }
  }, [matchIds, currentUser.id]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  // Keep selection valid: honor an incoming activeMatchId, else keep the current one, else fall
  // back to the first match, else Mr.OneHook (which is always available).
  useEffect(() => {
    if (activeMatchId) {
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
  const peerPhoto = peerProfile?.photos?.[0] || FALLBACK_PROFILE_IMAGE;
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
      } · Open conversation picker`;

  // ── Report & block flow ──────────────────────────────────────────────────
  // Block first; only if the block succeeds do we end the connection and move on. If the block
  // fails we surface a clear error and change NOTHING.
  const runReportAndBlock = async (reason: BlockReason) => {
    if (!activeMatch?.peerId) return;
    setReporting(true);
    try {
      await BlocksApi.create(activeMatch.peerId, reason);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'We couldn’t block this person. Please try again.';
      showToast(message, 'error');
      setReporting(false);
      return; // NO state change on block failure.
    }

    // Block succeeded — end the connection via the existing unhook call.
    try {
      await StateApi.releaseHook(activeMatch.matchId, reason);
    } catch {
      // The block already took effect; note the partial outcome but still move the user on.
      showToast('Blocked. We couldn’t fully close the connection — it will retry.', 'info');
    }

    const remaining = matches.filter((m) => m.matchId !== activeMatch.matchId);
    const next: Selection = remaining[0]?.matchId ?? MR_ONEHOOK;
    setSelection(next);
    onSelectMatch?.(next === MR_ONEHOOK ? null : next);
    setReportReason(null);
    setReporting(false);
    showToast('Blocked and reported. You’re protected.', 'success');
    if (onRefetchState) await onRefetchState();
    await loadMatches();
  };

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
      const location = p?.currentLocation || '';
      const intent = humanizeEnum(p?.relationshipType);
      const subtitle = [location, intent].filter(Boolean).join(' · ');
      const photo = p?.photos?.[0] || FALLBACK_PROFILE_IMAGE;
      return {
        id: m.matchId,
        name,
        age: p?.age ?? null,
        distanceKm: distances[m.peerId] ?? null,
        relationshipType: p?.relationshipType ?? null,
        lastActivity: m.createdAt,
        photo,
        transform: p?.pictureTransforms?.[photo],
        subtitle,
      };
    });
    return [mr, ...rows];
  }, [matches, distances]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-white"
    >
      {/* ── ONE-ROW HEADER ─────────────────────────────────────────────────
          LEFT: brand lockup. RIGHT (left→right): shield, gear, add (largest),
          then the conversation-picker avatar pinned to the extreme right. No
          name / distance text lives here — it is announced via the avatar. */}
      <header className="px-4 md:px-8 h-20 border-b border-border flex items-center justify-between bg-white shrink-0 relative z-20">
        <BrandWordmark className="text-lg md:text-xl font-bold tracking-tighter uppercase" />

        <div className="flex items-center gap-2 md:gap-3">
          {/* Shield / safety menu */}
          <div className="relative">
            <button
              onClick={() => setShieldOpen((v) => !v)}
              className="p-2 border border-border hover:border-accent hover:bg-bg transition-colors text-accent"
              title="Safety & report"
              aria-haspopup="menu"
              aria-expanded={shieldOpen}
              aria-label="Safety and report options"
            >
              <Shield className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {shieldOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShieldOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    role="menu"
                    className="absolute right-0 mt-2 w-56 bg-white border border-border shadow-xl z-40 py-2"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setShieldOpen(false);
                        setProfileOpen(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-bg transition-colors"
                    >
                      {isMrOneHook ? 'About Mr.OneHook' : 'View profile'}
                    </button>
                    {!isMrOneHook && (
                      <>
                        <button
                          role="menuitem"
                          disabled={reporting}
                          onClick={() => {
                            setShieldOpen(false);
                            void runReportAndBlock('SPAM');
                          }}
                          className="w-full text-left px-4 py-2.5 text-xs hover:bg-bg transition-colors text-red-600 disabled:opacity-40"
                        >
                          Report spam
                        </button>
                        <button
                          role="menuitem"
                          disabled={reporting}
                          onClick={() => {
                            setShieldOpen(false);
                            setReportReason('OTHER');
                          }}
                          className="w-full text-left px-4 py-2.5 text-xs hover:bg-bg transition-colors text-red-600 disabled:opacity-40"
                        >
                          Report &amp; block
                        </button>
                      </>
                    )}
                    <div className="my-1 border-t border-border" />
                    <button
                      role="menuitem"
                      onClick={() => {
                        setShieldOpen(false);
                        setWallpaperOpen(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-bg transition-colors"
                    >
                      Choose wallpaper
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Chat settings (gear) */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 border border-border hover:border-accent hover:bg-bg transition-colors text-accent"
            title="Chat settings"
            aria-label="Chat settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Add by username — visually the LARGEST of the three controls */}
          <button
            onClick={() => setAddOpen(true)}
            className="p-2.5 border border-accent bg-accent text-white hover:opacity-90 transition-opacity"
            title="Add by username"
            aria-label="Add someone by username"
          >
            <Plus className="w-6 h-6" />
          </button>

          {/* Conversation picker avatar — extreme right, with a chevron badge. */}
          <button
            onClick={() => setPickerOpen(true)}
            className="relative ml-1 md:ml-2 group"
            title={avatarLabel}
            aria-label={avatarLabel}
            aria-haspopup="dialog"
          >
            <span className="block w-11 h-11 rounded-full overflow-hidden border border-border group-hover:ring-2 group-hover:ring-accent transition-all bg-border">
              {isMrOneHook ? (
                <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-100 to-white ring-1 ring-accent/20">
                  <Mascot mood="Happy" className="w-9 h-9" />
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
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center border-2 border-white">
              <ChevronDown className="w-2.5 h-2.5" />
            </span>
          </button>
        </div>
      </header>

      {/* ── ACTIVE CONVERSATION (in-place; header + composer are constant) ── */}
      {isMrOneHook ? (
        <MrOneHookConversation currentUser={currentUser} wallpaper={wallpaper} />
      ) : loadingMatches && !activeMatch ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : activeMatch ? (
        <MatchConversation
          key={activeMatch.matchId}
          matchId={activeMatch.matchId}
          peerId={activeMatch.peerId || undefined}
          peerName={peerName}
          currentUserId={currentUser.id}
          wallpaper={wallpaper}
          onReportPeer={() => setReportReason('OTHER')}
        />
      ) : (
        <EmptyState onNavigateToDiscovery={onNavigateToDiscovery} onOpenPicker={() => setPickerOpen(true)} />
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
      <AddByUsernameModal open={addOpen} onClose={() => setAddOpen(false)} />

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
      />

      {/* ── REPORT & BLOCK (reason picker) ────────────────────────────────── */}
      <ReportBlockModal
        open={reportReason !== null}
        reason={reportReason ?? 'OTHER'}
        onReason={setReportReason}
        submitting={reporting}
        peerName={peerName}
        onCancel={() => setReportReason(null)}
        onConfirm={(reason) => void runReportAndBlock(reason)}
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  footerRight?: string;
  leading?: ReactNode;
}) {
  return (
    <div className="p-6 md:p-8 border-t border-border bg-white shrink-0">
      <div className="relative flex items-center">
        {leading}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          type="text"
          placeholder={placeholder || 'Write a message…'}
          className="w-full py-3 pr-20 pl-0 border-b border-accent focus:border-b-2 transition-all outline-none text-sm bg-transparent placeholder:opacity-30 italic font-serif"
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="absolute right-0 bottom-3 text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-50 transition-opacity disabled:opacity-20 flex items-center gap-1 text-accent"
        >
          Send
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between text-[8px] opacity-20 uppercase tracking-[0.3em] font-mono">
        <span>Connected</span>
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
            <button onClick={() => onRetryText(decoded.text)} className="underline hover:opacity-70">
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
  onReportPeer,
}: {
  key?: string;
  matchId: string;
  peerId?: string;
  peerName: string;
  currentUserId: string;
  wallpaper: ChatWallpaper;
  onReportPeer?: () => void;
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
    hasUndecryptable,
    historyHorizon,
  } = useChatMessages(matchId, peerId);
  const [input, setInput] = useState('');
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
    if (!input.trim()) return;
    try {
      await sendMessage(input);
      setInput('');
    } catch (err) {
      if (err instanceof ApiError) showToast(err.message, 'error');
    }
  };

  const dispatchAttachment = useCallback(
    async (attachment: OutgoingAttachment) => {
      try {
        await sendAttachment(attachment);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'That attachment could not be sent.', 'error');
      }
    },
    [sendAttachment, showToast]
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
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-50">
              <p className="text-xs italic font-serif">
                No messages yet. Say hello to {peerName} whenever you&rsquo;re ready.
              </p>
            </div>
          ) : (
            messages.map((m) => (
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
                  className={`p-5 text-sm leading-relaxed ${
                    m.senderId === 'me'
                      ? 'bg-accent text-white shadow-md'
                      : 'bg-[#F2F2F2] text-accent'
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
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={handleSend}
        leading={
          <AttachmentComposer
            disabled={loading}
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mr.OneHook conversation — local-only transcript, never touches E2EE APIs.
// ─────────────────────────────────────────────────────────────────────────────

function MrOneHookConversation({
  currentUser,
  wallpaper,
}: {
  currentUser: UserProfile;
  wallpaper: ChatWallpaper;
}) {
  const demographics = useMemo(
    () => ({
      gender: currentUser.gender || 'man',
      sexualPreference: (currentUser.interestedIn || []).join(', '),
    }),
    [currentUser.gender, currentUser.interestedIn]
  );
  const { messages, loading, send } = useMrOneHookChat(currentUser.id, demographics);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
        <div className="relative h-full p-6 md:p-8 space-y-6 overflow-y-auto min-h-0">
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
                  className={`p-5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent text-white shadow-md'
                      : m.isError
                        ? 'bg-orange-50 text-orange-700 border border-orange-200'
                        : 'bg-[#F2F2F2] text-accent'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="max-w-md">
              <div className="text-[9px] uppercase tracking-widest opacity-40 mb-1">Mr.OneHook</div>
              <div className="p-5 bg-[#F2F2F2] text-accent inline-flex items-center gap-1">
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
        disabled={loading}
        placeholder="Say something to Mr.OneHook…"
        footerRight="OneHook AI · Always Here"
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state (matches exist path never triggers this; shown when a match id is
// selected but cannot be resolved).
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  onNavigateToDiscovery,
  onOpenPicker,
}: {
  onNavigateToDiscovery?: () => void;
  onOpenPicker: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#F9F9F9]">
      <div className="max-w-md w-full bg-white border border-border p-12 space-y-6 shadow-sm">
        <h3 className="text-2xl font-serif italic">Pick a conversation</h3>
        <p className="text-xs opacity-60 leading-relaxed italic">
          Open the picker to chat with a connection or with Mr.OneHook, or explore Discovery for new
          connections.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onOpenPicker}
            className="w-full py-3 bg-accent text-white text-[10px] uppercase tracking-[0.25em] font-black hover:opacity-90 transition-opacity"
          >
            Open conversations
          </button>
          {onNavigateToDiscovery && (
            <button
              onClick={onNavigateToDiscovery}
              className="w-full py-3 border border-border text-accent text-[10px] uppercase tracking-[0.25em] font-black hover:bg-bg transition-colors"
            >
              Go to Discovery
            </button>
          )}
        </div>
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
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="dialog"
            aria-label="Conversations"
            className="w-full max-w-md bg-white border border-border shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: title, sort control immediately LEFT of the ✕ */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-lg font-serif italic font-bold">Conversations</h2>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    className="p-2 border border-border hover:border-accent hover:bg-bg transition-colors flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold"
                    title="Sort conversations"
                    aria-haspopup="menu"
                    aria-expanded={sortOpen}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <AnimatePresence>
                    {sortOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          role="menu"
                          className="absolute right-0 mt-2 w-56 bg-white border border-border shadow-xl z-20 py-2"
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
                              className="w-full text-left px-4 py-2 text-xs hover:bg-bg transition-colors flex items-center justify-between"
                            >
                              <span>{opt.label}</span>
                              {sort === opt.id && <Check className="w-3.5 h-3.5 text-accent" />}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={onClose}
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
              {sorted.map((row) => {
                const isActive =
                  row.id === selection || (row.isMrOneHook && selection === MR_ONEHOOK);
                return (
                  <button
                    key={row.id}
                    onClick={() => onSelect(row.isMrOneHook ? MR_ONEHOOK : row.id)}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors relative ${
                      isActive ? 'bg-bg' : 'hover:bg-bg/60'
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

function AddByUsernameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const handle = username.trim();
    if (!handle || submitting) return;
    setSubmitting(true);
    try {
      await ConnectApi.byUsername(handle);
      // CRITICAL: identical confirmation for every outcome — never reveal whether the handle
      // exists, is already connected, or is blocked.
      showToast(ADD_BY_USERNAME_CONFIRMATION, 'success');
      setUsername('');
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'We couldn’t send that just now. Please try again.';
      showToast(message, 'error');
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
        >
          <div
            className="max-w-md w-full bg-white border border-accent p-8 space-y-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-serif italic tracking-tight">Add by username</h3>
              <button onClick={onClose} className="p-1 hover:opacity-60" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs opacity-60 leading-relaxed italic">
              Enter someone&rsquo;s username to send a connection request.
            </p>
            <input
              type="text"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="@username"
              className="w-full p-3 border border-border text-sm bg-bg outline-none focus:border-accent"
            />
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-3 border border-border text-[10px] uppercase tracking-widest font-bold hover:bg-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !username.trim()}
                className="flex-1 py-3 bg-accent text-white text-[10px] uppercase tracking-widest font-black hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2"
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
        >
          <div
            className="max-w-md w-full bg-white border border-accent p-8 space-y-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-serif italic tracking-tight">Choose wallpaper</h3>
              <button onClick={onClose} className="p-1 hover:opacity-60" aria-label="Close">
                <X className="w-4 h-4" />
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
}: {
  open: boolean;
  onClose: () => void;
  isMrOneHook: boolean;
  peerProfile: UserProfile | null;
  peerName: string;
  peerPhoto: string;
  distanceKm: number | null;
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
        >
          <div
            className="max-w-md w-full bg-white border border-accent p-8 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-serif italic tracking-tight">
                {isMrOneHook ? 'About Mr.OneHook' : 'Profile'}
              </h3>
              <button onClick={onClose} className="p-1 hover:opacity-60" aria-label="Close">
                <X className="w-4 h-4" />
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
                {peerProfile?.currentLocation && (
                  <div className="flex items-center gap-1.5 text-xs opacity-60">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{peerProfile.currentLocation}</span>
                  </div>
                )}
                {/* Distance is coarsened server-side; only shown when available. */}
                {distanceKm != null && (
                  <div className="flex items-center gap-1.5 text-xs opacity-60">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{distanceKm} km away</span>
                  </div>
                )}
                {peerProfile?.work && (
                  <div className="flex items-center gap-1.5 text-xs opacity-60">
                    <Briefcase className="w-3.5 h-3.5 shrink-0" />
                    <span>{peerProfile.work}</span>
                  </div>
                )}
                {humanizeEnum(peerProfile?.relationshipType) && (
                  <div className="text-xs opacity-60">
                    Looking for: {humanizeEnum(peerProfile?.relationshipType)}
                  </div>
                )}
                {peerProfile?.bio && (
                  <p className="text-xs leading-relaxed opacity-70 italic border-t border-border pt-4">
                    &ldquo;{peerProfile.bio}&rdquo;
                  </p>
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
  onCancel,
  onConfirm,
}: {
  open: boolean;
  reason: BlockReason;
  onReason: (r: BlockReason) => void;
  submitting: boolean;
  peerName: string;
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
          <div className="max-w-md w-full bg-white border border-accent p-8 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-2xl font-serif italic tracking-tight">Report &amp; block</h3>
            </div>
            <p className="text-xs opacity-70 leading-relaxed">
              Blocking {peerName} ends this connection and prevents further contact. Your chat history
              is archived. This can&rsquo;t be undone from here.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => onReason(e.target.value as BlockReason)}
                className="w-full p-3 border border-border text-xs bg-bg outline-none focus:border-accent"
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
                className="flex-1 py-3 border border-border text-[10px] uppercase tracking-widest font-bold hover:bg-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(reason)}
                disabled={submitting}
                className="flex-1 py-3 bg-red-600 text-white text-[10px] uppercase tracking-widest font-black hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <LoadingSpinner size="sm" /> : 'Block & report'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
