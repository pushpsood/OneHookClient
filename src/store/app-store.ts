import { create } from 'zustand';
import { isPaidSubscriptionTier } from 'onehook-api-client/membership';
import { DiscoveryCandidate, UserProfile, UserStateSnapshot } from '../types';
import { viewPasses } from '../lib/view-pass';

interface AppState {
  // User state
  currentUser: UserProfile | null;
  /**
   * Authoritative connection state, entitlement and matching mode from the State service
   * (`GET /state/{userId}`). This — not `currentUser` — is the source of truth for the subscription
   * tier, the hooks and whether matching is on.
   */
  userState: UserStateSnapshot | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Discovery
  candidates: DiscoveryCandidate[];
  currentCandidate: DiscoveryCandidate | null;

  /**
   * Bumped whenever hook requests may have changed (a HOOK_REQUESTED notification, an accept or a
   * decline elsewhere), so every requests view refetches.
   */
  requestsVersion: number;

  // UI state
  error: string | null;

  // Actions
  setCurrentUser: (user: UserProfile | null) => void;
  setUserState: (state: UserStateSnapshot | null) => void;
  setAuthenticated: (isAuth: boolean) => void;
  setLoading: (loading: boolean) => void;
  setCandidates: (candidates: DiscoveryCandidate[]) => void;
  setCurrentCandidate: (candidate: DiscoveryCandidate | null) => void;
  bumpRequests: () => void;
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
  candidates: [],
  currentCandidate: null,
  requestsVersion: 0,
  error: null,

  // Actions
  setCurrentUser: (user) => set({ currentUser: user }),

  setUserState: (userState) => set({ userState }),

  setAuthenticated: (isAuth) => set({ isAuthenticated: isAuth }),

  setLoading: (loading) => set({ isLoading: loading }),

  setCandidates: (candidates) => set({ candidates }),

  setCurrentCandidate: (candidate) => set({ currentCandidate: candidate }),

  bumpRequests: () => set((s) => ({ requestsVersion: s.requestsVersion + 1 })),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  logout: () => {
    localStorage.removeItem('id_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('accessToken');
    viewPasses.clear();
    set({
      currentUser: null,
      userState: null,
      isAuthenticated: false,
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
