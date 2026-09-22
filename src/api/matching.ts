import { sdkClient } from './sdk-client';
import { RankedCandidate } from '../types';
import {
  SwipeApi,
  ReceivedLikesApi,
  type LikeTargetType,
  type SwipeResult,
  type ReceivedLikesResponse,
} from './rest';

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
    const timeoutPromise = new Promise<{ candidates: RankedCandidate[]; count: number; algorithm: string }>((_, reject) =>
      setTimeout(() => reject(new Error('Discover request timed out. Please check your connection and try again.')), 10000)
    );
    const discoverPromise = (async () => {
      return (await (sdkClient as any).discover({ userId, lat, lon })) as unknown as {
        candidates: RankedCandidate[];
        count: number;
        algorithm: string;
      };
    })();
    return Promise.race([discoverPromise, timeoutPromise]);
  },

  /**
   * PASS a candidate (LEFT). Liking is no longer possible by swipe/button — it now always requires a
   * comment attached to a specific profile element, sent via {@link MatchingApi.like}.
   */
  pass: async (targetId: string, viewedSection?: ProfileSection): Promise<SwipeResult> => {
    return SwipeApi.pass(targetId, viewedSection);
  },

  /**
   * LIKE a candidate (RIGHT) Hinge-style: a comment on one specific element of their profile.
   * `likeTargetRef` is the media object key (PHOTO/VIDEO/VOICE), the promptId (PROMPT) or the
   * interest value (INTEREST); it is omitted for BIO. Rejections propagate as an ApiError so the
   * caller can show the error and NOT advance the deck.
   */
  like: async (input: {
    targetId: string;
    comment: string;
    likeTargetType: LikeTargetType;
    likeTargetRef?: string;
    viewedSection?: ProfileSection;
  }): Promise<SwipeResult> => {
    return SwipeApi.like(input);
  },

  /** The caller's received likes (who liked them, on which element, with what comment). */
  getReceivedLikes: async (): Promise<ReceivedLikesResponse> => {
    return ReceivedLikesApi.list();
  },

  removeFromIndex: async (userId?: string, lat = 0, lon = 0) => {
    return (sdkClient as any).removeLocation({ userId, lat, lon });
  },
};
