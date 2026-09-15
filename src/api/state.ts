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

  /**
   * Body-less onboarding completion, with a bounded retry for the one transient failure it has.
   *
   * The server refuses with **409** while the caller's PORTABLE sign-in credentials are not yet live
   * in Cognito — the username → `preferred_username` mirror is applied asynchronously, so finishing
   * the wizard within a second of registering can outrun it. The server repairs that in place, so a
   * retry moments later normally succeeds.
   *
   * Retried here rather than surfaced immediately because it is not a user error and there is nothing
   * for them to fix — showing a failure would be noise. Only 409 is retried: a 409 elsewhere in State
   * can mean "this match is gone", which is NOT retryable, so the narrow scope matters. If it still
   * fails the error propagates and the wizard explains the next step instead of dead-ending.
   */
  completeOnboarding: async () => {
    const RETRY_DELAYS_MS = [800, 2000, 4000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await (sdkClient as any).completeOnboarding({});
      } catch (err: any) {
        const status = err?.status ?? err?.$metadata?.httpStatusCode;
        if (status !== 409 || attempt >= RETRY_DELAYS_MS.length) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  },

  /** Authoritative connection state + entitlement for a user (the caller may only read their own). */
  getUserState: async (userId: string): Promise<UserStateSnapshot> => {
    return (sdkClient as any).getState({ userId });
  },

  getMatch: async (matchId: string) => {
    return (sdkClient as any).getMatch({ matchId });
  },
};
