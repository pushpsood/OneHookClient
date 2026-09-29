import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Lock } from 'lucide-react';
import { UserState } from '../types';
import { isPremium, useAppStore } from '../store/app-store';
import { useCandidates, useProfile, useSwipe, useUserState } from '../hooks/use-api';
import { useUserLocation } from '../hooks/use-user-location';
import { ApiError } from '../lib/api-client';
import { StateApi } from '../api/state';
import { getCognitoAuth } from '../lib/cognito-auth';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useToast } from '../../src/components/common/Toast';
import { DiscoveryView } from '../features/discovery/DiscoveryView';
import { LikesYouView } from '../features/discovery/LikesYouView';
import type { LikeTargetType } from '../api/rest';
import { ChatView } from '../features/chat/ChatView';
import { ProfileView } from '../features/profile/ProfileView';
import { KeyRecoveryResponder } from '../components/chat/KeyRecoveryResponder';
import { useHistoryUnlock } from '../hooks/use-history-unlock';
import { startAnalytics, stopAnalytics, trackScreenView, trackHookedStateView } from '../lib/analytics/analytics';
import { BottomTabBar, type AppTab } from './BottomTabBar';
import { TopBar } from './TopBar';
import { DesktopSidebar } from './DesktopSidebar';
import { SearchDrawer } from './SearchDrawer';
import { CreateModal } from './CreateModal';
import { useTheme } from '../lib/theme';

export function AppContent() {
  const navigate = useNavigate();
  const [appState, setAppState] = useState<AppTab>('DISCOVERY');
  const { currentUser, setCurrentUser, logout, userState } = useAppStore();
  const { resolvedTheme } = useTheme();

  // Scope the theme strictly to the /app route and restore default non-app styles when leaving /app
  useEffect(() => {
    const root = document.documentElement;
    const themeClass = resolvedTheme === 'dark' ? 'app-theme-dark' : 'app-theme-light';
    root.classList.add(themeClass);
    if (resolvedTheme === 'dark') {
      root.classList.remove('app-theme-light');
    } else {
      root.classList.remove('app-theme-dark');
    }

    return () => {
      // Clean up completely so landing, login, terms, etc. remain 100% untouched
      root.classList.remove('app-theme-dark', 'app-theme-light');
    };
  }, [resolvedTheme]);

  useHistoryUnlock(currentUser?.id);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile();

  const { refetch: refetchUserState } = useUserState();
  const premium = useAppStore(isPremium);
  const [upgrading, setUpgrading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { coords: userCoords } = useUserLocation(
    currentUser?.id,
    currentUser?.currentLocation || currentUser?.hometown
  );

  const handleUpgrade = async () => {
    if (!currentUser) return;
    setUpgrading(true);
    try {
      await StateApi.reconcileEntitlements();
      const auth = getCognitoAuth();
      await auth.refreshAccessToken();
      await Promise.all([refetchUserState(), refetchProfile()]);
      showToast('Welcome to Premium! 🎉', 'success');
    } catch (error) {
      console.error('Upgrade failed:', error);
      showToast("We couldn't complete your upgrade. Please try again.", 'error');
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
  const { pass, like, loading: swipeLoading } = useSwipe();
  const { showToast } = useToast();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setCurrentUser(profile);
    }
  }, [profile, setCurrentUser]);

  useEffect(() => {
    startAnalytics();
    return () => {
      void stopAnalytics();
    };
  }, []);

  useEffect(() => {
    trackScreenView(appState);
  }, [appState]);

  // The "one connection at a time" exclusivity overlay was shown — differentiator research signal.
  useEffect(() => {
    if (userState?.state === UserState.HOOKED && appState === 'DISCOVERY') {
      trackHookedStateView('shown');
    }
  }, [userState?.state, appState]);

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

  const handlePass = async (targetId: string) => {
    try {
      await pass(targetId);
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      } else {
        showToast("We couldn't send that just now. Please try again.", 'error');
      }
      return false;
    }
  };

  const handleLike = async (
    targetId: string,
    comment: string,
    likeTargetType: LikeTargetType,
    likeTargetRef?: string,
    likeKind?: 'LIKE' | 'ROSE'
  ) => {
    const result = await like({ targetId, comment, likeTargetType, likeTargetRef, likeKind });
    if (result.matched) {
      showToast("It's a match! 🎉", 'success');
      setActiveMatchId(result.matchId || null);
      setAppState('MATCHES');
    } else {
      showToast(
        likeKind === 'ROSE'
          ? 'Your rose is on its way 🌹 — we’ll let you know if they feel the same.'
          : "Your comment is on its way — we'll let you know if they feel the same.",
        'info'
      );
    }
    return true;
  };

  const handleLogout = async () => {
    try {
      await getCognitoAuth().logout();
    } catch (e) {
      console.error('Logout error', e);
    }
    logout();
    showToast("You're signed out.", 'info');
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
        <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-6">
            <h2 className="text-xl font-semibold">
              We Couldn&rsquo;t Load Your Profile
            </h2>
            <p className="text-sm text-text-secondary">
              {profileError.message || 'Something went wrong. Please try again.'}
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
              className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Back to Sign In
            </button>
            <button
              onClick={() => refetchProfile()}
              className="w-full py-3 border border-border text-sm font-semibold rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return <LoadingSpinner fullScreen />;
  }

  const userPhoto = currentUser.photos?.[0] || (currentUser as any).pictures?.[0];

  return (
    <div className={`app-container ${resolvedTheme === 'dark' ? 'app-theme-dark' : 'app-theme-light'} h-[100dvh] bg-bg text-text flex flex-col overflow-hidden`}>
      {/* Common Full-Width Header expanding from left to right with OneHook logo in the centre */}
      <TopBar
        activeTab={appState}
        onNavigateToChat={() => setAppState('MATCHES')}
        onNavigateToLikes={() => setAppState('LIKES')}
        onNavigateToDiscovery={() => setAppState('DISCOVERY')}
        onOpenSettings={() => setShowSettings(!showSettings)}
        premium={premium}
        userPhoto={userPhoto}
      />

      {/* Main App Body Row: Left Navigation Rail + Content Area */}
      <div className="flex-1 flex flex-row min-w-0 h-[calc(100dvh-3.5rem)] overflow-hidden relative">
        {/* Desktop Left Navigation Rail (items vertically centered in left corner) */}
        <DesktopSidebar
          activeTab={appState}
          onTabChange={setAppState}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenSettings={() => setShowSettings(!showSettings)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenCreate={() => setIsCreateOpen(true)}
        />

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          {/* Error banner */}
          {(profileError || candidatesError) && (
            <div className="px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium border-b border-red-500/20 shrink-0">
              {profileError?.message ||
                candidatesError?.message ||
                'Something went wrong. Showing cached data.'}
            </div>
          )}

          {/* Active Screen View */}
          <main className="flex-1 overflow-hidden min-h-0 bg-bg">
            <AnimatePresence mode="wait">
              {appState === 'DISCOVERY' && (
              <motion.div
                key="discovery"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <DiscoveryView
                  candidates={candidates}
                  loading={candidatesLoading}
                  error={candidatesError}
                  currentUser={currentUser}
                  onPass={handlePass}
                  onLike={handleLike}
                  onRetry={refreshCandidates}
                  onNavigateToProfile={() => setAppState('PROFILE')}
                />
              </motion.div>
            )}
            {appState === 'LIKES' && (
              <motion.div
                key="likes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <LikesYouView />
              </motion.div>
            )}
            {appState === 'MATCHES' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <ChatView
                  currentUser={currentUser}
                  userState={userState}
                  activeMatchId={activeMatchId}
                  onSelectMatch={(matchId) => setActiveMatchId(matchId)}
                  onRefetchState={async () => {
                    await refetchUserState();
                  }}
                  onNavigateToDiscovery={() => setAppState('DISCOVERY')}
                />
              </motion.div>
            )}
            {appState === 'PROFILE' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full overflow-y-auto bg-bg text-text"
              >
                <div className="max-w-[700px] mx-auto p-4 sm:p-8">
                  <ProfileView
                    user={currentUser}
                    onUpgrade={handleUpgrade}
                    upgrading={upgrading}
                    onVerified={refetchProfile}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Instagram Mobile Bottom Tab Bar */}
        <BottomTabBar
          activeTab={appState}
          onTabChange={setAppState}
          userPhoto={userPhoto}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenCreate={() => setIsCreateOpen(true)}
        />
      </div>
    </div>

      {/* Modern Instagram Sliding Search Drawer */}
      <SearchDrawer
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        candidates={candidates}
        onSelectCandidate={(candidate) => {
          setAppState('DISCOVERY');
        }}
      />

      {/* Modern Instagram Create Post / Profile Modal */}
      <CreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onNavigateToProfile={() => setAppState('PROFILE')}
      />

      {/* Connection Guard Overlay — Hooked state */}
      <AnimatePresence>
        {userState?.state === UserState.HOOKED && appState === 'DISCOVERY' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-surface-card/95 backdrop-blur-sm flex items-center justify-center p-6 text-text"
          >
            <div className="max-w-sm w-full text-center space-y-6">
              <div className="w-16 h-16 border-2 border-accent rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6 text-text" />
              </div>
              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-text">
                  You&rsquo;re Hooked
                </h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  OneHook is about one connection at a time. Discovery is paused so you can focus on
                  the person you&rsquo;re already getting to know.
                </p>
              </div>
              <button
                onClick={() => setAppState('MATCHES')}
                className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                Go to Messages
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background key recovery responder */}
      <KeyRecoveryResponder />
    </div>
  );
}
