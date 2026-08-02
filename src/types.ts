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
  currentState: UserState;
  currentMatches: string[];
  maxConnections: number;
  activeConnections: number;
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
