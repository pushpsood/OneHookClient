import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { UserState } from './types';
import { useAppStore } from './store/app-store';
import { useUserState } from './hooks/use-api';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ToastProvider } from './components/common/Toast';
import { Login } from './components/auth/Login';
import { AuthSetupWizard } from './components/auth/AuthSetupWizard';
import { RedeemInvite } from './components/auth/RedeemInvite';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { Landing } from './components/Landing';
import { Privacy } from './components/legal/Privacy';
import { Terms } from './components/legal/Terms';
import { Contact } from './components/legal/Contact';
import { Careers } from './components/careers/Careers';
import { getCognitoAuth, initializeCognitoAuth } from './lib/cognito-auth';
import { config } from './utils/env.config';
import { AppContent } from './app/AppContent';

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

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/**
 * Routes that only make sense for signed-out visitors (sign in, redeem invite). If a session
 * already exists, send the user straight into the app — the nested onboarding guard on `/app`
 * still redirects to `/onboarding` when the profile isn't complete.
 */
function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  return isAuthenticated ? <Navigate to="/app" replace /> : <>{children}</>;
}

/**
 * Guards `/app` on the authoritative onboarding state from the State service.
 *
 * <p>Fail-CLOSED by design. This previously read
 * {@code userState?.state === ONBOARDING ? redirect : children}, which let a user straight into the
 * app whenever {@code userState} was null — i.e. while the state was still loading AND, critically,
 * when the user had no state record at all (State never received {@code UserRegistered}, or
 * {@code complete-onboarding} 404'd). A half-onboarded user could therefore browse discovery while
 * the backend still considered them ONBOARDING, which also silently blocks matching: the hook
 * transaction requires {@code current_state IN (AVAILABLE, HOOKED)}.
 *
 * <p>Now the app renders only when the state is KNOWN and explicitly past onboarding; an unknown or
 * missing state sends the user back to the wizard rather than into a half-working app.
 */
function OnboardedRoute({ children }: { children: ReactNode }) {
  const userState = useAppStore((state) => state.userState);
  const { loading } = useUserState();

  // Don't decide (or flash the app) until the authoritative state has been fetched.
  if (!userState && loading) {
    return <LoadingSpinner fullScreen />;
  }
  // No state record, or still ONBOARDING → the user has not completed onboarding.
  if (!userState || userState.state === UserState.ONBOARDING) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

/**
 * Guards the onboarding flow. A user who has already completed onboarding (their authoritative
 * connection state from the State service is no longer ONBOARDING) is redirected into the app, so
 * they can't re-open — and accidentally re-submit — the wizard. The authoritative state is fetched
 * if it isn't already in the store, and we wait for it before deciding to avoid flashing the wizard.
 */
function OnboardingGuard({ children }: { children: ReactNode }) {
  const userState = useAppStore((state) => state.userState);
  const { loading } = useUserState();

  if (!userState && loading) {
    return <LoadingSpinner fullScreen />;
  }
  if (userState && userState.state !== UserState.ONBOARDING) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}

export default function App() {
  const setAuthenticated = useAppStore((state) => state.setAuthenticated);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        if (config.cognitoUserPoolId) {
          const user = await getCognitoAuth().getCurrentUser();
          setAuthenticated(Boolean(user));
        }
      } catch {
        setAuthenticated(false);
      } finally {
        setIsInitializing(false);
      }
    }

    void checkAuth();
  }, [setAuthenticated]);

  if (isInitializing) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/login"
              element={
                <GuestOnlyRoute>
                  <Login />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/redeem"
              element={
                <GuestOnlyRoute>
                  <RedeemInvite />
                </GuestOnlyRoute>
              }
            />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/careers" element={<Careers />} />
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
                  <OnboardingGuard>
                    <OnboardingWizard />
                  </OnboardingGuard>
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}
