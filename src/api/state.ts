import { sdkClient } from './sdk-client';

/**
 * State service wrapper.
 *
 * Design philosophy (see OneHookBackend/packages/state): the State service owns
 * the user connection state machine (ONBOARDING -> AVAILABLE -> HOOKED ->
 * AVAILABLE) and the Match aggregate. A "hook" is an atomic mutual connection;
 * creating one can fail with 409 when either user is at their connection limit.
 * complete-onboarding transitions ONBOARDING -> AVAILABLE after profile setup.
 */
export const StateApi = {
  initUser: async (userId: string, subscriptionTier?: string) => {
    return sdkClient.initUser({ userId, subscriptionTier });
  },

  createHook: async (userA: string, userB: string) => {
    return sdkClient.hook({ userA, userB });
  },

  releaseHook: async (userId: string, matchId: string, reason?: string) => {
    return sdkClient.unhook({ userId, matchId, reason });
  },

  updateMaxConnections: async (userId: string, maxConnections: number) => {
    return sdkClient.updateMaxConnections({ userId, maxConnections });
  },

  upgradeUser: async (userId: string, subscriptionTier: string) => {
    return sdkClient.upgradeUser({ userId, subscriptionTier });
  },

  completeOnboarding: async (userId: string) => {
    return sdkClient.completeOnboarding({ userId });
  },

  getUserState: async (userId: string) => {
    return sdkClient.getState({ userId });
  },

  getMatch: async (matchId: string) => {
    return sdkClient.getMatch({ matchId });
  },
};
