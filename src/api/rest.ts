/**
 * Thin authenticated REST helper for the Matching endpoints whose request bodies the generated
 * Smithy SDK does not serialise the way the service expects (comment-to-like swipes, received likes,
 * roses, suggestions, traditions) and for the partner distance, which is not modelled:
 *
 *   • GET  /matching/distance/{userId}
 *   • POST /matching/swipe, GET /matching/likes, GET /matching/roses
 *   • /matching/suggestions, /matching/traditions
 *
 * Every /matching/* route answers 403 MATCHING_OFF unless the caller's matching is ON, so nothing here
 * may be called for a chat-only member (docs/chat-only-profiles.md §12). Blocks, reports and hook
 * requests are State routes and live in api/state.ts. The one State route here is
 * `PUT /state/matching/tab-hidden` (SetMatchingTabHidden), which the SDK does not model yet.
 *
 * It authenticates exactly like `sdk-client.ts` does — the Cognito **ID token** (falling back to the
 * access token) is read from the Amplify auth session and attached as a `Bearer` token — and it
 * throws the shared {@link ApiError} shape so existing UI error handling can pattern-match on it.
 */
import { apiBaseUrl } from '../utils/env.config';
import { ApiError } from '../lib/api-client';
import { bodyCode } from '../lib/api-errors';
import { sdkClient } from './sdk-client';

/**
 * Reads the caller's Cognito JWT the same way `sdk-client.ts` does: the ID token first (the API
 * Gateway Cognito authorizer validates it), falling back to the access token. Returns null when
 * unauthenticated so the request can still be attempted (and rejected by the server) rather than
 * throwing here.
 */
async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a relative API path against the configured base URL. Mirrors `sdk-client.ts`'s endpoint
 * resolution: on localhost the dev origin is used (the Vite proxy forwards `/matching`, `/chat`,
 * … to the backend), otherwise the absolute `apiBaseUrl` is used.
 */
function resolveUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return window.location.origin + suffix;
  }
  if (apiBaseUrl) {
    if (apiBaseUrl.startsWith('http')) return apiBaseUrl + suffix;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin + suffix;
    }
    return apiBaseUrl + suffix;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + suffix;
  }
  return `http://localhost:3000${suffix}`;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(resolveUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network/transport failure — surface as a 0-status ApiError so callers can distinguish it from
    // a server rejection.
    throw new ApiError(
      err instanceof Error ? err.message : 'Network request failed',
      0,
      'NETWORK_ERROR'
    );
  }

  // Parse the body once; tolerate empty (204) and non-JSON responses.
  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    // Every OneHook API answers `{error: <human message>, code: <CODE>}` (common.smithy ErrorBody).
    const error =
      parsed && typeof parsed === 'object' ? (parsed as { error?: unknown }).error : undefined;
    const message =
      (typeof error === 'string' && error) ||
      (typeof parsed === 'string' && parsed) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, bodyCode(parsed), parsed);
  }

  return parsed as T;
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
    request<DistanceResponse>('GET', `/matching/distance/${encodeURIComponent(userId)}`),
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
  get: (): Promise<MemberSuggestions> => request('GET', '/matching/suggestions'),
  saveOwn: (prompt: string, reasoning: string): Promise<{ suggestionId: string }> =>
    request('POST', '/matching/suggestions', { prompt, reasoning }),
  removeOwn: (): Promise<void> => request('DELETE', '/matching/suggestions'),
  removeOneHook: (): Promise<void> => request('DELETE', '/matching/suggestions/onehook'),
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
  get: (): Promise<{ traditions: TraditionSetting[] }> => request('GET', '/matching/traditions'),
  /** Replaces the opt-outs; an empty list re-enrols in every tradition. */
  setDisabled: (disabled: string[]): Promise<{ traditions: TraditionSetting[] }> =>
    request('PUT', '/matching/traditions', { disabled }),
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
  get: async (): Promise<ChatSettings> => unwrapSettings(await sdkClient.getChatSettings({})),

  /** Partial update: send only the fields that changed. */
  update: async (patch: Partial<ChatSettings>): Promise<ChatSettings> =>
    unwrapSettings(await sdkClient.updateChatSettings(patch)),
};

// ── Swipe (Hinge-style comment-to-like) & received likes ──────────────────────

/**
 * The service now requires a comment + a liked profile element for every LIKE (RIGHT) and exposes a
 * "likes you" read side (GET /matching/likes). BUT the installed generated SDK
 * (`onehook-api-client@1.0.14`) still models `SwipeRequest` with only
 * `{ targetId, direction, viewedSection }` — it has NO `comment`, `likeTargetType` or
 * `likeTargetRef`, and no `GetReceivedLikes` operation at all. Rather than force the new fields
 * through the stale SDK (they would be silently dropped by the generated serializer), both calls go
 * through this thin REST helper — like the distance endpoint above — until a newer
 * SDK models them. The caller's identity is the verified Cognito sub that API Gateway injects as
 * `X-User-Id`; the Bearer token attached by {@link getAuthToken} is all this helper needs to send.
 */
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
    request<SwipeResult>('POST', '/matching/swipe', {
      targetId,
      direction: 'LEFT',
      viewedSection,
    }),

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
    request<SwipeResult>('POST', '/matching/swipe', {
      targetId: input.targetId,
      direction: 'RIGHT',
      comment: input.comment,
      likeTargetType: input.likeTargetType,
      likeTargetRef: input.likeTargetRef,
      viewedSection: input.viewedSection,
      likeKind: input.likeKind,
    }),
};

/** Remaining daily rose (super-like) quota. Mirrors iOS `GET /matching/roses`. */
export interface RoseQuota {
  remaining: number;
  limit: number;
  resetsAt?: string;
}

export const RosesApi = {
  remaining: (): Promise<RoseQuota> => request<RoseQuota>('GET', '/matching/roses'),
};

export const ReceivedLikesApi = {
  /**
   * The caller's still-pending received likes (RIGHT/SUPER not yet reciprocated or passed on),
   * newest first. No input — identity is the injected `X-User-Id`.
   */
  list: (): Promise<ReceivedLikesResponse> =>
    request<ReceivedLikesResponse>('GET', '/matching/likes'),
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
 * `{hidden}` -> 200 `{hidden}`; 400 on a missing or non-boolean `hidden`, 500 otherwise. It goes
 * through this helper because the installed `onehook-api-client` does not model the operation yet.
 * Callers use `StateApi.setMatchingTabHidden` (api/state.ts).
 */
export interface MatchingTabHiddenResponse {
  hidden: boolean;
}

export const MatchingTabApi = {
  setHidden: async (hidden: boolean): Promise<MatchingTabHiddenResponse> => {
    const res = await request<Partial<MatchingTabHiddenResponse> | undefined>(
      'PUT',
      '/state/matching/tab-hidden',
      { hidden }
    );
    // The answer is authoritative; a body without it means the server stored what was sent.
    return { hidden: typeof res?.hidden === 'boolean' ? res.hidden : hidden };
  },
};
