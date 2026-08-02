import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MapPin, Lock, LogOut, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import {
  UserState,
  SubscriptionTier,
  UserProfile,
  DiscoveryCandidate,
  ChatMessageDTO,
  UserPreferences,
} from './types';
import { useAppStore } from './store/app-store';
import {
  useProfile,
  useCandidates,
  useSwipe,
  useChatMessages,
  usePreferences,
} from './hooks/use-api';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ToastProvider, useToast } from './components/common/Toast';
import { ApiError } from './lib/api-client';
import { Login } from './components/auth/Login';
import { AuthSetupWizard } from './components/auth/AuthSetupWizard';
import { RedeemInvite } from './components/auth/RedeemInvite';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { Landing } from './components/Landing';
import { Privacy } from './components/legal/Privacy';
import { Terms } from './components/legal/Terms';
import { Contact } from './components/legal/Contact';
import { Careers } from './components/careers/Careers';
import { BrandWordmark } from './components/common/BrandWordmark';
import { initializeCognitoAuth } from './lib/cognito-auth';
import { config } from './utils/env.config';
import { ProfileApi } from './api/profile';
import { StateApi } from './api/state';
import { SetPasswordCard } from './components/profile/SetPasswordCard';

// Verification (and the heavy Amplify Liveness SDK behind it) is code-split so
// it is only fetched when a signed-in member opens the profile / Membership tab.
const LivenessVerification = lazy(() =>
  import('./components/profile/LivenessVerification').then((m) => ({
    default: m.LivenessVerification,
  }))
);

const FALLBACK_PROFILE_IMAGE =
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=75&w=480';

const PROFILE_IMAGE_WIDTH = 480;

function getOptimizedProfileImageSrc(src?: string | null) {
  if (!src) return FALLBACK_PROFILE_IMAGE;

  try {
    const url = new URL(src);

    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('q', '75');
      url.searchParams.set('w', String(PROFILE_IMAGE_WIDTH));
      return url.toString();
    }

    if (url.hostname === 'picsum.photos') {
      url.pathname = url.pathname.replace(/\/\d+\/\d+$/, '/320/320');
      return url.toString();
    }

    return src;
  } catch {
    if (src.includes('images.unsplash.com')) {
      return src.replace(/w=\d+/g, `w=${PROFILE_IMAGE_WIDTH}`).replace(/q=\d+/g, 'q=75');
    }

    if (src.includes('picsum.photos')) {
      return src.replace(/\/\d+\/\d+$/, '/320/320');
    }

    return src;
  }
}

// TEMPORARY: Cognito init disabled for static site launch (no backend)
/*
// Initialize Cognito Auth on app load
if (config.cognitoUserPoolId && config.cognitoClientId) {
  initializeCognitoAuth({
    userPoolId: config.cognitoUserPoolId,
    clientId: config.cognitoClientId,
    identityPoolId: config.cognitoIdentityPoolId,
    region: config.cognitoRegion,
    endpoint: config.cognitoEndpoint,
    cognitoDomain: config.cognitoDomain,
    cognitoRedirectSignIn: config.cognitoRedirectSignIn,
    cognitoRedirectSignOut: config.cognitoRedirectSignOut,
    graphqlEndpoint: config.graphqlUrl,
  });
}
*/

import { upgradeSubscription } from './lib/api-client';
import { getCognitoAuth } from './lib/cognito-auth';

// Protected route wrapper — redirects unauthenticated users to login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAppStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Redirects users still in onboarding to the wizard before app access
function OnboardedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppStore();

  if (currentUser?.currentState === UserState.ONBOARDING) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const navigate = useNavigate();
  const [appState, setAppState] = useState<'DISCOVERY' | 'CHAT' | 'PROFILE'>('DISCOVERY');
  const { currentUser, setCurrentUser, logout } = useAppStore();
  const { profile, loading: profileLoading, error: profileError, refetch: refetchProfile } = useProfile();
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async () => {
    if (!currentUser) return;
    setUpgrading(true);
    try {
      await upgradeSubscription(currentUser.id, 'GOLD');
      const auth = getCognitoAuth();
      await auth.refreshAccessToken();
      await refetchProfile();
      showToast('Upgraded to Premium successfully! 🎉', 'success');
    } catch (error) {
      console.error('Upgrade failed:', error);
      showToast('Failed to upgrade membership.', 'error');
    } finally {
      setUpgrading(false);
    }
  };

  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
    refresh: refreshCandidates,
  } = useCandidates();
  const { swipe, loading: swipeLoading } = useSwipe();
  const { showToast } = useToast();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setCurrentUser(profile);
    }
  }, [profile, setCurrentUser]);

  useEffect(() => {
    if (currentUser?.currentState === UserState.ONBOARDING) {
      navigate('/onboarding', { replace: true });
    }
  }, [currentUser?.currentState, navigate]);

  useEffect(() => {
    if (!activeMatchId && currentUser?.currentMatches?.length) {
      setActiveMatchId(currentUser.currentMatches[0]);
    }
  }, [activeMatchId, currentUser]);

  const handleSwipe = async (targetId: string, direction: 'LEFT' | 'RIGHT') => {
    try {
      const result = await swipe(targetId, direction);

      if (result.matched) {
        showToast("It's a match! 🎉", 'success');
        setActiveMatchId(result.matchId || null);
        setAppState('CHAT');
      } else if (direction === 'RIGHT') {
        showToast('Swipe sent. Waiting for response...', 'info');
      }

      refreshCandidates();
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      } else {
        showToast('Unable to register swipe right now.', 'error');
      }

      return false;
    }
  };

  const handleLogout = () => {
    logout();
    showToast('Logged out successfully', 'info');
    navigate('/', { replace: true });
  };

  if (profileLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!currentUser) {
    if (profileError) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-accent p-12 text-center space-y-8">
            <h2 className="text-4xl font-serif italic uppercase tracking-tighter text-red-600">
              Connection Error
            </h2>
            <p className="text-xs opacity-60 leading-relaxed italic text-red-500">
              {profileError.message || 'Failed to fetch user profile.'}
            </p>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
            >
              Return to Login
            </button>
            <button
              onClick={() => refetchProfile()}
              className="w-full py-4 mt-4 border border-accent text-accent text-[10px] uppercase tracking-[0.3em] font-black hover:bg-bg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    
    // If no error, we are in the middle of a state update.
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent selection:text-white flex flex-col border-t-4 border-accent">
      {(profileError || candidatesError) && (
        <div className="px-10 py-3 bg-red-50 text-red-700 text-[10px] uppercase tracking-[0.2em] font-bold border-b border-red-100">
          {profileError?.message ||
            candidatesError?.message ||
            'Unable to load live data. Showing the current client state.'}
        </div>
      )}

      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between px-10 h-20 border-b border-border bg-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <BrandWordmark className="text-xl font-bold tracking-tighter uppercase" />
          <span className="text-[10px] px-2 py-0.5 bg-accent text-white rounded-full tracking-widest font-bold">
            {currentUser.subscriptionTier === SubscriptionTier.FREE ? 'BASIC' : 'PREMIUM'}
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
            onClick={() => setAppState('CHAT')}
            className={`hover:opacity-100 transition-opacity ${appState === 'CHAT' ? 'opacity-100 border-b-2 border-accent pb-1' : 'opacity-40'}`}
          >
            Matches
          </button>
          <button
            onClick={() => setAppState('PROFILE')}
            className={`hover:opacity-100 transition-opacity ${appState === 'PROFILE' ? 'opacity-100 border-b-2 border-accent pb-1' : 'opacity-40'}`}
          >
            Membership
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
          <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center border border-border overflow-hidden">
            <img
              src={getOptimizedProfileImageSrc(currentUser.photos?.[0])}
              alt="Me"
              loading="eager"
              decoding="async"
              className="w-full h-full object-cover grayscale"
            />
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {appState === 'DISCOVERY' && (
            <DiscoveryView
              key="discovery"
              candidates={candidates}
              loading={candidatesLoading || swipeLoading}
              error={candidatesError}
              onSwipe={handleSwipe}
              onRetry={refreshCandidates}
            />
          )}
          {appState === 'CHAT' && (
            <ChatView key="chat" currentUser={currentUser} matchId={activeMatchId} />
          )}
          {appState === 'PROFILE' && <ProfileView key="profile" user={currentUser} onUpgrade={handleUpgrade} upgrading={upgrading} onVerified={refetchProfile} />}
        </AnimatePresence>
      </main>

      {/* Connection Guard Overlay */}
      <AnimatePresence>
        {currentUser.currentState === UserState.HOOKED && appState === 'DISCOVERY' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-white/90 backdrop-blur-sm flex items-center justify-center p-8"
          >
            <div className="max-w-md w-full border border-accent p-12 text-center space-y-8 bg-white">
              <div className="w-16 h-16 border-2 border-accent rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
                  Connection Active
                </h2>
                <p className="text-xs opacity-60 leading-relaxed italic">
                  OneHook rules mandate absolute focus. Swiping is disabled to protect the intention
                  of your current connection.
                </p>
              </div>
              <button
                onClick={() => setAppState('CHAT')}
                className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
              >
                Return to Match
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Resets scroll to the top on route changes (so navigating from a footer link
// at the bottom of a page lands you at the top of the next page). Skips when a
// hash is present so in-page section anchors still work.
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/redeem" element={<RedeemInvite />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/careers" element={<Careers />} />

            {/* Protected Routes */}
            <Route
              path="/auth/setup"
              element={
                <ProtectedRoute>
                  <AuthSetupWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <OnboardedRoute>
                    <AppContent />
                  </OnboardedRoute>
                </ProtectedRoute>
              }
            />

            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}

function DiscoveryView({
  candidates,
  loading,
  error,
  onRetry,
  onSwipe,
}: {
  key?: string;
  candidates: DiscoveryCandidate[];
  loading: boolean;
  error?: ApiError | null;
  onRetry: () => void;
  onSwipe: (targetId: string, direction: 'LEFT' | 'RIGHT') => Promise<boolean>;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const safeIndex = Math.min(currentIndex, Math.max(candidates.length - 1, 0));
  const currentCandidate = candidates[safeIndex];

  const handleSwipe = async (direction: 'LEFT' | 'RIGHT') => {
    if (!currentCandidate) return;
    const swiped = await onSwipe(currentCandidate.id, direction);
    if (swiped) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9]"
      >
        <LoadingSpinner size="lg" />
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
            Discovery Offline
          </h2>
          <p className="text-xs opacity-60 leading-relaxed italic">{error.message}</p>
          <button
            onClick={onRetry}
            className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-colors"
          >
            Retry Fetch
          </button>
        </div>
      </motion.div>
    );
  }

  if (!currentCandidate) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
            No More Candidates
          </h2>
          <p className="text-xs opacity-60 leading-relaxed italic">
            Check back later for new connections.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12 overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white border border-border flex flex-col shadow-sm">
        <div className="relative aspect-[4/5] overflow-hidden group">
          <img
            src={getOptimizedProfileImageSrc(currentCandidate.photos?.[0])}
            alt={currentCandidate.name}
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover grayscale transition-all duration-1000 group-hover:grayscale-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-40"></div>

          <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
            {currentCandidate.verified && (
              <div className="px-3 py-1 bg-white border border-accent text-[9px] font-bold uppercase tracking-widest">
                Verified
              </div>
            )}
            {currentCandidate.distance && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-border text-[9px] font-bold uppercase tracking-widest opacity-60 italic">
                <MapPin className="w-2.5 h-2.5" /> {currentCandidate.distance} km
              </div>
            )}
          </div>
        </div>

        <div className="p-10 space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
              {currentCandidate.name}
            </h2>
            <span className="text-sm opacity-40 italic">
              {currentCandidate.age > 0 ? `${currentCandidate.age}, ` : ''}
              {currentCandidate.location}
            </span>
          </div>
          <p className="text-sm opacity-70 leading-relaxed font-sans">{currentCandidate.bio}</p>
          {currentCandidate.interests && currentCandidate.interests.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {currentCandidate.interests.map((interest: string, i: number) => (
                <span
                  key={i}
                  className="px-3 py-1 border border-border text-[9px] uppercase tracking-[0.15em] font-bold opacity-50"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}

          <div className="pt-8 flex gap-4">
            <button
              onClick={() => handleSwipe('LEFT')}
              className="flex-1 py-4 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => handleSwipe('RIGHT')}
              className="flex-1 py-4 bg-accent text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Heart className="w-3.5 h-3.5" /> Hook
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ChatView({
  currentUser,
  matchId,
}: {
  key?: string;
  currentUser: UserProfile;
  matchId: string | null;
}) {
  const [recipientId, setRecipientId] = useState<string | undefined>(undefined);

  // Resolve the peer (the other participant) from the match record so we can
  // establish an E2EE session with them when sending messages.
  useEffect(() => {
    if (!matchId) {
      setRecipientId(undefined);
      return;
    }
    let active = true;
    StateApi.getMatch(matchId)
      .then((match) => {
        if (!active) return;
        const peer = match.userA === currentUser.id ? match.userB : match.userA;
        setRecipientId(peer ?? undefined);
      })
      .catch(() => {
        /* peer resolution is best-effort; sending stays disabled until known */
      });
    return () => {
      active = false;
    };
  }, [matchId, currentUser.id]);

  const { messages, loading, error, sendMessage, markAsDelivered, markAsRead } = useChatMessages(
    matchId || '',
    recipientId
  );
  const [input, setInput] = useState('');
  const { showToast } = useToast();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as delivered when they appear
  useEffect(() => {
    messages
      .filter((m) => m.senderId !== 'me' && m.status === 'SENT')
      .forEach((m) => markAsDelivered(m.messageId));
  }, [messages, markAsDelivered]);

  // Mark messages as read when user is viewing
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
      case 'SENDING':
        return <span className="text-[8px] opacity-30">⏱</span>;
      case 'SENT':
        return <span className="text-[8px] opacity-50">✓</span>;
      case 'DELIVERED':
        return <span className="text-[8px] opacity-70">✓✓</span>;
      case 'READ':
        return <span className="text-[8px] text-blue-500">✓✓</span>;
      case 'FAILED':
        return <span className="text-[8px] text-red-500">✗</span>;
      default:
        return null;
    }
  };

  if (!matchId) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">No Active Match</h2>
          <p className="text-xs opacity-60 leading-relaxed italic">
            Start swiping to find your connection.
          </p>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center"
      >
        <LoadingSpinner size="lg" />
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
            Conversation Unavailable
          </h2>
          <p className="text-xs opacity-60 leading-relaxed italic">{error.message}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex overflow-hidden"
    >
      {/* Profile Panel */}
      <section className="w-[420px] border-r border-border flex flex-col bg-bg">
        <div className="p-10 flex-1 overflow-y-auto">
          <div className="relative mb-8">
            <div className="aspect-[3/4] w-full bg-border overflow-hidden grayscale grayscale-hover">
              <img
                src={currentUser.photos?.[0] || FALLBACK_PROFILE_IMAGE}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white p-5 border border-accent">
              <div className="text-[9px] uppercase tracking-widest opacity-40 mb-1 font-bold">
                Connection Status
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-status-hooked animate-pulse"></div>
                <span className="text-xs font-black uppercase tracking-widest">Hooked</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-3xl font-serif italic">Match</h2>
              <span className="text-sm opacity-40 italic">Active</span>
            </div>
            <p className="text-xs leading-relaxed opacity-60">
              Your connection is active. Focus on building something meaningful.
            </p>
          </div>
        </div>

        <div className="p-10 border-t border-border bg-[#F9F9F9]">
          <div className="text-[10px] uppercase tracking-[0.2em] mb-4 text-accent font-black">
            Constraints Active
          </div>
          <p className="text-[10px] opacity-50 leading-relaxed mb-6 italic">
            Discovery queue suspended. Absolute focus mode engaged. Privacy secured via E2EE.
          </p>
        </div>
      </section>

      {/* Chat Panel */}
      <section className="flex-1 flex flex-col bg-white">
        {/* Chat Header */}
        <div className="px-10 py-8 border-b border-border flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-black uppercase tracking-[0.2em]">Private Thread</div>
            <div className="text-[9px] opacity-30 uppercase tracking-widest font-mono">
              End-to-End Encrypted
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-[9px] opacity-30 uppercase tracking-widest">Match ID</div>
            <div className="text-xs font-bold font-mono">{matchId.substring(0, 8)}</div>
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 p-10 space-y-8 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs opacity-40 italic">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.messageId} className={`max-w-md ${m.senderId === 'me' ? 'ml-auto' : ''}`}>
                <div
                  className={`text-[9px] uppercase tracking-widest opacity-40 mb-2 flex items-center gap-2 ${
                    m.senderId === 'me' ? 'justify-end' : ''
                  }`}
                >
                  <span>{m.senderId === 'me' ? 'You' : 'Them'}</span>
                  {getMessageStatusIcon(m)}
                </div>
                <div
                  className={`p-6 text-sm leading-relaxed relative ${
                    m.senderId === 'me'
                      ? 'bg-accent text-white shadow-xl shadow-accent/5'
                      : 'bg-[#F2F2F2] text-accent'
                  }`}
                >
                  {m.ciphertext}
                  {m.status === 'FAILED' && (
                    <div className="mt-2 text-[10px] text-red-300 flex items-center gap-1">
                      <span>Failed to send</span>
                      <button
                        onClick={() => sendMessage(m.ciphertext)}
                        className="underline hover:opacity-70"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="p-10 border-t border-border">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              type="text"
              placeholder="Write with intent..."
              className="w-full py-4 px-0 border-b border-accent focus:border-b-2 transition-all outline-none text-sm bg-transparent placeholder:opacity-30 italic font-serif"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute right-0 bottom-4 text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-50 transition-opacity disabled:opacity-20"
            >
              Send
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between text-[8px] opacity-20 uppercase tracking-[0.3em] font-mono">
            <span>State: Connected</span>
            <span>Single-Threaded Mode</span>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function ProfileView({ user, onUpgrade, upgrading, onVerified }: { key?: string; user: UserProfile; onUpgrade?: () => void; upgrading?: boolean; onVerified?: () => void }) {
  const { showToast } = useToast();
  const { prefs, save: savePreferences, saving } = usePreferences(user.id);
  const [savingProfile, setSavingProfile] = useState(false);
  const [basic, setBasic] = useState({
    displayName: user.displayName || user.name || '',
    bio: user.bio || '',
    age: String(user.age || ''),
    gender: user.gender || '',
    interestedInGenders: (prefs?.genders || user.interestedIn || []).join(', '),
  });
  const [optional, setOptional] = useState({
    maxDistanceKm: String(prefs?.maxDistanceKm || ''),
    minAge: String(prefs?.minAge || ''),
    maxAge: String(prefs?.maxAge || ''),
    relationshipType: user.relationshipType || '',
    wantsKids: user.wantsKids || '',
    familyPlans: user.familyPlans || '',
    smoking: user.smokingStatus || '',
    drinking: user.drinkingStatus || '',
    cannabis: user.cannabisStatus || '',
    drugs: user.drugsStatus || '',
    religion: user.religion || '',
    interests: (user.interests || []).join(', '),
    starSign: user.starSign || '',
  });

  useEffect(() => {
    setBasic((prev) => ({
      ...prev,
      interestedInGenders: (prefs?.genders || user.interestedIn || []).join(', '),
    }));
    setOptional((prev) => ({
      ...prev,
      maxDistanceKm: String(prefs?.maxDistanceKm || ''),
      minAge: String(prefs?.minAge || ''),
      maxAge: String(prefs?.maxAge || ''),
      relationshipType: user.relationshipType || '',
      wantsKids: user.wantsKids || '',
      familyPlans: user.familyPlans || '',
      smoking: user.smokingStatus || '',
      drinking: user.drinkingStatus || '',
      cannabis: user.cannabisStatus || '',
      drugs: user.drugsStatus || '',
      religion: user.religion || '',
      interests: (user.interests || []).join(', '),
      starSign: user.starSign || '',
    }));
  }, [prefs, user]);

  const csv = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const numberOrUndefined = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const handleSaveMatchingDetails = async () => {
    try {
      setSavingProfile(true);
      const interests = csv(optional.interests);

      // Lifestyle / relationship attributes are PROFILE fields.
      await ProfileApi.upsert(user.id, {
        displayName: basic.displayName,
        bio: basic.bio,
        age: numberOrUndefined(basic.age) || 18,
        gender: basic.gender,
        relationshipType: optional.relationshipType || undefined,
        wantsKids: optional.wantsKids || undefined,
        familyPlans: optional.familyPlans || undefined,
        smokingStatus: optional.smoking || undefined,
        drinkingStatus: optional.drinking || undefined,
        cannabisStatus: optional.cannabis || undefined,
        drugsStatus: optional.drugs || undefined,
        religion: optional.religion || undefined,
        starSign: optional.starSign || undefined,
        interests,
      });

      // Matching preferences are limited to age range, distance, and genders.
      await savePreferences({
        maxDistanceKm: numberOrUndefined(optional.maxDistanceKm),
        minAge: numberOrUndefined(optional.minAge),
        maxAge: numberOrUndefined(optional.maxAge),
        genders: csv(basic.interestedInGenders),
      });

      showToast('Matching details saved', 'success');
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Unable to save matching details', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const optionalCount = [
    optional.maxDistanceKm,
    optional.minAge,
    optional.maxAge,
    optional.relationshipType,
    optional.wantsKids,
    optional.familyPlans,
    optional.smoking,
    optional.drinking,
    optional.cannabis,
    optional.drugs,
    optional.religion,
    optional.interests,
    optional.starSign,
  ].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 p-12 bg-[#F9F9F9] overflow-y-auto"
    >
      <div className="max-w-6xl mx-auto bg-white border border-border p-12 space-y-12 shadow-sm">
        <div className="flex items-center gap-16">
          <div className="relative">
            <div className="w-56 h-56 bg-border overflow-hidden grayscale border-4 border-white shadow-xl">
              <img
                src={getOptimizedProfileImageSrc(user.photos?.[0])}
                alt="Me"
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-accent text-white px-6 py-3 text-[11px] font-black uppercase tracking-[0.3em] shadow-xl">
              LEVEL 12
            </div>
          </div>
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="text-6xl font-serif italic tracking-tighter uppercase">{user.name}</h2>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-accent font-black uppercase tracking-[0.4em]">
                  {user.subscriptionTier}
                </span>
                {user.verified && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-border"></span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-accent font-black uppercase tracking-[0.3em]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  </>
                )}
                <span className="w-1.5 h-1.5 rounded-full bg-border"></span>
                <span className="text-[11px] opacity-30 font-bold uppercase tracking-widest italic">
                  {user.birthDate}
                </span>
              </div>
            </div>
            <p className="text-base opacity-60 leading-relaxed font-serif max-w-sm italic border-l-2 border-border pl-6">
              "{user.bio}"
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 py-8 border-y border-border">
          <div className="space-y-3">
            <div className="text-[11px] uppercase font-black opacity-20 tracking-[0.4em]">
              Basic Fields
            </div>
            <div className="text-4xl font-serif italic text-accent tracking-tighter">
              {[basic.displayName, basic.age, basic.gender].filter(Boolean).length}/3
            </div>
          </div>
          <div className="space-y-3 border-x border-border px-8">
            <div className="text-[11px] uppercase font-black opacity-20 tracking-[0.4em]">
              Optional Signals
            </div>
            <div className="text-4xl font-serif italic text-accent tracking-tighter">{optionalCount}</div>
          </div>
          <div className="space-y-3 text-right">
            <div className="text-[11px] uppercase font-black opacity-20 tracking-[0.4em]">
              Moderation
            </div>
            <div className="text-4xl font-serif italic text-accent tracking-tighter">
              {(user.moderationStatus || 'APPROVED').toLowerCase()}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10">
          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
                Basic Onboarding
              </div>
              <p className="mt-2 text-xs opacity-50 leading-relaxed">
                Name, age, gender, and who you want to meet are enough to start. Optional details
                make matching more precise.
              </p>
            </div>
            <Field label="Display name">
              <input
                value={basic.displayName}
                onChange={(e) => setBasic((prev) => ({ ...prev, displayName: e.target.value }))}
                className="field-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Age">
                <input
                  value={basic.age}
                  type="number"
                  min="18"
                  onChange={(e) => setBasic((prev) => ({ ...prev, age: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Gender">
                <input
                  value={basic.gender}
                  onChange={(e) => setBasic((prev) => ({ ...prev, gender: e.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>
            <Field label="Interested in">
              <input
                value={basic.interestedInGenders}
                onChange={(e) =>
                  setBasic((prev) => ({ ...prev, interestedInGenders: e.target.value }))
                }
                placeholder="Women, Men"
                className="field-input"
              />
            </Field>
            <Field label="Bio">
              <textarea
                value={basic.bio}
                onChange={(e) => setBasic((prev) => ({ ...prev, bio: e.target.value }))}
                className="field-input min-h-28 resize-none"
              />
            </Field>
          </section>

          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Optional Precision
              </div>
              <p className="mt-2 text-xs opacity-50 leading-relaxed">
                Distance and age range are matching preferences. Lifestyle details are profile
                signals that improve ranking.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Distance km">
                <input
                  value={optional.maxDistanceKm}
                  type="number"
                  min="1"
                  onChange={(e) => setOptional((prev) => ({ ...prev, maxDistanceKm: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Min age">
                <input
                  value={optional.minAge}
                  type="number"
                  min="18"
                  onChange={(e) => setOptional((prev) => ({ ...prev, minAge: e.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Max age">
                <input
                  value={optional.maxAge}
                  type="number"
                  min="18"
                  onChange={(e) => setOptional((prev) => ({ ...prev, maxAge: e.target.value }))}
                  className="field-input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Relationship">
                <select
                  value={optional.relationshipType}
                  onChange={(e) =>
                    setOptional((prev) => ({ ...prev, relationshipType: e.target.value }))
                  }
                  className="field-input"
                >
                  <option value="">Open</option>
                  <option value="CASUAL">Casual</option>
                  <option value="SERIOUS">Serious</option>
                  <option value="FRIENDSHIP">Friendship</option>
                </select>
              </Field>
              <Field label="Kids">
                <select
                  value={optional.wantsKids}
                  onChange={(e) => setOptional((prev) => ({ ...prev, wantsKids: e.target.value }))}
                  className="field-input"
                >
                  <option value="">Open</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                  <option value="OPEN">Flexible</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['familyPlans', 'smoking', 'drinking', 'cannabis', 'drugs', 'religion'] as const).map(
                (key) => (
                  <div key={key}>
                    <Field label={key.replace(/[A-Z]/g, ' $&')}>
                      <input
                        value={optional[key]}
                        onChange={(e) =>
                          setOptional((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="field-input"
                      />
                    </Field>
                  </div>
                )
              )}
            </div>
            <Field label="Interests">
              <input
                value={optional.interests}
                onChange={(e) => setOptional((prev) => ({ ...prev, interests: e.target.value }))}
                placeholder="Design, jazz, climbing"
                className="field-input"
              />
            </Field>
            <Field label="Star sign">
              <input
                value={optional.starSign}
                onChange={(e) => setOptional((prev) => ({ ...prev, starSign: e.target.value }))}
                placeholder="Virgo"
                className="field-input"
              />
            </Field>
          </section>
        </div>

        {user.subscriptionTier === SubscriptionTier.FREE && (
          <div className="bg-accent/5 border border-accent/20 p-8 space-y-4">
            <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
              Premium Features Locked
            </div>
            <p className="text-xs opacity-60 leading-relaxed max-w-xl">
              Unlock message read receipts, delivery confirmations, and the ability to delete chat threads for everyone. Get more concurrent connections too.
            </p>
            <button
              onClick={onUpgrade}
              disabled={upgrading}
              className="w-full py-4 bg-accent text-white text-[11px] font-black uppercase tracking-[0.4em] hover:scale-[1.01] transition-all disabled:opacity-40"
            >
              {upgrading ? 'Upgrading...' : 'Upgrade to Premium Membership'}
            </button>
          </div>
        )}

        <div className="flex gap-8">
          <button
            onClick={handleSaveMatchingDetails}
            disabled={savingProfile || saving}
            className="flex-1 py-5 bg-accent text-white text-[11px] font-black uppercase tracking-[0.4em] hover:scale-[1.02] shadow-2xl transition-all disabled:opacity-40"
          >
            {savingProfile || saving ? 'Saving' : 'Save Matching Details'}
          </button>
          <button className="flex-1 py-5 border border-border text-[11px] font-black uppercase tracking-[0.4em] hover:bg-bg transition-all">
            Invite New Member
          </button>
        </div>

        <SetPasswordCard />

        <Suspense fallback={null}>
          <LivenessVerification verified={Boolean(user.verified)} onVerified={onVerified} />
        </Suspense>

        <div className="text-center opacity-10 mt-12">
          <span className="text-[10px] uppercase tracking-[0.8em] font-mono">
            EST. 2024 • Verified Identity Protocol Enabled
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-40">
        {label}
      </span>
      {children}
    </label>
  );
}