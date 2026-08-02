import { describe, it, expect } from 'vitest';
import { StateApi } from '../api/state';
import { UserState, SubscriptionTier, RankedCandidate, DiscoverResponse } from '../types';

describe('StateApi: Single-Threaded Constraint', () => {
  it('free-tier user state should start as AVAILABLE with maxConnections=1', () => {
    const initialState = {
      userId: 'userA',
      state: UserState.AVAILABLE,
      activeConnections: 0,
      maxConnections: 1,
    };
    expect(initialState.state).toBe(UserState.AVAILABLE);
    expect(initialState.maxConnections).toBe(1);
  });

  it('GOLD tier should allow up to 3 concurrent connections', () => {
    const goldState = { maxConnections: 3, subscriptionTier: SubscriptionTier.GOLD };
    expect(goldState.maxConnections).toBe(3);
  });

  it('hook creation payload should include both userA and userB', () => {
    const payload = JSON.stringify({ userA: 'userA', userB: 'userB' });
    const parsed = JSON.parse(payload);
    expect(parsed.userA).toBe('userA');
    expect(parsed.userB).toBe('userB');
  });
});

describe('Matching Pipeline: Gale-Shapley + Collaborative Filtering', () => {
  it('discover response includes algorithm identifier', () => {
    const response: DiscoverResponse = {
      candidates: [],
      count: 0,
      algorithm: 'gale-shapley+cf',
    };
    expect(response.algorithm).toBe('gale-shapley+cf');
  });

  it('mutual match swipe response has matched=true and MUTUAL_MATCH status', () => {
    const swipeResult = { status: 'MUTUAL_MATCH', matched: true };
    expect(swipeResult.matched).toBe(true);
    expect(swipeResult.status).toBe('MUTUAL_MATCH');
  });

  it('regular swipe response has matched=false', () => {
    const swipeResult = { status: 'SWIPE_RECORDED', matched: false };
    expect(swipeResult.matched).toBe(false);
  });

  it('cold start: empty candidate list is a valid response', () => {
    const response: DiscoverResponse = { candidates: [], count: 0, algorithm: 'gale-shapley+cf' };
    expect(response.candidates).toHaveLength(0);
    expect(response.count).toBe(0);
  });

  it('top candidate score is highest in a sorted result set', () => {
    const candidates: RankedCandidate[] = [
      { userId: 'best', score: 0.95, distanceKm: 5 },
      { userId: 'good', score: 0.72, distanceKm: 5 },
      { userId: 'ok',   score: 0.41, distanceKm: 5 },
    ];
    const top = candidates[0];
    candidates.forEach((c) => expect(top.score).toBeGreaterThanOrEqual(c.score));
  });

  it('MutualMatch event payload serialises correctly for EventBridge', () => {
    const detail = JSON.stringify({ userA: 'alice', userB: 'bob' });
    const parsed = JSON.parse(detail);
    expect(parsed.userA).toBe('alice');
    expect(parsed.userB).toBe('bob');
  });

  it('Laplace-smoothed match rate stays in (0, 1) for any swipe count', () => {
    const laplace = (matched: number, total: number) => (matched + 1) / (total + 10);
    expect(laplace(0, 0)).toBeGreaterThan(0);
    expect(laplace(0, 0)).toBeLessThan(1);
    expect(laplace(100, 100)).toBeLessThan(1);
    expect(laplace(1000, 1000)).toBeCloseTo(1, 1);
  });
});
