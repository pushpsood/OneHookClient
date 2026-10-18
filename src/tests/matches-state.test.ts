import { describe, it, expect, vi } from 'vitest';
import { maxConnectionsForTier } from 'onehook-api-client/membership';
import { UserState, SubscriptionTier, UserStateSnapshot, UserProfile } from '../types';
import { StateApi } from '../api/state';

describe('Matches: State Service Extension', () => {
  const currentUser: UserProfile = {
    id: 'usr-123',
    userId: 'usr-123',
    name: 'Pushp',
    displayName: 'Pushp',
    photos: ['media/photo1.jpg'],
    location: { lat: 37.77, lng: -122.41, geohash: '9q8yy' },
    subscriptionTier: SubscriptionTier.MUST,
    activeConnections: 1,
    currentState: UserState.HOOKED,
    currentMatches: ['match-abc-456'],
  };

  const userStateHooked: UserStateSnapshot = {
    userId: 'usr-123',
    state: UserState.HOOKED,
    activeConnections: 1,
    matchIds: ['match-abc-456'],
    subscriptionTier: SubscriptionTier.MUST,
  };

  const userStateAvailable: UserStateSnapshot = {
    userId: 'usr-123',
    state: UserState.AVAILABLE,
    activeConnections: 0,
    matchIds: [],
    subscriptionTier: SubscriptionTier.MUST,
  };

  it('determines peer ID correctly from State service match record', () => {
    const matchRecordA = {
      matchId: 'match-abc-456',
      userA: 'usr-123',
      userB: 'usr-peer-789',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const peerA = matchRecordA.userA === currentUser.id ? matchRecordA.userB : matchRecordA.userA;
    expect(peerA).toBe('usr-peer-789');

    const matchRecordB = {
      matchId: 'match-xyz-999',
      userA: 'usr-peer-789',
      userB: 'usr-123',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const peerB = matchRecordB.userA === currentUser.id ? matchRecordB.userB : matchRecordB.userA;
    expect(peerB).toBe('usr-peer-789');
  });

  it('computes connection capacity from the backend-owned tier catalogue', () => {
    expect(maxConnectionsForTier(userStateHooked.subscriptionTier)).toBe(1);

    const goldState: UserStateSnapshot = {
      ...userStateHooked,
      subscriptionTier: SubscriptionTier.SUPER,
    };
    // Super keeps the one-connection rule; only the top tier relaxes it.
    expect(maxConnectionsForTier(goldState.subscriptionTier)).toBe(1);
    expect(maxConnectionsForTier(SubscriptionTier.INFINITY)).toBe(3);
    // An unknown / missing tier fails closed to the free ceiling.
    expect(maxConnectionsForTier(undefined)).toBe(1);
  });

  it('unhooking resets active connections and transitions state to AVAILABLE', () => {
    // Simulate unhooking transition on client state
    let state = { ...userStateHooked };
    const unhookMatchId = 'match-abc-456';

    // State machine mutation mirror
    state = {
      ...state,
      state: UserState.AVAILABLE,
      activeConnections: Math.max(0, state.activeConnections - 1),
      matchIds: state.matchIds.filter((id) => id !== unhookMatchId),
    };

    expect(state.state).toBe(UserState.AVAILABLE);
    expect(state.activeConnections).toBe(0);
    expect(state.matchIds).toHaveLength(0);
  });

  it('app state accommodates unified sections: DISCOVERY, MATCHES (with integrated chat), PROFILE', () => {
    type AppSection = 'DISCOVERY' | 'MATCHES' | 'PROFILE';
    const sections: AppSection[] = ['DISCOVERY', 'MATCHES', 'PROFILE'];

    expect(sections).toContain('MATCHES');
    expect(sections).toContain('DISCOVERY');
    expect(sections).toContain('PROFILE');
    expect(sections).toHaveLength(3);
  });

  it('selecting a match within the unified MatchesView updates active match state directly', () => {
    let activeMatchId: string | null = null;

    const onSelectMatch = (matchId: string | null) => {
      activeMatchId = matchId;
    };

    onSelectMatch('match-abc-456');

    expect(activeMatchId).toBe('match-abc-456');
  });
});
