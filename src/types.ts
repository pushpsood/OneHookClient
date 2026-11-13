// ── Canonical DTO re-exports from the generated API client ──────────────────
// onehook-api-client is the single source of truth. Do NOT duplicate these
// types locally — if a shape is wrong, fix it in the backend codegen.
export type {
  ChatProfile,
  MatchingProfile,
  MyProfileResponse,
  BirthDetails,
  BirthTimePlace,
  CandidateDto,
  DiscoverResponse,
  UserPreferencesResponse,
  UserResponse,
  MatchRecord,
  UserStateResponse,
  HookSummary,
  HookRequestItem,
  ListHookRequestsResponse,
} from 'onehook-api-client';
export { MatchingMode, HookOrigin, MatchingProfileStatus, MediaPurpose, HookRequestDirection } from 'onehook-api-client';

import type {
  MatchingProfile,
  BirthDetails,
  MatchRecord,
  UserPreferencesResponse,
  CandidateDto,
  MatchingMode,
  HookOrigin,
  MatchingProfileStatus,
} from 'onehook-api-client';

/** State's `current_state` (docs/chat-only-profiles.md §6.2). */
export enum UserState {
  ONBOARDING = 'ONBOARDING',
  AVAILABLE = 'AVAILABLE',
  HOOKED = 'HOOKED',
  /** After a tier downgrade below the current hooks: the member must choose which hooks to keep. */
  SELECTION_REQUIRED = 'SELECTION_REQUIRED',
}

// Membership tiers are owned by the backend Smithy model (club.onehook.common#SubscriptionTier) and
// consumed ONLY from onehook-api-client. Never re-declare tier names here — see
// src/tests/membership-source-of-truth.test.ts.
export { SubscriptionTier } from 'onehook-api-client';
import type { SubscriptionTier } from 'onehook-api-client';

/** One of the member's current hooks, as `GET /state/{userId}` returns it. */
export type Hook = {
  matchId: string;
  /** The other member of the hook. */
  peerId: string;
  origin: HookOrigin;
  /** Epoch seconds. */
  hookedAt: number;
  /** True while the conversation is read-only (a member of it must choose which hooks to keep). */
  suspended: boolean;
};

/**
 * Authoritative, server-owned view of a user's connection state, entitlement and matching mode.
 *
 * <p>This is the normalised response of `GET /state/{userId}` from the State service, which is the
 * single source of truth for the subscription tier, the hooks, capacity, the downgrade selection and
 * the matching mode. It is deliberately NOT derived from the profile.</p>
 *
 * <p>Treat these values as a <strong>rendering input only</strong>. Entitlement and capacity are
 * enforced server-side, so a tampered client can reveal a control but cannot use it.</p>
 */
export type UserStateSnapshot = {
  userId: string;
  state: UserState;
  activeConnections: number;
  subscriptionTier: SubscriptionTier;
  hooks: Hook[];
  /** How many hooks the member may hold right now (tier ceiling plus bonus slots). */
  effectiveCapacity: number;
  /** At capacity: no discovery, hidden from everyone else's, no accepting requests. */
  discoveryPaused: boolean;
  matching: { status: MatchingMode; generation: number };
  /** A downgrade left more hooks than the tier allows; every conversation is suspended until chosen. */
  selectionRequired: boolean;
  /** How many hooks to keep, while `selectionRequired`. */
  keepLimit?: number;
  /** Epoch seconds after which the most recently active hooks are kept automatically. */
  selectionDeadline?: number;
  /** View pass naming every current hook partner (absent without hooks). */
  chatViewPass?: string;
};

/**
 * The signed-in member as the UI understands them: their chat profile (every account has one) merged
 * with their matching profile when one exists (DRAFT or ACTIVE). Built from `GET /profile` by
 * {@link import('./lib/profile-model').toUserProfile}. The optional birth time and place
 * (`birthTimePlace`, owner only) come from the matching profile; the chat profile carries only the
 * birth date.
 */
export type UserProfile = Omit<MatchingProfile, 'userId' | 'status'> & {
  userId: string;
  id: string;
  name: string;
  /** Chat-profile avatar (purpose CHAT media key). */
  avatarKey?: string;
  /** Chat-profile birth date (`date`, `provisional`). Birth time and place live in `birthTimePlace`. */
  birthDetails?: BirthDetails;
  /** True when a real (non-provisional) birth date is on file. */
  birthDateOnFile?: boolean;
  birthDate?: string;
  /** Matching-profile pictures (purpose MATCHING media keys). Empty for a chat-only member. */
  photos: string[];
  /** Display-only focal point/zoom keyed by original picture object key. */
  pictureTransforms?: Record<string, string>;
  location?: { lat: number; lng: number; geohash: string };
  moderationStatus?: 'APPROVED' | 'PENDING_REVIEW' | 'PENDING_MEDIA' | 'PENDING_TEXT' | 'REJECTED' | string;
  fieldModerationStatus?: Record<string, 'APPROVED' | 'PENDING' | 'REJECTED' | string>;
  /** DRAFT until matching is turned on, ACTIVE while it is on; absent without a matching profile. */
  matchingStatus?: MatchingProfileStatus;
  /** DRAFT only: epoch seconds when the draft is erased unless edited again. */
  draftExpiresAt?: number;
  /** Epoch seconds of the last matching-profile edit. */
  lastEditedAt?: number;
  /** Set locally right after onboarding; the State snapshot is authoritative. */
  currentState?: UserState;
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
  work?: string;
  education?: string;
  hometown?: string;
  interests?: string[];
  /** Who found this candidate: 'ONEHOOK_INTELLIGENCE' or 'MR_ONEHOOK'. */
  matchFinder?: string;
  /** Display name of matchFinder ("OneHook Intelligence" / "Mr. OneHook"). */
  matchFinderLabel?: string;
  /** Why this candidate is shown. */
  reasoning?: string;
};

export type RankedCandidate = CandidateDto & {
  id?: string;
  distanceKm?: number;
  score?: number;
};

/**
 * Client-facing matching preferences (`GET /matching/{userId}/preferences`). Only read while the
 * member's matching is ON — every /matching/* route answers 403 MATCHING_OFF otherwise.
 */
export type UserPreferences = UserPreferencesResponse;

export type Match = MatchRecord;

// ── Canonical GraphQL type re-exports ────────────────────────────────────────
// Chat message types come from the backend's generated GraphQL SDK (onehook-api-client).
export {
  MessageStatus,
  type Message,
  type MessageReceipt,
  type DeletedMessage,
} from 'onehook-api-client/graphql';

import type { Message } from 'onehook-api-client/graphql';

/** Backward-compat alias — consumers should migrate to `Message`. */
export type ChatMessageDTO = Message;

/**
 * A message as the chat UI needs it: the decrypted body in `ciphertext` plus the client-only fact of
 * whether decryption was impossible on THIS device.
 *
 * `undecryptable` is set only when the envelope was intact but encrypted to keys this device does not
 * hold — history written before the device was registered. That is exactly the case history recovery
 * fixes, so the flag is what lets the UI offer "restore from another device" instead of a dead end.
 * Transport and parse failures are NOT flagged; they render as a plain error and a retry is pointless.
 */
export type ChatMessageView = ChatMessageDTO & { undecryptable?: boolean };

export interface Invite {
  code: string;
  referrerId: string;
  refereeId?: string;
  createdAt: number;
  expiresAt: number;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED';
}
