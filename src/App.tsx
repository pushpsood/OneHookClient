import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { UserState } from './types';
import { useAppStore } from './store/app-store';
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

function OnboardedRoute({ children }: { children: ReactNode }) {
  const userState = useAppStore((state) => state.userState);
  return userState?.state === UserState.ONBOARDING ? (
    <Navigate to="/onboarding" replace />
  ) : (
    <>{children}</>
  );
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
            <Route path="/login" element={<Login />} />
            <Route path="/redeem" element={<RedeemInvite />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}
