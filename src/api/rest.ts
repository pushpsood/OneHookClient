/**
 * Matching and State endpoints with app-level types: partner distance, suggestions, traditions, chat
 * settings, swipes, roses, received likes and the matching-tab flag.
 *
 * Every call goes through the generated `onehook-api-client` SDK (`sdkClient`); nothing here builds a
 * URL or a request. `callSdk` turns SDK failures into the shared {@link ApiError}, so UI error handling
 * can keep matching on it. `src/tests/api-route-contract.test.ts` fails the build on a hand-built
 * request to a OneHook API.
 *
 * Every /matching/* route answers 403 MATCHING_OFF unless the caller's matching is ON, so nothing here
 * may be called for a chat-only member (docs/chat-only-profiles.md §12). Blocks, reports and hook
 * requests are State routes and live in api/state.ts.
 */
import { ApiError } from '../lib/api-client';
import { callSdk, sdkClient } from './sdk-client';

/**
 * The SDK output without its `$metadata`, typed as the app's shape. The app types mirror the Smithy
 * shapes (matching.smithy, state.smithy); the SDK marks required members `| undefined`, which the
 * server never omits.
 */
function body<T>(out: object): T {
  const { $metadata: _metadata, ...rest } = out as { $metadata?: unknown };
  return rest as T;
}

// ── Distance ────────────────────────────────────────────────────────────────

/**
 * Coarsened, server-side distance to another user. `distanceKm` is already floored to a whole km
 * (minimum 1) by the server; when `available` is false the caller MUST show nothing / "Location
 * unavailable" and never invent a value.
 */
export interface DistanceResponse {
  distanceKm: number | null;
  available: boolean;
}

export const DistanceApi = {
  get: (userId: string): Promise<DistanceResponse> =>
    callSdk(async () => body<DistanceResponse>(await sdkClient.getPartnerDistance({ userId }))),
};

// ── Mr. OneHook suggestion ────────────────────────────────────────────────────

/**
 * The member's own OneHook suggestion (what they last asked Mr. OneHook for). One at a time: a new request
 * replaces it, and only the member removes it. The current one comes with the preferences
 * (`currentSuggestion`).
 */
export interface SuggestionView {
  suggestionId: string;
  reasoning: string;
  createdAt: string;
}

export interface MemberSuggestions {
  /** Written by the member ("who I'm looking for"). */
  own?: SuggestionView;
  /** Recorded by Mr. OneHook from a "find me ..." chat. */
  oneHook?: SuggestionView;
}

/** The member's two asked-for suggestions (Super and above); each removable on its own. */
export const SuggestionApi = {
  get: (): Promise<MemberSuggestions> =>
    callSdk(async () => body<MemberSuggestions>(await sdkClient.getSuggestions({}))),
  saveOwn: (prompt: string, reasoning: string): Promise<{ suggestionId: string }> =>
    callSdk(async () => body<{ suggestionId: string }>(await sdkClient.recordSuggestion({ prompt, reasoning }))),
  removeOwn: (): Promise<void> =>
    callSdk(async () => {
      await sdkClient.removeSuggestion({});
    }),
  removeOneHook: (): Promise<void> =>
    callSdk(async () => {
      await sdkClient.removeOneHookSuggestion({});
    }),
};

// ── Traditional matching systems (opt out per tradition) ──────────────────────

export interface TraditionSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Least birth data it uses: DATE, TIME or PLACE. */
  needs: 'DATE' | 'TIME' | 'PLACE' | string;
}

export const TraditionApi = {
  get: (): Promise<{ traditions: TraditionSetting[] }> =>
    callSdk(async () =>
      body<{ traditions: TraditionSetting[] }>(await sdkClient.getTraditionPreferences({}))
    ),
  /** Replaces the opt-outs; an empty list re-enrols in every tradition. */
  setDisabled: (disabled: string[]): Promise<{ traditions: TraditionSetting[] }> =>
    callSdk(async () =>
      body<{ traditions: TraditionSetting[] }>(
        await sdkClient.updateTraditionPreferences({ disabled })
      )
    ),
};

// ── Chat settings ─────────────────────────────────────────────────────────────

export type LastSeenVisibility = 'EVERYONE' | 'MATCHES' | 'NOBODY';

export interface ChatSettings {
  messageNotifications: boolean;
  showPreviews: boolean;
  reactionNotifications: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  lastSeenVisibility: LastSeenVisibility;
  screenshotProtection: boolean;
  defaultDisappearingSeconds: number;
  /**
   * "Help translate my captions": this device may translate its OWN call captions for a partner whose
   * device cannot translate the pair (the §12.5 sender fallback). Default off — it uses this device's
   * battery and may download translation models. See OneHookBackend/docs/voice-video-calls.md D13.
   */
  helpTranslateCaptions: boolean;
  /**
   * Pushes about the member's hooks: a new hook, hook requests, missed calls, paused/resumed chats and
   * quiet-conversation nudges. Default on. Applies to chat-only members too.
   */
  connectionNotifications: boolean;
  /** Pushes when someone likes the member. Only matters while matching is ON. Default on. */
  likeNotifications: boolean;
}

/** The settings keys that are push-notification switches (each reports a snake_case `targetId`). */
export type ChatNotificationKey = 'connectionNotifications' | 'likeNotifications';

/**
 * Both GET and PUT answer `{ settings: ChatSettings }`. The two notification switches default to on
 * (chat.smithy), so a response that predates them reads as on rather than off.
 */
function unwrapSettings(out: { settings?: unknown }): ChatSettings {
  if (!out?.settings) throw new ApiError('Chat settings response had no settings.', 500);
  const s = out.settings as Partial<ChatSettings>;
  return {
    ...(s as ChatSettings),
    connectionNotifications: s.connectionNotifications ?? true,
    likeNotifications: s.likeNotifications ?? true,
  };
}

export const ChatSettingsApi = {
  // Backed by the generated SDK (GetChatSettings / UpdateChatSettings). The SDK serialiser only sends
  // modelled members, so the SDK must model every field sent here (connectionNotifications and
  // likeNotifications need the client generated from the current chat.smithy).
  get: (): Promise<ChatSettings> =>
    callSdk(async () => unwrapSettings(await sdkClient.getChatSettings({}))),

  /** Partial update: send only the fields that changed. */
  update: (patch: Partial<ChatSettings>): Promise<ChatSettings> =>
    callSdk(async () => unwrapSettings(await sdkClient.updateChatSettings(patch))),
};

// ── Swipe (Hinge-style comment-to-like) & received likes ──────────────────────

/** Every LIKE (RIGHT) carries a comment and the liked profile element. */
export type LikeTargetType = 'PHOTO' | 'VIDEO' | 'VOICE' | 'PROMPT' | 'INTEREST' | 'BIO';

/** Backend cap on a like comment (MatchingConstants.LIKE_COMMENT_MAX_CHARS). Enforced client-side. */
export const LIKE_COMMENT_MAX_CHARS = 500;

/** Backend cap on a like target ref (MatchingConstants.LIKE_TARGET_REF_MAX_CHARS). */
export const LIKE_TARGET_REF_MAX_CHARS = 512;

export interface SwipeResult {
  status: string;
  matched: boolean;
  matchId?: string;
}

/** A single received like as returned by GET /matching/likes (newest first). */
export interface ReceivedLike {
  fromUserId: string;
  /**
   * Nullable in the model, which still documents the removed `SwipeByUsername` like. Every like now
   * carries a comment and a target; null is rendered as no comment.
   */
  comment: string | null;
  likeTargetType: string | null;
  likeTargetRef: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface ReceivedLikesResponse {
  likes: ReceivedLike[];
  /** Pass for the likers' matching profiles; absent when there are no likes. */
  viewPass?: string;
  count: number;
}

export const SwipeApi = {
  /**
   * PASS (LEFT). Carries no comment or target — the server ignores both for LEFT anyway.
   */
  pass: (targetId: string, viewedSection?: string): Promise<SwipeResult> =>
    callSdk(async () =>
      body<SwipeResult>(await sdkClient.swipe({ targetId, direction: 'LEFT', viewedSection }))
    ),

  /**
   * LIKE (RIGHT) — Hinge-style: always carries a comment plus the specific element being liked.
   * `likeTargetRef` is required for every type except BIO (the server normalises BIO's ref to
   * "bio"). Rejections surface as an {@link ApiError} (HTTP 400, code BAD_REQUEST) so callers
   * can show the message and refrain from advancing the deck.
   */
  like: (input: {
    targetId: string;
    comment: string;
    likeTargetType: LikeTargetType;
    likeTargetRef?: string;
    viewedSection?: string;
    /** ROSE = a daily-limited super-like (mirrors iOS `likeKind:"ROSE"`); defaults to a normal LIKE. */
    likeKind?: 'LIKE' | 'ROSE';
  }): Promise<SwipeResult> =>
    callSdk(async () =>
      body<SwipeResult>(
        await sdkClient.swipe({
          targetId: input.targetId,
          direction: 'RIGHT',
          comment: input.comment,
          likeTargetType: input.likeTargetType,
          likeTargetRef: input.likeTargetRef,
          viewedSection: input.viewedSection,
          likeKind: input.likeKind,
        })
      )
    ),
};

/** Remaining daily rose (super-like) quota. Mirrors iOS `GET /matching/roses`. */
export interface RoseQuota {
  remaining: number;
  limit: number;
  resetsAt?: string;
}

export const RosesApi = {
  remaining: (): Promise<RoseQuota> =>
    callSdk(async () => body<RoseQuota>(await sdkClient.getRoses({}))),
};

export const ReceivedLikesApi = {
  /**
   * The caller's still-pending received likes (RIGHT/SUPER not yet reciprocated or passed on),
   * newest first. No input — identity is the injected `X-User-Id`.
   */
  list: (): Promise<ReceivedLikesResponse> =>
    callSdk(async () => body<ReceivedLikesResponse>(await sdkClient.getReceivedLikes({}))),
};

// ── Member reports (POST /state/reports) ───────────────────────────────────────

/**
 * Report categories (State `ReportCategory`, state.smithy). Sent by {@link StateApi.reportMember}.
 */
export type ReportCategoryCode =
  | 'HARASSMENT'
  | 'THREATS_VIOLENCE'
  | 'SEXUAL_CONTENT_NONCONSENT'
  | 'MINOR_SAFETY'
  | 'SCAM_FRAUD'
  | 'FAKE_IMPERSONATION'
  | 'SPAM_PROMOTION'
  | 'HATE'
  | 'SELF_HARM_CONCERN'
  | 'OFF_PLATFORM_HARM'
  | 'OTHER';

/** Body of `POST /state/reports` (state.smithy `ReportMemberRequest`). */
export interface CreateReportRequest {
  reportedUserId: string;
  category: ReportCategoryCode;
  /** <= 2000 chars; REQUIRED for OTHER. */
  details?: string;
  /** Defaults server-side to true, except false for SELF_HARM_CONCERN. */
  alsoBlock?: boolean;
  conversationId?: string;
  /** Whether the reporter opted to share a decrypted copy of the chat. */
  evidenceOffered: boolean;
}

/** `201` response of `POST /state/reports` (state.smithy `ReportMemberResponse`). */
export interface CreateReportResponse {
  /** Backend report UUID — the id the evidence presign/complete calls reference. */
  reportId: string;
  severity: string;
  /**
   * Whether the server will accept a decrypted-chat evidence upload for this report. False for
   * MINOR_SAFETY (escalated immediately) and any `evidenceEligible:false` category.
   */
  evidenceAllowed: boolean;
}

// ── Matching tab visibility (PUT /state/matching/tab-hidden) ──────────────────

/**
 * State operation SetMatchingTabHidden (state.smithy): `PUT /state/matching/tab-hidden`
 * `{hidden}` -> 200 `{hidden}`; 400 on a missing or non-boolean `hidden`, 500 otherwise.
 * Callers use `StateApi.setMatchingTabHidden` (api/state.ts).
 */
export interface MatchingTabHiddenResponse {
  hidden: boolean;
}

export const MatchingTabApi = {
  setHidden: (hidden: boolean): Promise<MatchingTabHiddenResponse> =>
    callSdk(async () => {
      const res = await sdkClient.setMatchingTabHidden({ hidden });
      // The answer is authoritative; a body without it means the server stored what was sent.
      return { hidden: typeof res?.hidden === 'boolean' ? res.hidden : hidden };
    }),
};
