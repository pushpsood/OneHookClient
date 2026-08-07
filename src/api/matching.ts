import { sdkClient } from './sdk-client';
import { RankedCandidate } from '../types';

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
    return (sdkClient as any).indexLocation({ userId, lat, lon });
  },

  discover: async (userId: string, lat: number, lon: number) => {
    return (await (sdkClient as any).discover({ userId, lat, lon })) as unknown as {
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
    return (await (sdkClient as any).swipe({ swiperId, targetId, direction, viewedSection })) as {
      status: string;
      matched: boolean;
      matchId?: string;
    };
  },

  removeFromIndex: async (userId: string, lat = 0, lon = 0) => {
    return (sdkClient as any).removeLocation({ userId, lat, lon });
  },
};
