import { create } from 'zustand';
import { isPaidSubscriptionTier } from 'onehook-api-client/membership';
import { DiscoveryCandidate, UserProfile, Match, UserStateSnapshot } from '../types';

interface AppState {
  // User state
  currentUser: UserProfile | null;
  /**
   * Authoritative connection state + entitlement from the State service
   * (`GET /state/{userId}`). This — not `currentUser` — is the source of truth for the
   * subscription tier, because the Profile read model intentionally omits it.
   */
  userState: UserStateSnapshot | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Matches
  matches: Match[];
  activeMatch: Match | null;

  // Discovery
  candidates: DiscoveryCandidate[];
  currentCandidate: DiscoveryCandidate | null;

  // UI state
  error: string | null;

  // Actions
  setCurrentUser: (user: UserProfile | null) => void;
  setUserState: (state: UserStateSnapshot | null) => void;
  setAuthenticated: (isAuth: boolean) => void;
  setLoading: (loading: boolean) => void;
  setMatches: (matches: Match[]) => void;
  setActiveMatch: (match: Match | null) => void;
  setCandidates: (candidates: DiscoveryCandidate[]) => void;
  setCurrentCandidate: (candidate: DiscoveryCandidate | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentUser: null,
  userState: null,
  isAuthenticated: false,
  isLoading: false,
  matches: [],
  activeMatch: null,
  candidates: [],
  currentCandidate: null,
  error: null,

  // Actions
  setCurrentUser: (user) => set({ currentUser: user }),

  setUserState: (userState) => set({ userState }),

  setAuthenticated: (isAuth) => set({ isAuthenticated: isAuth }),

  setLoading: (loading) => set({ isLoading: loading }),

  setMatches: (matches) => set({ matches }),

  setActiveMatch: (match) => set({ activeMatch: match }),

  setCandidates: (candidates) => set({ candidates }),

  setCurrentCandidate: (candidate) => set({ currentCandidate: candidate }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  logout: () => {
    localStorage.removeItem('id_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('accessToken');
    set({
      currentUser: null,
      userState: null,
      isAuthenticated: false,
      matches: [],
      activeMatch: null,
      candidates: [],
      currentCandidate: null,
      error: null,
    });
  },
}));

/**
 * Whether the caller is on a paid tier (Super / Infinity), derived from the authoritative State
 * snapshot via the backend-owned membership catalogue in onehook-api-client.
 *
 * <p>Returns `false` until the snapshot has loaded, so the UI fails closed (shows the free tier)
 * rather than briefly promising a paid tier. This is a presentation decision only — the server
 * independently enforces entitlement on every paid-tier operation.</p>
 */
export function isPaidTier(state: Pick<AppState, 'userState'>): boolean {
  return isPaidSubscriptionTier(state.userState?.subscriptionTier);
}
