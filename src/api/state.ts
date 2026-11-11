import { sdkClient } from './sdk-client';
import {
  UserState,
  type Hook,
  type HookRequestItem,
  type UserStateResponse,
  type UserStateSnapshot,
} from '../types';
import type { BlockReason, ReportCategory, ReportMemberResponse, SubscriptionTier } from 'onehook-api-client';
import { DEFAULT_SUBSCRIPTION_TIER } from 'onehook-api-client/membership';
import { viewPasses } from '../lib/view-pass';
import { errorCode, errorStatus } from '../lib/api-errors';

/**
 * State service wrapper.
 *
 * Design (OneHookBackend/docs/chat-only-profiles.md): State is the source of truth for every
 * relationship fact — hooks (discovery and request origins), hook requests, capacity, the downgrade
 * selection and suspension, blocks, reports and the matching mode. It also signs the chat-profile
 * view passes. Everything here works for a chat-only member; nothing here touches Matching.
 *
 * Contract rules to keep in mind when editing this file:
 *
 * 1. **Identity is never sent in a body.** Every mutating route derives the caller from the verified
 *    Cognito JWT (`sub`).
 * 2. **A request hook needs the recipient's accept.** `sendHookRequest` always answers REQUEST_SENT
 *    once the caller may send, whatever happened to the request, so callers MUST show one constant
 *    confirmation ({@link HOOK_REQUEST_SENT_CONFIRMATION}) and never branch on the result.
 */

/** The phrase State requires to turn matching off (`MatchingModeService.DISABLE_CONFIRMATION`). */
export const DISABLE_MATCHING_CONFIRMATION = 'ERASE_MATCHING';

/**
 * The ONLY confirmation copy allowed after sending a hook request. Identical for every outcome so the
 * flow never reveals whether a username exists, is full, is blocked or declined.
 */
export const HOOK_REQUEST_SENT_CONFIRMATION = "Request sent. If they accept, you'll be connected.";

/** State signs view passes with KMS; a failed signature answers 503 VIEW_PASS_UNAVAILABLE (retry). */
const VIEW_PASS_RETRY_DELAYS_MS = [400, 1200];

async function withViewPassRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const retryable = errorStatus(err) === 503 && errorCode(err) === 'VIEW_PASS_UNAVAILABLE';
      if (!retryable || attempt >= VIEW_PASS_RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, VIEW_PASS_RETRY_DELAYS_MS[attempt]));
    }
  }
}

const KNOWN_STATES = new Set<string>(Object.values(UserState));

/**
 * Normalises `GET /state/{userId}` (and `POST /state/hooks/keep`, which answers the same shape).
 * Absent fields take State's documented defaults: matching absent = OFF; paused = at capacity.
 */
export function toUserStateSnapshot(res: UserStateResponse): UserStateSnapshot {
  const hooks: Hook[] = (res.hooks ?? [])
    .filter((h) => h?.matchId && h?.peerId)
    .map((h) => ({
      matchId: h.matchId as string,
      peerId: h.peerId as string,
      origin: (h.origin ?? 'DISCOVERY') as Hook['origin'],
      hookedAt: Number(h.hookedAt ?? 0),
      suspended: Boolean(h.suspended),
    }));
  const activeConnections = Number(res.activeConnections ?? hooks.length);
  const effectiveCapacity = Number(res.effectiveCapacity ?? 1);
  const state = KNOWN_STATES.has(String(res.state)) ? (res.state as UserState) : UserState.ONBOARDING;
  return {
    userId: String(res.userId ?? ''),
    state,
    activeConnections,
    subscriptionTier: (res.subscriptionTier ?? DEFAULT_SUBSCRIPTION_TIER) as SubscriptionTier,
    hooks,
    effectiveCapacity,
    discoveryPaused: res.discoveryPaused ?? activeConnections >= effectiveCapacity,
    matching: {
      status: res.matching?.status ?? 'OFF',
      generation: Number(res.matching?.generation ?? 0),
    },
    selectionRequired: Boolean(res.selectionRequired) || state === UserState.SELECTION_REQUIRED,
    keepLimit: res.keepLimit ?? undefined,
    selectionDeadline: res.selectionDeadline ?? undefined,
    chatViewPass: res.chatViewPass ?? undefined,
  };
}

export interface HookRequestList {
  requests: HookRequestItem[];
  chatViewPass?: string;
}

export const StateApi = {
  /** Initialize the caller's state record. Body-less; the tier is always seeded MUST server-side. */
  initUser: async () => {
    return sdkClient.initUser({});
  },

  /** Release a hook the caller participates in. */
  releaseHook: async (matchId: string, reason?: string) => {
    return sdkClient.unhook({ matchId, reason });
  },

  /**
   * Body-less entitlement reconciliation. The server re-checks the billing source of truth; the
   * caller refetches the state afterwards for the authoritative tier.
   */
  reconcileEntitlements: async () => {
    return sdkClient.upgradeUser({});
  },

  /**
   * Body-less onboarding completion, with a bounded retry for the one transient failure it has.
   *
   * The server refuses with **409** while the caller's PORTABLE sign-in credentials are not yet live
   * in Cognito — the username → `preferred_username` mirror is applied asynchronously, so finishing
   * the wizard within a second of registering can outrun it. The server repairs that in place, so a
   * retry moments later normally succeeds. Only 409 is retried; if it still fails the error
   * propagates and the wizard explains the next step instead of dead-ending.
   */
  completeOnboarding: async () => {
    const RETRY_DELAYS_MS = [800, 2000, 4000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await sdkClient.completeOnboarding({});
      } catch (err) {
        if (errorStatus(err) !== 409 || attempt >= RETRY_DELAYS_MS.length) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  },

  /**
   * Authoritative state for the caller (who may only read their own). Remembers the chat view pass,
   * which is what opens every hook partner's chat profile.
   */
  getUserState: async (userId: string): Promise<UserStateSnapshot> => {
    const snapshot = toUserStateSnapshot(await withViewPassRetry(() => sdkClient.getState({ userId })));
    viewPasses.add(snapshot.chatViewPass);
    return snapshot;
  },

  // ── Hook requests (connect by username) ────────────────────────────────────

  /**
   * Sends a hook request. Resolves the same way for every recipient outcome; rejects only for the
   * caller's own state (409 CONNECTION_LIMIT, SELECTION_REQUIRED, NOT_READY; 400 malformed or self).
   */
  sendHookRequest: async (username: string): Promise<void> => {
    await sdkClient.sendHookRequest({ username });
  },

  /** Pending received requests (locked ones name nobody), with a pass for the unlocked senders. */
  listIncomingRequests: async (): Promise<HookRequestList> => {
    const res = await withViewPassRetry(() => sdkClient.listHookRequests({ direction: 'INCOMING' }));
    viewPasses.add(res.chatViewPass);
    return { requests: res.requests ?? [], chatViewPass: res.chatViewPass };
  },

  /** Every request the caller sent that has not expired (always shown as pending). */
  listOutgoingRequests: async (): Promise<HookRequestList> => {
    const res = await sdkClient.listHookRequests({ direction: 'OUTGOING' });
    return { requests: res.requests ?? [] };
  },

  /** Accepts a received request: 409 CONNECTION_LIMIT, 404 REQUEST_UNAVAILABLE. */
  acceptHookRequest: async (requestId: string): Promise<{ matchId: string; peerId: string }> => {
    const res = await sdkClient.acceptHookRequest({ requestId });
    return { matchId: String(res.matchId), peerId: String(res.peerId) };
  },

  declineHookRequest: async (requestId: string): Promise<void> => {
    await sdkClient.declineHookRequest({ requestId });
  },

  /** Withdraws a request the caller sent. */
  cancelHookRequest: async (requestId: string): Promise<void> => {
    await sdkClient.cancelHookRequest({ requestId });
  },

  // ── Downgrade selection ────────────────────────────────────────────────────

  /** Keeps exactly `keepLimit` hooks after a downgrade; the others are released. */
  keepHooks: async (matchIds: string[]): Promise<UserStateSnapshot> => {
    const snapshot = toUserStateSnapshot(await sdkClient.keepHooks({ matchIds }));
    viewPasses.add(snapshot.chatViewPass);
    return snapshot;
  },

  // ── Blocks and reports ─────────────────────────────────────────────────────

  /**
   * Blocks a member. Any hook between the two is released (and its chat erased) before this returns,
   * and pending requests both ways are deleted, so no separate unhook is needed.
   */
  blockUser: async (blockedUserId: string, reason?: BlockReason, details?: string): Promise<void> => {
    await sdkClient.blockUser({ blockedUserId, reason, details });
  },

  /** Files a member report (also blocks unless `alsoBlock` is false). 429 after 20 in a day. */
  reportMember: async (body: {
    reportedUserId: string;
    category: ReportCategory;
    details?: string;
    alsoBlock?: boolean;
    conversationId?: string;
    evidenceOffered?: boolean;
  }): Promise<ReportMemberResponse> => {
    return sdkClient.reportMember(body);
  },

  // ── Matching mode ──────────────────────────────────────────────────────────

  /**
   * Turns matching on. 409 MATCHING_PROFILE_INCOMPLETE carries `gaps`; 409 MATCHING_ERASING while a
   * previous opt-out is still erasing; 409 NOT_READY before onboarding is complete.
   */
  enableMatching: async () => {
    return sdkClient.enableMatching({});
  },

  /** Turns matching off: 202 ERASING. Hooks, chats, blocks and requests are kept. */
  disableMatching: async () => {
    return sdkClient.disableMatching({ confirm: DISABLE_MATCHING_CONFIRMATION });
  },
};
