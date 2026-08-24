import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageStatus } from 'onehook-api-client/graphql';
import {
  HeartHandshake,
  MessageCircle,
  UserX,
  Lock,
  Sparkles,
  ShieldCheck,
  MapPin,
  Briefcase,
  AlertTriangle,
  ArrowLeft,
  Info,
  Send,
} from 'lucide-react';
import type { UserProfile, UserStateSnapshot, ChatMessageDTO } from '../../types';
import { UserState, SubscriptionTier } from '../../types';
import { StateApi } from '../../api/state';
import { ProfileApi } from '../../api/profile';
import { useChatMessages } from '../../hooks/use-api';
import { ApiError } from '../../lib/api-client';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { MediaImage } from '../../components/common/MediaImage';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { useToast } from '../../components/common/Toast';

export interface HydratedMatch {
  matchId: string;
  status: string;
  createdAt: number;
  peerId: string;
  peerProfile?: UserProfile | null;
  loadingProfile: boolean;
}

export function MatchesView({
  currentUser,
  userState,
  activeMatchId: initialActiveMatchId,
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
  onNavigateToDiscovery: () => void;
}) {
  const { showToast } = useToast();
  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(
    initialActiveMatchId || null
  );
  const [showMobileChat, setShowMobileChat] = useState<boolean>(
    Boolean(initialActiveMatchId)
  );
  const [showProfileDetails, setShowProfileDetails] = useState(false);

  const [unhookingMatchId, setUnhookingMatchId] = useState<string | null>(null);
  const [unhookReason, setUnhookReason] = useState<string>('NOT_A_FIT');
  const [customReason, setCustomReason] = useState<string>('');
  const [isUnhooking, setIsUnhooking] = useState(false);

  const matchIds = userState?.matchIds || [];
  const activeConnections = userState?.activeConnections ?? matchIds.length;
  const isHooked = userState?.state === UserState.HOOKED;
  const tier = userState?.subscriptionTier || SubscriptionTier.FREE;
  const maxConnections = tier === SubscriptionTier.FREE ? 1 : 3;

  const loadMatches = useCallback(async () => {
    if (!matchIds.length) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const matchRecords = await Promise.all(
        matchIds.map(async (id) => {
          try {
            const record = await StateApi.getMatch(id);
            const peerId = record.userA === currentUser.id ? record.userB : record.userA;
            return {
              matchId: id,
              status: record.status || 'ACTIVE',
              createdAt: record.createdAt || Date.now(),
              peerId: peerId || '',
              loadingProfile: true,
            } as HydratedMatch;
          } catch {
            return {
              matchId: id,
              status: 'ACTIVE',
              createdAt: Date.now(),
              peerId: '',
              loadingProfile: false,
            } as HydratedMatch;
          }
        })
      );

      setMatches(matchRecords);

      // Hydrate peer profiles in background
      matchRecords.forEach(async (m, index) => {
        if (!m.peerId) {
          setMatches((prev) =>
            prev.map((item, i) => (i === index ? { ...item, loadingProfile: false } : item))
          );
          return;
        }
        try {
          const profile: any = await ProfileApi.get(m.peerId);
          if (profile) {
            profile.id = profile.userId || m.peerId;
            profile.name = profile.displayName || profile.name || 'Anonymous';
            profile.photos =
              profile.pictures && profile.pictures.length > 0
                ? profile.pictures
                : profile.photos || [];
          }
          setMatches((prev) =>
            prev.map((item, i) =>
              i === index ? { ...item, peerProfile: profile, loadingProfile: false } : item
            )
          );
        } catch {
          setMatches((prev) =>
            prev.map((item, i) => (i === index ? { ...item, loadingProfile: false } : item))
          );
        }
      });
    } catch (err) {
      console.error('Failed to load matches:', err);
    } finally {
      setLoading(false);
    }
  }, [matchIds, currentUser.id]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  // Sync selected match with prop changes or list updates
  useEffect(() => {
    if (initialActiveMatchId) {
      setSelectedMatchId(initialActiveMatchId);
      setShowMobileChat(true);
    } else if (matches.length > 0 && !selectedMatchId) {
      const firstId = matches[0].matchId;
      setSelectedMatchId(firstId);
      onSelectMatch?.(firstId);
    } else if (matches.length === 0) {
      setSelectedMatchId(null);
      onSelectMatch?.(null);
      setShowMobileChat(false);
    }
  }, [initialActiveMatchId, matches, selectedMatchId, onSelectMatch]);

  const activeMatch = matches.find((m) => m.matchId === selectedMatchId) || null;
  const peerProfile = activeMatch?.peerProfile;
  const recipientId = activeMatch?.peerId;

  const handleSelectMatch = (matchId: string) => {
    setSelectedMatchId(matchId);
    setShowMobileChat(true);
    onSelectMatch?.(matchId);
  };

  const handleUnhook = async () => {
    if (!unhookingMatchId) return;

    setIsUnhooking(true);
    try {
      const reason = unhookReason === 'OTHER' ? customReason.trim() : unhookReason;
      await StateApi.releaseHook(unhookingMatchId, reason);
      showToast('Connection released. You are now available for new connections.', 'info');

      if (selectedMatchId === unhookingMatchId) {
        const remaining = matches.filter((m) => m.matchId !== unhookingMatchId);
        const nextId = remaining.length > 0 ? remaining[0].matchId : null;
        setSelectedMatchId(nextId);
        onSelectMatch?.(nextId);
        if (!nextId) setShowMobileChat(false);
      }

      setUnhookingMatchId(null);
      setCustomReason('');
      if (onRefetchState) {
        await onRefetchState();
      }
      await loadMatches();
    } catch (err: any) {
      console.error('Unhook failed:', err);
      showToast(err?.message || 'Could not release match. Please try again.', 'error');
    } finally {
      setIsUnhooking(false);
    }
  };

  const formatMatchDate = (timestamp: number) => {
    if (!timestamp) return 'Recently';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex w-full h-full overflow-hidden bg-bg min-h-0"
    >
      {/* Master Column: Connections / Matches Sidebar */}
      <aside
        className={`w-full md:w-80 lg:w-96 border-r border-border flex flex-col h-full bg-[#F9F9F9] shrink-0 overflow-hidden min-h-0 ${
          showMobileChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Status & Capacity Header */}
        <div className="p-6 border-b border-border bg-white space-y-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-serif italic text-accent uppercase tracking-widest font-black">
                Connections
              </span>
              <span className="text-[9px] px-1.5 py-0.5 border border-border rounded font-mono uppercase tracking-wider text-black/60">
                Live
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  isHooked ? 'bg-status-hooked animate-pulse' : 'bg-emerald-500'
                }`}
              />
              <span className="text-[10px] font-black uppercase tracking-wider font-mono">
                {userState?.state || UserState.AVAILABLE}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-black/60 pt-2 border-t border-border">
            <span>Capacity</span>
            <span className="font-bold text-black">
              {activeConnections} / {maxConnections} Connected
            </span>
          </div>
        </div>

        {/* Matches List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : matches.length === 0 ? (
            <div className="bg-white border border-border p-8 text-center space-y-6 shadow-sm mt-4">
              <div className="w-12 h-12 border-2 border-accent/20 rounded-full flex items-center justify-center mx-auto text-accent">
                <HeartHandshake className="w-6 h-6 opacity-60" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-serif italic">No Active Connections</h3>
                <p className="text-[11px] opacity-60 leading-relaxed italic">
                  Explore Discovery to find a meaningful mutual connection.
                </p>
              </div>
              <button
                onClick={onNavigateToDiscovery}
                className="w-full py-3 bg-accent text-white text-[9px] uppercase tracking-[0.25em] font-black hover:opacity-90 transition-opacity"
              >
                Go to Discovery
              </button>
            </div>
          ) : (
            matches.map((m) => {
              const profile = m.peerProfile;
              const displayName = profile?.displayName || profile?.name || 'Your Match';
              const photo = profile?.photos?.[0] || FALLBACK_PROFILE_IMAGE;
              const isSelected = m.matchId === selectedMatchId;

              return (
                <div
                  key={m.matchId}
                  onClick={() => handleSelectMatch(m.matchId)}
                  className={`w-full p-4 border transition-all text-left flex items-center gap-4 cursor-pointer relative ${
                    isSelected
                      ? 'bg-white border-accent shadow-sm'
                      : 'bg-white/70 border-border hover:border-black/30 hover:bg-white'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
                  )}
                  <div className="w-14 h-18 bg-border overflow-hidden shrink-0 border border-border grayscale grayscale-hover">
                    <MediaImage
                      src={photo}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-base font-serif italic truncate font-bold">
                        {displayName}
                      </h4>
                      {profile?.age && (
                        <span className="text-xs opacity-50 font-serif">, {profile.age}</span>
                      )}
                      {profile?.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-accent shrink-0" />
                      )}
                    </div>

                    {profile?.currentLocation && (
                      <div className="flex items-center gap-1 text-[10px] opacity-50 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{profile.currentLocation}</span>
                      </div>
                    )}

                    <p className="text-[10px] opacity-40 italic mt-1 truncate">
                      {profile?.bio ? profile.bio : `Connected ${formatMatchDate(m.createdAt)}`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Detail Column: Conversation & Profile */}
      <main
        className={`flex-1 flex h-full overflow-hidden bg-white min-h-0 ${
          !showMobileChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedMatchId && activeMatch ? (
          <div className="flex-1 flex h-full overflow-hidden min-h-0">
            {/* Conversation Area */}
            <ChatConversationPanel
              matchId={selectedMatchId}
              peerId={recipientId}
              peerProfile={peerProfile}
              onBack={() => setShowMobileChat(false)}
              onToggleProfile={() => setShowProfileDetails((prev) => !prev)}
              onUnhookClick={() => setUnhookingMatchId(selectedMatchId)}
            />

            {/* Peer Profile Inspector Panel (Desktop Side or Drawer) */}
            <AnimatePresence>
              {(showProfileDetails || window.innerWidth >= 1280) && (
                <motion.section
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 340 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-l border-border bg-[#FAFAFA] flex flex-col h-full shrink-0 overflow-hidden hidden lg:flex min-h-0"
                >
                  <div className="p-6 flex-1 overflow-y-auto space-y-6 min-h-0">
                    <div className="relative">
                      <div className="aspect-[3/4] w-full bg-border overflow-hidden grayscale grayscale-hover border border-border">
                        <MediaImage
                          src={peerProfile?.photos?.[0] || FALLBACK_PROFILE_IMAGE}
                          alt={peerProfile?.displayName || 'Peer'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute bottom-3 left-3 bg-black/80 px-2 py-1 text-[8px] font-mono text-white tracking-widest uppercase flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-status-hooked animate-pulse" />
                        <span>Hooked</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-serif italic">
                          {peerProfile?.displayName || peerProfile?.name || 'Your Match'}
                        </h3>
                        {peerProfile?.age && (
                          <span className="text-base opacity-50 font-serif">
                            , {peerProfile.age}
                          </span>
                        )}
                        {peerProfile?.verified && (
                          <ShieldCheck className="w-4 h-4 text-accent" />
                        )}
                      </div>

                      {peerProfile?.currentLocation && (
                        <div className="flex items-center gap-1.5 text-xs opacity-60">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{peerProfile.currentLocation}</span>
                        </div>
                      )}

                      {peerProfile?.work && (
                        <div className="flex items-center gap-1.5 text-xs opacity-60">
                          <Briefcase className="w-3.5 h-3.5 shrink-0" />
                          <span>{peerProfile.work}</span>
                        </div>
                      )}

                      {peerProfile?.bio && (
                        <p className="text-xs leading-relaxed opacity-70 italic border-t border-border pt-4">
                          &ldquo;{peerProfile.bio}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="p-4 border border-border bg-white space-y-2">
                      <div className="text-[9px] uppercase tracking-[0.2em] font-black text-accent">
                        Focus Mode
                      </div>
                      <p className="text-[10px] opacity-50 leading-relaxed italic">
                        Discovery is paused while connected so you can engage with full intent.
                      </p>
                    </div>
                  </div>

                  <div className="p-6 border-t border-border bg-white shrink-0">
                    <button
                      onClick={() => setUnhookingMatchId(selectedMatchId)}
                      className="w-full py-3 px-4 border border-red-200 text-red-600 text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Unhook Connection
                    </button>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#F9F9F9]">
            <div className="max-w-md w-full bg-white border border-border p-12 space-y-6 shadow-sm">
              <div className="w-14 h-14 border-2 border-border rounded-full flex items-center justify-center mx-auto text-accent">
                <MessageCircle className="w-6 h-6 opacity-40" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-serif italic">Select a Connection</h3>
                <p className="text-xs opacity-60 leading-relaxed italic">
                  Choose a match from the list on the left to start messaging.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Unhook Confirmation Modal */}
      <AnimatePresence>
        {unhookingMatchId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full bg-white border border-accent p-8 space-y-6 shadow-2xl">
              <div className="flex items-center gap-3 text-red-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-2xl font-serif italic tracking-tight">Release Connection</h3>
              </div>

              <p className="text-xs opacity-70 leading-relaxed">
                Unhooking releases this match and resets your status to{' '}
                <strong className="font-mono">AVAILABLE</strong> so you can discover new people.
                Your private chat history with this match will be archived.
              </p>

              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 block">
                  Reason for releasing (optional):
                </label>
                <select
                  value={unhookReason}
                  onChange={(e) => setUnhookReason(e.target.value)}
                  className="w-full p-3 border border-border text-xs bg-bg outline-none focus:border-accent"
                >
                  <option value="NOT_A_FIT">We’re not a good fit</option>
                  <option value="NO_RESPONSE">Didn’t get a response</option>
                  <option value="FOUND_CONNECTION">Found a connection</option>
                  <option value="TAKING_BREAK">Taking a break from dating</option>
                  <option value="OTHER">Other</option>
                </select>

                {unhookReason === 'OTHER' && (
                  <input
                    type="text"
                    placeholder="Briefly specify..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full p-3 border border-border text-xs bg-bg outline-none focus:border-accent mt-2"
                  />
                )}
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <button
                  onClick={() => {
                    setUnhookingMatchId(null);
                    setCustomReason('');
                  }}
                  disabled={isUnhooking}
                  className="flex-1 py-3 border border-border text-[10px] uppercase tracking-widest font-bold hover:bg-bg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnhook}
                  disabled={isUnhooking}
                  className="flex-1 py-3 bg-red-600 text-white text-[10px] uppercase tracking-widest font-black hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  {isUnhooking ? <LoadingSpinner size="sm" /> : 'Confirm Unhook'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Inner conversation component managing chat messages and input for the selected match
 */
function ChatConversationPanel({
  matchId,
  peerId,
  peerProfile,
  onBack,
  onToggleProfile,
  onUnhookClick,
}: {
  matchId: string;
  peerId?: string;
  peerProfile?: UserProfile | null;
  onBack: () => void;
  onToggleProfile: () => void;
  onUnhookClick: () => void;
}) {
  const { messages, loading, error, sendMessage, markAsDelivered, markAsRead } = useChatMessages(
    matchId,
    peerId
  );
  const [input, setInput] = useState('');
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as delivered
  useEffect(() => {
    messages
      .filter((m) => m.senderId !== 'me' && m.status === 'SENT')
      .forEach((m) => markAsDelivered(m.messageId));
  }, [messages, markAsDelivered]);

  // Mark messages as read when viewing
  useEffect(() => {
    const timer = setTimeout(() => {
      messages
        .filter((m) => m.senderId !== 'me' && m.status === 'DELIVERED')
        .forEach((m) => markAsRead(m.messageId));
    }, 1000);

    return () => clearTimeout(timer);
  }, [messages, markAsRead]);

  const handleSend = async () => {
    if (!input.trim() || !matchId) return;

    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      }
    }
  };

  const getMessageStatusIcon = (message: ChatMessageDTO) => {
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

  const peerName = peerProfile?.displayName || peerProfile?.name || 'Your Match';

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden min-h-0">
      {/* Conversation Header */}
      <div className="px-6 md:px-8 py-5 border-b border-border flex items-center justify-between bg-white z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-border hover:border-accent hover:bg-bg transition-colors md:hidden"
            title="Back to Connections"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base md:text-lg font-serif italic font-bold truncate">
                {peerName}
              </h3>
              {peerProfile?.verified && (
                <ShieldCheck className="w-3.5 h-3.5 text-accent shrink-0" />
              )}
            </div>
            <div className="text-[9px] opacity-40 uppercase tracking-widest font-mono">
              End-to-End Encrypted
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onToggleProfile}
            className="p-2 border border-border hover:border-accent text-accent text-[10px] uppercase font-bold tracking-wider hover:bg-bg transition-colors lg:hidden flex items-center gap-1.5"
            title="Profile info"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Profile</span>
          </button>
          <button
            onClick={onUnhookClick}
            className="py-2 px-3 border border-border text-red-600 text-[9px] uppercase tracking-wider font-bold hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-1"
            title="Unhook this connection"
          >
            <UserX className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Unhook</span>
          </button>
        </div>
      </div>

      {/* Message History */}
      <div className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto bg-white min-h-0">
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
                {getMessageStatusIcon(m)}
              </div>
              <div
                className={`p-5 text-sm leading-relaxed ${
                  m.senderId === 'me'
                    ? 'bg-accent text-white shadow-md'
                    : 'bg-[#F2F2F2] text-accent'
                }`}
              >
                {m.ciphertext}
                {m.status === 'FAILED' && (
                  <div className="mt-2 text-[10px] text-red-300 flex items-center gap-1">
                    <span>Didn&rsquo;t send</span>
                    <button
                      onClick={() => sendMessage(m.ciphertext)}
                      className="underline hover:opacity-70"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Composer */}
      <div className="p-6 md:p-8 border-t border-border bg-white shrink-0">
        <div className="relative flex items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            type="text"
            placeholder="Write a message…"
            className="w-full py-3 pr-20 pl-0 border-b border-accent focus:border-b-2 transition-all outline-none text-sm bg-transparent placeholder:opacity-30 italic font-serif"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="absolute right-0 bottom-3 text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-50 transition-opacity disabled:opacity-20 flex items-center gap-1 text-accent"
          >
            Send
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-[8px] opacity-20 uppercase tracking-[0.3em] font-mono">
          <span>Connected</span>
          <span>One Connection at a Time</span>
        </div>
      </div>
    </div>
  );
}
