// ── Canonical DTO re-exports from the generated API client ──────────────────
// onehook-api-client is the single source of truth. Do NOT duplicate these
// types locally — if a shape is wrong, fix it in the backend codegen.
export type {
  ProfileResponse,
  CandidateDto,
  DiscoverResponse,
  UserPreferencesResponse,
  UserResponse,
  MatchRecord,
  UserStateResponse,
} from 'onehook-api-client';

import type {
  ProfileResponse,
  MatchRecord,
  UserPreferencesResponse,
  CandidateDto,
} from 'onehook-api-client';

export enum UserState {
  ONBOARDING = 'ONBOARDING',
  AVAILABLE = 'AVAILABLE',
  LOCK_PENDING = 'LOCK_PENDING',
  HOOKED = 'HOOKED',
}

export enum SubscriptionTier {
  FREE = 'FREE',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

/**
 * Authoritative, server-owned view of a user's connection state and entitlement.
 *
 * <p>This is the response of `GET /state/{userId}` from the State service, which is the single
 * source of truth for the subscription tier and the connection state machine. It is deliberately
 * NOT derived from the profile: the Profile service intentionally omits `subscriptionTier` from its
 * read model (see ProfileDtoMapper), so reading the tier off a profile always yields `undefined`.</p>
 *
 * <p>Treat these values as a <strong>rendering input only</strong>. Entitlement is enforced
 * server-side (DynamoDB capacity conditions, premium chat resolvers, the verified JWT claim), so a
 * tampered client can reveal a premium control but cannot use it.</p>
 */
export type UserStateSnapshot = {
  userId: string;
  /** ONBOARDING | AVAILABLE | HOOKED */
  state: UserState;
  activeConnections: number;
  matchIds: string[];
  subscriptionTier: SubscriptionTier;
};

/**
 * The full user model as understood by the UI. It is built on top of the
 * backend {@link ProfileResponse} contract and augmented with client-only view
 * concerns (photos, location, live connection state) that are hydrated from the
 * state and identity services.
 */
export type UserProfile = ProfileResponse & {
  id: string;
  name: string;
  birthDate?: string;
  photos: string[];
  location: { lat: number; lng: number; geohash: string };
  /**
   * Connection-state fields below are owned by the State service, not the profile read model.
   * They are optional here because a profile response never carries them — read them from
   * {@link UserStateSnapshot} (see the `userState` store slice) instead.
   */
  currentState?: UserState;
  currentMatches?: string[];
  activeConnections?: number;
  inviteCode?: string;
};

export type DiscoveryCandidate = CandidateDto & {
  id: string;
  name: string;
  photos?: string[];
  verified?: boolean;
  distance?: number;
  distanceKm?: number;
  score?: number;
  age?: number;
  location?: string;
  bio?: string;
  interests?: string[];
};

export type RankedCandidate = CandidateDto & {
  id?: string;
  distanceKm?: number;
  score?: number;
};



/**
 * Client-facing matching preferences. The backend contract only supports the
 * fields below (age range, distance, and interested-in genders). Lifestyle and
 * relationship attributes (relationshipType, wantsKids, smokingStatus, ...) are
 * PROFILE fields, not preferences, and are persisted via the profile service.
 */
export type UserPreferences = UserPreferencesResponse;

export type Match = MatchRecord;


// ── Canonical GraphQL type re-exports ────────────────────────────────────────
// Chat message types come from the generated GraphQL codegen.
export {
  MessageStatus,
  type Message,
  type MessageReceipt,
  type DeletedMessage,
} from 'onehook-api-client/graphql';

import type { Message } from 'onehook-api-client/graphql';

/** Backward-compat alias — consumers should migrate to `Message`. */
export type ChatMessageDTO = Message;

export interface Invite {
  code: string;
  referrerId: string;
  refereeId?: string;
  createdAt: number;
  expiresAt: number;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED';
}
