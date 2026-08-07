// TEMPORARY STUB: @onehook/api-client codegen is not built for static launch.
// The public site (Landing, Careers, Contact, etc.) does not use these types.
// Auth/app routes will gracefully degrade when backend is unavailable.
export type ProfileResponse = Record<string, any>;
export type CandidateDto = Record<string, any>;
export type DiscoverResponse = Record<string, any>;
export type UserPreferencesResponse = Record<string, any>;
export type UserResponse = Record<string, any>;
export type MatchRecord = Record<string, any>;
export type UserStateResponse = Record<string, any>;

/*
import {
  ProfileResponse,
  CandidateDto,
  DiscoverResponse,
  UserPreferencesResponse,
  UserResponse,
  MatchRecord,
  UserStateResponse,
} from '@onehook/api-client';
*/

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

// REMOVED: export type { DiscoverResponse, UserResponse };
// These are now stubbed at the top of the file

/**
 * Client-facing matching preferences. The backend contract only supports the
 * fields below (age range, distance, and interested-in genders). Lifestyle and
 * relationship attributes (relationshipType, wantsKids, smokingStatus, ...) are
 * PROFILE fields, not preferences, and are persisted via the profile service.
 */
export type UserPreferences = UserPreferencesResponse;

export type Match = MatchRecord;
// REMOVED: export type { UserStateResponse };
// This is now stubbed at the top of the file

export enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export interface ChatMessageDTO {
  messageId: string;
  senderId: string;
  ciphertext: string;
  timestamp: number;
  status: MessageStatus | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  deliveredAt?: number;
  readAt?: number;
}

export interface ChatHistoryResponse {
  messages: ChatMessageDTO[];
}

export interface Message {
  id: string;
  matchId: string;
  senderId: string;
  ciphertext: string;
  timestamp: number;
  expiresAt: number;
  status: MessageStatus;
  deliveredAt?: number;
  readAt?: number;
  readBy?: string[];
}

export interface Invite {
  code: string;
  referrerId: string;
  refereeId?: string;
  createdAt: number;
  expiresAt: number;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED';
}
