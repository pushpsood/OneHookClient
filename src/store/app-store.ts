import { create } from 'zustand';
import { DiscoveryCandidate, UserProfile, Match } from '../types';

interface AppState {
  // User state
  currentUser: UserProfile | null;
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
  isAuthenticated: false,
  isLoading: false,
  matches: [],
  activeMatch: null,
  candidates: [],
  currentCandidate: null,
  error: null,

  // Actions
  setCurrentUser: (user) => set({ currentUser: user }),

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
      isAuthenticated: false,
      matches: [],
      activeMatch: null,
      candidates: [],
      currentCandidate: null,
      error: null,
    });
  },
}));
