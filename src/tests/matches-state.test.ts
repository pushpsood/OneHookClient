import { describe, it, expect } from 'vitest';
import { maxConnectionsForTier } from 'onehook-api-client/membership';
import { UserState, SubscriptionTier, type UserStateResponse } from '../types';
import { toUserStateSnapshot } from '../api/state';

/**
 * The state model after chat-only profiles (docs/chat-only-profiles.md §9.1): the chat list is the
 * state's `hooks[]` (each naming its partner), not `matchIds` plus a GET /state/match per hook.
 */
describe('toUserStateSnapshot (GET /state/{userId})', () => {
  const base: UserStateResponse = {
    userId: 'usr-123',
    state: 'HOOKED',
    activeConnections: 1,
    matchIds: ['match-abc-456'],
    subscriptionTier: SubscriptionTier.MUST,
  };

  it('takes each hook partner from hooks[] (no userA/userB lookup)', () => {
    const snap = toUserStateSnapshot({
      ...base,
      hooks: [{ matchId: 'match-abc-456', peerId: 'usr-peer-789', origin: 'REQUEST', hookedAt: 1767000000 }],
      effectiveCapacity: 1,
    });
    expect(snap.hooks).toEqual([
      { matchId: 'match-abc-456', peerId: 'usr-peer-789', origin: 'REQUEST', hookedAt: 1767000000, suspended: false },
    ]);
    expect(snap.state).toBe(UserState.HOOKED);
  });

  it('defaults an absent matching mode to OFF (State: matching_status absent means OFF)', () => {
    const snap = toUserStateSnapshot({ ...base, hooks: [] });
    expect(snap.matching).toEqual({ status: 'OFF', generation: 0 });
  });

  it('derives discoveryPaused from capacity when the field is absent (R6)', () => {
    expect(toUserStateSnapshot({ ...base, effectiveCapacity: 1 }).discoveryPaused).toBe(true);
    expect(toUserStateSnapshot({ ...base, activeConnections: 1, effectiveCapacity: 3 }).discoveryPaused).toBe(false);
    expect(toUserStateSnapshot({ ...base, effectiveCapacity: 3, discoveryPaused: true }).discoveryPaused).toBe(true);
  });

  it('marks a pending downgrade choice from either the flag or the SELECTION_REQUIRED state', () => {
    expect(toUserStateSnapshot({ ...base, state: 'SELECTION_REQUIRED' }).selectionRequired).toBe(true);
    const flagged = toUserStateSnapshot({ ...base, selectionRequired: true, keepLimit: 1, selectionDeadline: 1767600000 });
    expect(flagged.selectionRequired).toBe(true);
    expect(flagged.keepLimit).toBe(1);
    expect(flagged.selectionDeadline).toBe(1767600000);
  });

  it('keeps the suspended flag per hook and drops malformed rows', () => {
    const snap = toUserStateSnapshot({
      ...base,
      hooks: [
        { matchId: 'm1', peerId: 'p1', origin: 'DISCOVERY', hookedAt: 1, suspended: true },
        { matchId: 'm2', peerId: undefined, origin: 'DISCOVERY', hookedAt: 2 },
      ],
    });
    expect(snap.hooks).toHaveLength(1);
    expect(snap.hooks[0].suspended).toBe(true);
  });

  it('fails closed on an unknown state: treated as ONBOARDING, never as in the app', () => {
    expect(toUserStateSnapshot({ ...base, state: 'LOCK_PENDING' }).state).toBe(UserState.ONBOARDING);
  });

  it('carries the chat view pass through', () => {
    expect(toUserStateSnapshot({ ...base, chatViewPass: 'a.b.c' }).chatViewPass).toBe('a.b.c');
  });
});

describe('capacity from the backend-owned tier catalogue', () => {
  it('MUST and SUPER hold one hook, INFINITY three (both hook origins count together, E29)', () => {
    expect(maxConnectionsForTier(SubscriptionTier.MUST)).toBe(1);
    expect(maxConnectionsForTier(SubscriptionTier.SUPER)).toBe(1);
    expect(maxConnectionsForTier(SubscriptionTier.INFINITY)).toBe(3);
    // An unknown / missing tier fails closed to the free ceiling.
    expect(maxConnectionsForTier(undefined)).toBe(1);
  });
});
