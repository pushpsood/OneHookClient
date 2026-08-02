import { sdkClient } from './sdk-client';
import { RankedCandidate } from '../types';

/**
 * Matching service wrapper.
 *
 * Design philosophy (see OneHookBackend/packages/matching): the flow is
 * location -> discover -> swipe. Preferences are limited to age range, distance,
 * and interested-in genders. A LEFT (pass) swipe may carry the `viewedSection`
 * the swiper was looking at so the backend can re-surface the profile if exactly
 * that section changes. RIGHT swipes are permanent. Matching only DECLARES a
 * mutual match; the State service owns hook/match creation.
 */

export type ProfileSection =
  | 'PHOTOS'
  | 'BIO'
  | 'PROMPTS'
  | 'BASICS'
  | 'LIFESTYLE'
  | 'INTENT'
  | 'INTERESTS'
  | 'BACKGROUND';

export const MatchingApi = {
  indexLocation: async (userId: string, lat: number, lon: number) => {
    return sdkClient.indexLocation({ userId, lat, lon });
  },

  discover: async (userId: string, lat: number, lon: number) => {
    return (await sdkClient.discover({ userId, lat, lon })) as unknown as {
      candidates: RankedCandidate[];
      count: number;
      algorithm: string;
    };
  },

  swipe: async (
    swiperId: string,
    targetId: string,
    direction: 'LEFT' | 'RIGHT',
    viewedSection?: ProfileSection
  ) => {
    return (await sdkClient.swipe({ swiperId, targetId, direction, viewedSection })) as {
      status: string;
      matched: boolean;
      matchId?: string;
    };
  },

  removeFromIndex: async (userId: string, lat = 0, lon = 0) => {
    return sdkClient.removeLocation({ userId, lat, lon });
  },
};
