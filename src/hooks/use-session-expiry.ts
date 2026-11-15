import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/app-store';
import { getCognitoAuth } from '../lib/cognito-auth';

/**
 * Clears a session that the API no longer accepts, so the member is sent to sign in again.
 *
 * The authoritative reads the onboarding guards depend on (`GET /state/{userId}`,
 * `GET /chat/history`) are authorised by the Cognito JWT. When that token is expired or was issued by
 * a user pool the gateway no longer trusts (for example after a backend pool rebuild), those reads
 * answer 401/403. The guards previously fail-closed an unreadable state into the onboarding flow,
 * which showed a fully onboarded member the "Finish in the App" screen. Detecting the auth failure
 * and signing the member out instead lets {@link ProtectedRoute} route them to `/login`, where a
 * fresh sign-in re-establishes a valid session.
 *
 * Clearing the local session (which flips `isAuthenticated`) is synchronous and is what drives the
 * redirect; revoking the Cognito session is fired in the background because its result does not
 * change the outcome. Runs once per mount while `expired` is true.
 */
export function useSessionExpiry(expired: boolean): void {
  const logout = useAppStore((state) => state.logout);
  const handled = useRef(false);

  useEffect(() => {
    if (!expired || handled.current) return;
    handled.current = true;
    logout();
    void getCognitoAuth()
      .logout()
      .catch(() => {
        /* Local state is already cleared; a failed remote sign-out does not change the redirect. */
      });
  }, [expired, logout]);
}
