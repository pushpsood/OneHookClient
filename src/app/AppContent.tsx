import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, LogOut } from 'lucide-react';
import { UserState } from '../types';
import { isPremium, useAppStore } from '../store/app-store';
import { useCandidates, useProfile, useSwipe, useUserState } from '../hooks/use-api';
import { useUserLocation } from '../hooks/use-user-location';
import { ApiError } from '../lib/api-client';
import { StateApi } from '../api/state';
import { getCognitoAuth } from '../lib/cognito-auth';
import { BrandWordmark } from '../components/common/BrandWordmark';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useToast } from '../../src/components/common/Toast';
import { MediaImage } from '../components/common/MediaImage';
import { DiscoveryView } from '../features/discovery/DiscoveryView';
import { MatchesView } from '../features/matches/MatchesView';
import { ProfileView } from '../features/profile/ProfileView';
import { KeyRecoveryResponder } from '../components/chat/KeyRecoveryResponder';
import { useHistoryUnlock } from '../hooks/use-history-unlock';

export function AppContent() {
  const navigate = useNavigate();
  const [appState, setAppState] = useState<'DISCOVERY' | 'MATCHES' | 'PROFILE'>('DISCOVERY');
  const { currentUser, setCurrentUser, logout, userState } = useAppStore();

  // Try the silent rungs of the history-key unlock ladder once per session: a device wrap sealed to this
  // device opens history with no prompt at all. PRF is deliberately NOT attempted here, because an
  // unbidden biometric dialog at sign-in would be alarming and is usually pointless — the recovery UI
  // asks for it when the user has actually chosen to restore.
  useHistoryUnlock(currentUser?.id);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile();
  // Authoritative tier + connection state (State service owns these; the profile omits the tier).
  const { refetch: refetchUserState } = useUserState();
  const premium = useAppStore(isPremium);
  const [upgrading, setUpgrading] = useState(false);

  // Proactively acquire high-accuracy GPS or fallback coordinates and index with backend
  const { coords: userCoords } = useUserLocation(
    currentUser?.id,
    currentUser?.currentLocation || currentUser?.hometown
  );

  const handleUpgrade = async () => {
    if (!currentUser) return;
    setUpgrading(true);
    try {
      // Body-less reconciliation; the response is the freshly reconciled authoritative state.
      await StateApi.reconcileEntitlements();
      // Refresh the token so the custom:subscriptionTier claim other services read catches up,
      // then re-read the authoritative state to update the UI.
      const auth = getCognitoAuth();
      await auth.refreshAccessToken();
      await Promise.all([refetchUserState(), refetchProfile()]);
      showToast('Welcome to Premium! 🎉', 'success');
    } catch (error) {
      console.error('Upgrade failed:', error);
      showToast('We couldn’t complete your upgrade. Please try again.', 'error');
    } finally {
      setUpgrading(false);
    }
  };

  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
    refresh: refreshCandidates,
  } = useCandidates(userCoords);
  const { swipe, loading: swipeLoading } = useSwipe();
  const { showToast } = useToast();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setCurrentUser(profile);
    }
  }, [profile, setCurrentUser]);

  useEffect(() => {
    if (!currentUser && (profileError || userState?.state === UserState.ONBOARDING)) {
      navigate('/onboarding', { replace: true });
    }
  }, [currentUser, profileError, userState?.state, navigate]);

  useEffect(() => {
    if (!activeMatchId && currentUser?.currentMatches?.length) {
      setActiveMatchId(currentUser.currentMatches[0]);
    } else if (!activeMatchId && userState?.matchIds?.length) {
      setActiveMatchId(userState.matchIds[0]);
    }
  }, [activeMatchId, currentUser, userState]);

  const handleSwipe = async (targetId: string, direction: 'LEFT' | 'RIGHT') => {
    try {
      const result = await swipe(targetId, direction);

      if (result.matched) {
        showToast("It's a match! 🎉", 'success');
        setActiveMatchId(result.matchId || null);
        setAppState('MATCHES');
      } else if (direction === 'RIGHT') {
        showToast(
          'Your interest is on its way — we’ll let you know if they feel the same.',
          'info'
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      } else {
        showToast('We couldn’t send that just now. Please try again.', 'error');
      }

      return false;
    }
  };

  const handleLogout = async () => {
    try {
      await getCognitoAuth().logout();
    } catch (e) {
      console.error('Logout error', e);
    }
    logout();
    showToast('You’re signed out.', 'info');
    navigate('/', { replace: true });
  };

  if (
    profileLoading ||
    (!currentUser && (profileError || userState?.state === UserState.ONBOARDING))
  ) {
    return <LoadingSpinner fullScreen />;
  }

  if (!currentUser) {
    if (profileError) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-accent p-12 text-center space-y-8">
            <h2 className="text-4xl font-serif italic uppercase tracking-tighter text-red-600">
              We Couldn&rsquo;t Load Your Profile
            </h2>
            <p className="text-xs opacity-60 leading-relaxed italic text-red-500">
              {profileError.message || 'We couldn’t load your profile. Please try again.'}
            </p>
            <button
              onClick={async () => {
                try {
                  await getCognitoAuth().logout();
                } catch (e) {
                  console.error(e);
                }
                logout();
                navigate('/login');
              }}
              className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
            >
              Back to Sign In
            </button>
            <button
              onClick={() => refetchProfile()}
              className="w-full py-4 mt-4 border border-accent text-accent text-[10px] uppercase tracking-[0.3em] font-black hover:bg-bg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    // If no error, we are in the middle of a state update.
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="h-screen bg-bg text-text selection:bg-accent selection:text-white flex flex-col border-t-4 border-accent overflow-hidden">
      {(profileError || candidatesError) && (
        <div className="px-10 py-3 bg-red-50 text-red-700 text-[10px] uppercase tracking-[0.2em] font-bold border-b border-red-100 shrink-0">
          {profileError?.message ||
            candidatesError?.message ||
            'We’re having trouble loading the latest updates. Here’s what we have for now.'}
        </div>
      )}

      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between px-10 h-20 border-b border-border bg-bg/80 backdrop-blur-md sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-2">
          <BrandWordmark className="text-xl font-bold tracking-tighter uppercase" />
          <span className="text-[10px] px-2 py-0.5 bg-accent text-white rounded-full tracking-widest font-bold">
            {premium ? 'PREMIUM' : 'BASIC'}
          </span>
        </div>
        <div className="flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] uppercase">
          <button
            onClick={() => setAppState('DISCOVERY')}
            className={`hover:opacity-100 transition-opacity ${appState === 'DISCOVERY' ? 'opacity-100 border-b-2 border-accent pb-1' : 'opacity-40'}`}
          >
            Discovery
          </button>
          <button
            onClick={() => setAppState('MATCHES')}
            className={`hover:opacity-100 transition-opacity ${appState === 'MATCHES' ? 'opacity-100 border-b-2 border-accent pb-1' : 'opacity-40'}`}
          >
            Matches
          </button>
          <button
            onClick={() => setAppState('PROFILE')}
            className={`hover:opacity-100 transition-opacity ${appState === 'PROFILE' ? 'opacity-100 border-b-2 border-accent pb-1' : 'opacity-40'}`}
          >
            Profile
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleLogout}
            className="text-[9px] font-mono opacity-30 uppercase tracking-widest hover:opacity-100 transition-opacity flex items-center gap-2"
            title="Logout"
          >
            <LogOut className="w-3 h-3" />
          </button>
          <span className="text-[9px] font-mono opacity-30 uppercase tracking-widest">
            ID: {currentUser.id}
          </span>
          <button
            onClick={() => setAppState('PROFILE')}
            className="w-8 h-8 rounded-full bg-border flex items-center justify-center border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent transition-all"
            title="View Profile"
          >
            <MediaImage
              src={currentUser.photos?.[0]}
              alt="Me"
              loading="eager"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          {appState === 'DISCOVERY' && (
            <DiscoveryView
              key="discovery"
              candidates={candidates}
              loading={candidatesLoading}
              error={candidatesError}
              onSwipe={handleSwipe}
              onRetry={refreshCandidates}
            />
          )}
          {appState === 'MATCHES' && (
            <MatchesView
              key="matches"
              currentUser={currentUser}
              userState={userState}
              activeMatchId={activeMatchId}
              onSelectMatch={(matchId) => setActiveMatchId(matchId)}
              onRefetchState={async () => {
                await refetchUserState();
              }}
              onNavigateToDiscovery={() => setAppState('DISCOVERY')}
            />
          )}
          {appState === 'PROFILE' && (
            <div className="flex-1 overflow-y-auto w-full h-full p-6 md:p-12">
              <ProfileView
                key="profile"
                user={currentUser}
                onUpgrade={handleUpgrade}
                upgrading={upgrading}
                onVerified={refetchProfile}
              />
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Connection Guard Overlay */}
      <AnimatePresence>
        {userState?.state === UserState.HOOKED && appState === 'DISCOVERY' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-white/90 backdrop-blur-sm flex items-center justify-center p-8"
          >
            <div className="max-w-md w-full border border-accent p-12 text-center space-y-8 bg-white shadow-2xl">
              <div className="w-16 h-16 border-2 border-accent rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
                  You&rsquo;re Hooked
                </h2>
                <p className="text-xs opacity-60 leading-relaxed italic">
                  OneHook is about one connection at a time. Discovery is paused so you can focus on
                  the person you&rsquo;re already getting to know.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setAppState('MATCHES')}
                  className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
                >
                  Go to Matches & Chat
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Mounted app-wide (not inside the chat screens) because a history-transfer request must be
        answerable from wherever the user happens to be — the device being asked is usually not the
        one with a conversation open. It renders nothing unless a request arrives, and stays entirely
        inert on devices that do not hold the history key.
      */}
      <KeyRecoveryResponder />
    </div>
  );
}
