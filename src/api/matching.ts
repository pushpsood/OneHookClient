import { sdkClient } from './sdk-client';
import { RankedCandidate } from '../types';
import {
  SwipeApi,
  ReceivedLikesApi,
  RosesApi,
  type LikeTargetType,
  type SwipeResult,
  type ReceivedLikesResponse,
  type RoseQuota,
} from './rest';

/** Discovery categories (mirrors the backend `DiscoveryCategory`). */
export type DiscoveryCategory = 'ALL' | 'PROFILE_MATCH' | 'ONEHOOK_SUGGESTED' | 'SIMILAR';

export interface DiscoverFeed {
  candidates: RankedCandidate[];
  count: number;
  algorithm: string;
  /** The category the backend applied. */
  category?: DiscoveryCategory;
  /** Categories this member's tier may pick; just ['ALL'] for free members. */
  availableCategories?: DiscoveryCategory[];
}

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

  /**
   * The discover feed. Without `category` every tier gets the mixed deck (OneHook Intelligence +
   * Mr. OneHook). Super+ may pass a category; the backend answers 403 PREMIUM_REQUIRED otherwise.
   */
  discover: async (userId: string, lat: number, lon: number, category?: DiscoveryCategory) => {
    const timeoutPromise = new Promise<DiscoverFeed>((_, reject) =>
      setTimeout(() => reject(new Error('Discover request timed out. Please check your connection and try again.')), 10000)
    );
    const discoverPromise = (async () => {
      return (await (sdkClient as any).discover({
        userId,
        lat,
        lon,
        ...(category && category !== 'ALL' ? { category } : {}),
      })) as unknown as DiscoverFeed;
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
    likeKind?: 'LIKE' | 'ROSE';
  }): Promise<SwipeResult> => {
    return SwipeApi.like(input);
  },

  /** Remaining daily rose (super-like) quota. */
  rosesRemaining: async (): Promise<RoseQuota> => {
    return RosesApi.remaining();
  },

  /** The caller's received likes (who liked them, on which element, with what comment). */
  getReceivedLikes: async (): Promise<ReceivedLikesResponse> => {
    return ReceivedLikesApi.list();
  },

  removeFromIndex: async (userId?: string, lat = 0, lon = 0) => {
    return (sdkClient as any).removeLocation({ userId, lat, lon });
  },
};
