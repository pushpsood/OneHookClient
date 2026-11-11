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
import { viewPasses } from '../lib/view-pass';

/**
 * Matching service wrapper.
 *
 * Matching is optional (docs/chat-only-profiles.md §6): only a member whose matching is ON may call
 * anything here. Every /matching/* route answers 403 MATCHING_OFF otherwise, and discover / swipe
 * answer 403 DISCOVERY_PAUSED while the member is at hook capacity. The app shell therefore never
 * mounts a screen that calls this module unless `matching.status === 'ON'` (see lib/app-mode.ts).
 */

/** Discovery categories (mirrors the backend `DiscoveryCategory`). */
export type DiscoveryCategory = 'ALL' | 'PROFILE_MATCH' | 'ONEHOOK_SUGGESTED' | 'SIMILAR';

export interface DiscoverFeed {
  candidates: RankedCandidate[];
  /** Pass for this page's candidates (`GET /profile/{id}/matching` and their media). */
  viewPass?: string;
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
  /** Records the caller's location for discovery (the caller is the JWT `sub`). */
  indexLocation: async (lat: number, lon: number) => {
    return sdkClient.indexLocation({ lat, lon });
  },

  /**
   * The discover feed. Without `category` every tier gets the mixed deck (OneHook Intelligence +
   * Mr. OneHook). Super+ may pass a category; the backend answers 403 PREMIUM_REQUIRED otherwise.
   * The page's view pass is remembered so its cards (and their media) can be opened.
   */
  discover: async (lat: number, lon: number, category?: DiscoveryCategory) => {
    const timeoutPromise = new Promise<DiscoverFeed>((_, reject) =>
      setTimeout(() => reject(new Error('Discover request timed out. Please check your connection and try again.')), 10000)
    );
    const discoverPromise = (async () => {
      const feed = (await sdkClient.discover({
        lat,
        lon,
        ...(category && category !== 'ALL' ? { category } : {}),
      })) as unknown as DiscoverFeed;
      viewPasses.add(feed?.viewPass);
      return feed;
    })();
    return Promise.race([discoverPromise, timeoutPromise]);
  },

  /**
   * Re-issues a matching view pass for members the caller may still open (a card served in the last
   * 24 h and not passed, a pending like, or a hook partner with an ACTIVE matching profile).
   */
  issueViewPasses: async (targetIds: string[]): Promise<void> => {
    if (targetIds.length === 0) return;
    const res = await sdkClient.issueViewPasses({ targetIds: targetIds.slice(0, 25) });
    viewPasses.add(res.viewPass);
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

  /** The caller's received likes, with a pass for the likers' matching profiles. */
  getReceivedLikes: async (): Promise<ReceivedLikesResponse> => {
    const res = await ReceivedLikesApi.list();
    viewPasses.add(res?.viewPass);
    return res;
  },
};
