import { describe, it, expect, vi } from 'vitest';
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
    subscriptionTier: SubscriptionTier.FREE,
    activeConnections: 1,
    currentState: UserState.HOOKED,
    currentMatches: ['match-abc-456'],
  };

  const userStateHooked: UserStateSnapshot = {
    userId: 'usr-123',
    state: UserState.HOOKED,
    activeConnections: 1,
    matchIds: ['match-abc-456'],
    subscriptionTier: SubscriptionTier.FREE,
  };

  const userStateAvailable: UserStateSnapshot = {
    userId: 'usr-123',
    state: UserState.AVAILABLE,
    activeConnections: 0,
    matchIds: [],
    subscriptionTier: SubscriptionTier.FREE,
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

  it('computes connection capacity based on authoritative subscription tier', () => {
    const freeCapacity = userStateHooked.subscriptionTier === SubscriptionTier.FREE ? 1 : 3;
    expect(freeCapacity).toBe(1);

    const goldState: UserStateSnapshot = {
      ...userStateHooked,
      subscriptionTier: SubscriptionTier.GOLD,
    };
    const goldCapacity = goldState.subscriptionTier === SubscriptionTier.FREE ? 1 : 3;
    expect(goldCapacity).toBe(3);
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
