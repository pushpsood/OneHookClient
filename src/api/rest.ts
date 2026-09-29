/**
 * Thin authenticated REST helper for endpoints that the generated Smithy SDK
 * (`onehook-api-client@1.0.14`) does NOT yet model.
 *
 * The generated `sdkClient` remains the single source of truth for every operation it exposes
 * (profiles, discovery, state, chat messaging, chat settings, add-by-username, …). This helper now
 * exists ONLY for the matching safety/proximity endpoints, which are implemented on the service and
 * exposed through API Gateway but are not yet declared in `matching.smithy`, so codegen cannot see
 * them:
 *
 *   • GET  /matching/distance/{userId}
 *   • GET|POST|DELETE /matching/blocks
 *
 * Chat settings and add-by-username are served by the SDK as of 1.0.14; the wrappers below keep their
 * original signatures so callers were unaffected by that migration. Once `matching.smithy` declares
 * the block/distance operations and a new SDK is published, the remaining wrappers can move too and
 * this file can go away.
 *
 * It authenticates exactly like `sdk-client.ts` does — the Cognito **ID token** (falling back to the
 * access token) is read from the Amplify auth session and attached as a `Bearer` token — and it
 * throws the shared {@link ApiError} shape so existing UI error handling can pattern-match on it.
 */
import { apiBaseUrl } from '../utils/env.config';
import { ApiError } from '../lib/api-client';
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
    const detail = parsed as { message?: string; code?: string } | string | undefined;
    const message =
      (typeof detail === 'object' && detail?.message) ||
      (typeof detail === 'string' && detail) ||
      `Request failed with status ${res.status}`;
    const code = typeof detail === 'object' ? detail?.code : undefined;
    throw new ApiError(message, res.status, code, parsed);
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

// ── Blocks ──────────────────────────────────────────────────────────────────

export type BlockReason =
  | 'HARASSMENT'
  | 'SPAM'
  | 'FAKE_PROFILE'
  | 'INAPPROPRIATE_CONTENT'
  | 'SAFETY_CONCERN'
  | 'OTHER';

export interface BlockRecord {
  blockedUserId: string;
  reason?: BlockReason;
  details?: string;
  createdAt?: number;
}

export const BlocksApi = {
  list: (): Promise<{ blocks: BlockRecord[] } | BlockRecord[]> =>
    request('GET', '/matching/blocks'),

  create: (blockedUserId: string, reason?: BlockReason, details?: string): Promise<void> =>
    request('POST', '/matching/blocks', { blockedUserId, reason, details }),

  remove: (blockedUserId: string): Promise<void> =>
    request('DELETE', `/matching/blocks/${encodeURIComponent(blockedUserId)}`),
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
}

export const ChatSettingsApi = {
  // Backed by the generated SDK as of onehook-api-client@1.0.14, which added GetChatSettings /
  // UpdateChatSettings. The wrapper shape is kept so callers did not have to change.
  get: async (): Promise<ChatSettings> =>
    (await (sdkClient as any).getChatSettings({})) as ChatSettings,

  /** Partial update — send only the fields that changed. */
  update: async (patch: Partial<ChatSettings>): Promise<ChatSettings> =>
    (await (sdkClient as any).updateChatSettings(patch)) as ChatSettings,
};

// ── Add by username ──────────────────────────────────────────────────────────

/**
 * Send a connection request by username. The server returns a SINGLE constant status regardless of
 * whether the handle exists, is already connected, or is blocked — so callers MUST show identical
 * confirmation copy in every success case and never branch on the result. See
 * {@link ADD_BY_USERNAME_CONFIRMATION}.
 *
 * Backed by the generated SDK as of onehook-api-client@1.0.14 (SwipeByUsername).
 */
export const ConnectApi = {
  byUsername: async (username: string): Promise<{ status: string }> =>
    (await (sdkClient as any).swipeByUsername({ username })) as { status: string },
};

/**
 * The ONLY confirmation copy allowed after an add-by-username request. It must be identical for
 * every outcome so the flow can never reveal whether a handle exists, is already connected, or is
 * blocked.
 */
export const ADD_BY_USERNAME_CONFIRMATION =
  "Request sent — if they add you back, you'll be connected";

// ── Swipe (Hinge-style comment-to-like) & received likes ──────────────────────

/**
 * The service now requires a comment + a liked profile element for every LIKE (RIGHT) and exposes a
 * "likes you" read side (GET /matching/likes). BUT the installed generated SDK
 * (`onehook-api-client@1.0.14`) still models `SwipeRequest` with only
 * `{ targetId, direction, viewedSection }` — it has NO `comment`, `likeTargetType` or
 * `likeTargetRef`, and no `GetReceivedLikes` operation at all. Rather than force the new fields
 * through the stale SDK (they would be silently dropped by the generated serializer), both calls go
 * through this thin REST helper — exactly like the block/distance endpoints above — until a newer
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
  /** null only for legacy add-by-username likes, which carry no comment/target. */
  comment: string | null;
  likeTargetType: string | null;
  likeTargetRef: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface ReceivedLikesResponse {
  likes: ReceivedLike[];
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
   * "bio"). Rejections surface as an {@link ApiError} (HTTP 400, code VALIDATION_FAILED) so callers
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
