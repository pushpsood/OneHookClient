import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
} from 'lucide-react';
import type { UserProfile, UserStateSnapshot, Match } from '../../types';
import { UserState, SubscriptionTier } from '../../types';
import { StateApi } from '../../api/state';
import { ProfileApi } from '../../api/profile';
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
  onOpenChat,
  onRefetchState,
  onNavigateToDiscovery,
}: {
  key?: string;
  currentUser: UserProfile;
  userState: UserStateSnapshot | null;
  onOpenChat: (matchId: string) => void;
  onRefetchState?: () => Promise<void>;
  onNavigateToDiscovery: () => void;
}) {
  const { showToast } = useToast();
  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loading, setLoading] = useState(true);
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

  const handleUnhook = async () => {
    if (!unhookingMatchId) return;

    setIsUnhooking(true);
    try {
      const reason = unhookReason === 'OTHER' ? customReason.trim() : unhookReason;
      await StateApi.releaseHook(unhookingMatchId, reason);
      showToast('Connection released. You are now available for new connections.', 'info');
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
      className="flex-1 flex flex-col bg-[#F9F9F9] overflow-y-auto"
    >
      {/* Connection Status Banner */}
      <div className="bg-white border-b border-border px-8 md:px-12 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-serif italic text-accent uppercase tracking-widest font-black">
                OneHook Connection
              </span>
              <span className="text-[10px] px-2 py-0.5 border border-border rounded font-mono uppercase tracking-wider text-black/60">
                Live
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-serif italic tracking-tight">
              Connections & Matches
            </h1>
            <p className="text-xs opacity-60 leading-relaxed max-w-xl">
              OneHook is built around genuine single-connection focus. Discovery is paused while
              connected to give each connection your full attention.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-bg border border-border p-4 text-center min-w-[140px]">
              <div className="text-[9px] uppercase tracking-widest opacity-40 font-bold mb-1">
                Status
              </div>
              <div className="flex items-center justify-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isHooked ? 'bg-status-hooked animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                <span className="text-xs font-black uppercase tracking-wider font-mono">
                  {userState?.state || UserState.AVAILABLE}
                </span>
              </div>
            </div>

            <div className="bg-bg border border-border p-4 text-center min-w-[140px]">
              <div className="text-[9px] uppercase tracking-widest opacity-40 font-bold mb-1">
                Connection Capacity
              </div>
              <div className="text-xs font-black uppercase tracking-wider font-mono">
                {activeConnections} / {maxConnections} Connected
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Matches Container */}
      <div className="flex-1 max-w-5xl mx-auto w-full p-8 md:p-12">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : matches.length === 0 ? (
          /* Empty State */
          <div className="bg-white border border-border p-12 text-center space-y-8 max-w-lg mx-auto shadow-sm">
            <div className="w-16 h-16 border-2 border-accent/20 rounded-full flex items-center justify-center mx-auto text-accent">
              <HeartHandshake className="w-8 h-8 opacity-60" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-serif italic tracking-tight">No Active Connections</h2>
              <p className="text-xs opacity-60 leading-relaxed italic">
                You are currently in the <strong className="font-mono">AVAILABLE</strong> state.
                Explore Discovery to find a meaningful mutual match.
              </p>
            </div>
            <button
              onClick={onNavigateToDiscovery}
              className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
            >
              Go to Discovery
            </button>
          </div>
        ) : (
          /* Match List */
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-serif italic">Your Active Matches ({matches.length})</h2>
                <p className="text-[11px] opacity-50">
                  Select a match to start messaging or manage your connection state.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {matches.map((m) => {
                const profile = m.peerProfile;
                const displayName = profile?.displayName || profile?.name || 'Your Match';
                const photo = profile?.photos?.[0] || FALLBACK_PROFILE_IMAGE;

                return (
                  <div
                    key={m.matchId}
                    className="bg-white border border-border overflow-hidden flex flex-col shadow-sm hover:border-accent transition-colors"
                  >
                    <div className="flex flex-row p-6 gap-6 items-start">
                      <div className="w-28 h-36 bg-border overflow-hidden grayscale grayscale-hover shrink-0 relative border border-border">
                        <MediaImage
                          src={photo}
                          alt={displayName}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 bg-black/70 px-1.5 py-0.5 text-[8px] font-mono text-white tracking-widest uppercase">
                          Hooked
                        </div>
                      </div>

                      <div className="flex-1 space-y-3 min-w-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-2xl font-serif italic truncate">{displayName}</h3>
                            {profile?.age && (
                              <span className="text-sm opacity-50 font-serif">, {profile.age}</span>
                            )}
                            {profile?.verified && (
                              <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                            )}
                          </div>
                          {profile?.currentLocation && (
                            <div className="flex items-center gap-1 text-[10px] opacity-50 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{profile.currentLocation}</span>
                            </div>
                          )}
                          {profile?.work && (
                            <div className="flex items-center gap-1 text-[10px] opacity-50 mt-0.5">
                              <Briefcase className="w-3 h-3" />
                              <span className="truncate">{profile.work}</span>
                            </div>
                          )}
                        </div>

                        {profile?.bio ? (
                          <p className="text-xs opacity-70 line-clamp-2 leading-relaxed">
                            {profile.bio}
                          </p>
                        ) : (
                          <p className="text-[11px] opacity-40 italic">
                            Connected on {formatMatchDate(m.createdAt)}
                          </p>
                        )}

                        <div className="text-[9px] font-mono opacity-40 uppercase tracking-widest">
                          Match ID: {m.matchId.substring(0, 8)}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border bg-bg/50 p-4 flex items-center justify-between gap-4">
                      <button
                        onClick={() => onOpenChat(m.matchId)}
                        className="flex-1 py-3 bg-accent text-white text-[10px] uppercase tracking-[0.25em] font-black hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Open Chat
                      </button>

                      <button
                        onClick={() => setUnhookingMatchId(m.matchId)}
                        className="py-3 px-4 border border-border text-red-600 text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-1.5"
                        title="Release this connection"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Unhook
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
