import { sdkClient } from './sdk-client';
import type { UserStateSnapshot } from '../types';

/**
 * State service wrapper.
 *
 * Design philosophy (see OneHookBackend/packages/state): the State service owns
 * the user connection state machine (ONBOARDING -> AVAILABLE -> HOOKED ->
 * AVAILABLE) and the Match aggregate, and it is the source of truth for the
 * subscription tier.
 *
 * Two contract rules to keep in mind when editing this file:
 *
 * 1. **Identity is never sent in a body.** Every mutating route derives the caller from the
 *    verified Cognito JWT (`sub`), so `init`, `complete-onboarding` and `upgrade` are body-less
 *    and `unhook` carries only the match it releases.
 * 2. **There is no public "create hook" route.** Hooks are created exclusively by the internal
 *    `MutualMatch` event so a client cannot fabricate a connection.
 */
export const StateApi = {
  /** Initialize the caller's state record. Body-less; the tier is always seeded FREE server-side. */
  initUser: async () => {
    return (sdkClient as any).initUser({});
  },

  /** Release a match the caller participates in. */
  releaseHook: async (matchId: string, reason?: string) => {
    return (sdkClient as any).unhook({ matchId, reason });
  },

  /**
   * Body-less entitlement reconciliation. The server re-checks the billing source of truth and
   * returns the caller's freshly reconciled state — so the response is the authoritative tier.
   * Carries no tier: a client can request a re-check but can never assert the outcome.
   */
  reconcileEntitlements: async (): Promise<UserStateSnapshot> => {
    return (sdkClient as any).upgradeUser({});
  },

  completeOnboarding: async () => {
    return (sdkClient as any).completeOnboarding({});
  },

  /** Authoritative connection state + entitlement for a user (the caller may only read their own). */
  getUserState: async (userId: string): Promise<UserStateSnapshot> => {
    return (sdkClient as any).getState({ userId });
  },

  getMatch: async (matchId: string) => {
    return (sdkClient as any).getMatch({ matchId });
  },
};
