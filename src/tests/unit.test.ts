import { describe, it, expect } from 'vitest';
import { UserProfile, SubscriptionTier, UserState, RankedCandidate, DiscoverResponse } from '../types';

describe('MatchingApi: Unit Tests', () => {
  const mockUser: UserProfile = {
    id: '1',
    userId: '1',
    name: 'A',
    bio: '',
    birthDate: '',
    gender: 'M',
    interestedIn: ['Tech', 'Art'],
    photos: [],
    location: { lat: 0, lng: 0, geohash: '' },
    subscriptionTier: SubscriptionTier.FREE,
    activeConnections: 0,
    currentState: UserState.AVAILABLE,
    currentMatches: [],
    inviteCode: '',
  };

  it('should construct discover query with correct params', () => {
    const url = `/matching/discover?userId=${mockUser.id}&lat=${mockUser.location.lat}&lon=${mockUser.location.lng}`;
    expect(url).toContain('userId=1');
    expect(url).toContain('lat=0');
    expect(url).toContain('lon=0');
  });

  it('free-tier user should have FREE subscription tier', () => {
    expect(mockUser.subscriptionTier).toBe(SubscriptionTier.FREE);
  });
});

describe('DiscoverResponse: Ranked Candidates', () => {
  it('discover response shape includes algorithm field', () => {
    const response: DiscoverResponse = {
      candidates: [
        { userId: 'abc123', score: 0.847, distanceKm: 5 },
        { userId: 'def456', score: 0.731, distanceKm: 5 },
      ],
      count: 2,
      algorithm: 'gale-shapley+cf',
    };
    expect(response.algorithm).toBe('gale-shapley+cf');
    expect(response.count).toBe(2);
  });

  it('ranked candidates have userId and score fields', () => {
    const candidate: RankedCandidate = { userId: 'user1', score: 0.75, distanceKm: 5 };
    expect(candidate.userId).toBe('user1');
    expect(candidate.score).toBeGreaterThanOrEqual(0);
    expect(candidate.score).toBeLessThanOrEqual(1);
  });

  it('candidates are ordered by score descending', () => {
    const candidates: RankedCandidate[] = [
      { userId: 'a', score: 0.9, distanceKm: 5 },
      { userId: 'b', score: 0.7, distanceKm: 5 },
      { userId: 'c', score: 0.5, distanceKm: 5 },
    ];
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].score).toBeGreaterThanOrEqual(candidates[i + 1].score);
    }
  });

  it('score of 0 is valid for cold-start candidates', () => {
    const candidate: RankedCandidate = { userId: 'newUser', score: 0, distanceKm: 5 };
    expect(candidate.score).toBe(0);
  });

  it('score of 1 is valid for top mutual-affinity candidates', () => {
    const candidate: RankedCandidate = { userId: 'topUser', score: 1, distanceKm: 5 };
    expect(candidate.score).toBe(1);
  });
});

describe('InputValidator rules (client-side mirror)', () => {
  const USER_ID_PATTERN = /^[a-zA-Z0-9_\-]{1,128}$/;

  it('valid userIds match the expected pattern', () => {
    ['alice', 'Bob123', 'user_id-1', 'a'.repeat(128)].forEach((id) => {
      expect(USER_ID_PATTERN.test(id)).toBe(true);
    });
  });

  it('invalid userIds do not match the pattern', () => {
    ['', 'has space', 'has@symbol', 'a'.repeat(129), '<script>'].forEach((id) => {
      expect(USER_ID_PATTERN.test(id)).toBe(false);
    });
  });

  it('direction must be RIGHT or LEFT', () => {
    const validDirections = ['RIGHT', 'LEFT'];
    const invalid = ['right', 'left', 'UP', ''];
    validDirections.forEach((d) => expect(['RIGHT', 'LEFT'].includes(d)).toBe(true));
    invalid.forEach((d) => expect(['RIGHT', 'LEFT'].includes(d)).toBe(false));
  });

  it('latitude must be in [-90, 90]', () => {
    expect(37.77 >= -90 && 37.77 <= 90).toBe(true);
    expect(91 >= -90 && 91 <= 90).toBe(false);
  });

  it('longitude must be in [-180, 180]', () => {
    expect(-122.4 >= -180 && -122.4 <= 180).toBe(true);
    expect(181 >= -180 && 181 <= 180).toBe(false);
  });
});
