/**
 * Mr.OneHook authenticated chat contract.
 *
 * Typed, framework-free models and (de)serialisers for the OneHook UX Enhancement backend:
 *   • `POST /api/public/product-chat`            — anonymous, product-only (landing widget)
 *   • `POST /api/member/product-connection-chat` — authenticated member product + connection chat
 *   • `GET/DELETE .../sessions[/:id]`            — saved-session lifecycle (Free 1, Pro 3)
 *   • `.../attachments[/:id[/content]]`           — Mr OneHook Pro file uploads
 *   • `.../mr-onehook-pro[/...]`                  — the Mr OneHook Pro plan and subscription
 *
 * Everything here is pure so the request builder and response parser can be unit-tested without a
 * network. The builder is also the enforcement point for "never send message IDs/keys": an excerpt
 * is reduced to exactly `{ speaker, sentAt, text }` on the way out.
 */

import type { SelectedExcerpt } from './mr-onehook-excerpts';
import {
  AttachmentKind,
  AttachmentSource,
  MrOneHookPlan,
  type ChatAttachmentRef,
} from 'onehook-mr-onehook-client';

export type MrOneHookMood = 'Happy' | 'Neutral' | 'Thinking' | 'Sad' | 'Excited';

export const MR_ONEHOOK_MOODS: readonly MrOneHookMood[] = [
  'Happy',
  'Neutral',
  'Thinking',
  'Sad',
  'Excited',
];

/** A single rendered turn in the local Mr.OneHook transcript. */
export interface MrOneHookMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Transient inline error bubble — styled distinctly and never persisted. */
  isError?: boolean;
  /** Files sent with this (user) turn. Uploaded ones carry an `attachmentId`; match-chat ones do not. */
  attachments?: ChatAttachmentRef[];
}

export interface MrOneHookDemographics {
  gender: string;
  sexualPreference: string;
}

function isMood(value: unknown): value is MrOneHookMood {
  return typeof value === 'string' && (MR_ONEHOOK_MOODS as readonly string[]).includes(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Request
// ─────────────────────────────────────────────────────────────────────────────

export interface MemberChatRequestInit {
  message: string;
  /** Omit for a product-only question. Required to send excerpts or use connection context. */
  matchId?: string;
  includeProfile?: boolean;
  includeMessageHistory?: boolean;
  /** Already selected + user-approved excerpts. Ignored unless a matchId is present. */
  excerpts?: readonly SelectedExcerpt[];
  historyTruncated?: boolean;
  userConfirmed?: boolean;
  /** The `requestId` echoed back from a prior `needsMoreContext` response. */
  contextRequestId?: string;
  /** Request application-readable session persistence (tier-gated server-side). */
  persist?: boolean;
  /** Continue an existing session; implies persistence. */
  sessionId?: string;
  /** `READY` attachments (Mr OneHook Pro), up to 3. Files from a match chat need the same matchId. */
  attachmentIds?: readonly string[];
}

export interface MemberChatRequestBody {
  message: string;
  matchId?: string;
  contextOptions: { includeProfile: boolean; includeMessageHistory: boolean };
  ephemeralMessageContext?: {
    excerpts: SelectedExcerpt[];
    historyTruncated: boolean;
    userConfirmed: boolean;
  };
  contextRequestId?: string;
  sessionOptions?: { persist?: boolean; sessionId?: string };
  attachmentIds?: string[];
}

/**
 * Builds the wire body for the member endpoint.
 *
 * Guarantees:
 *   • Excerpts are reduced to `{ speaker, sentAt, text }` only — no IDs, keys, status or receipts.
 *   • `ephemeralMessageContext` is emitted ONLY with a matchId and message-history enabled, matching
 *     the server's validation so a product-only request can never carry match excerpts.
 *   • `sessionOptions` is omitted entirely for a non-persisted request; a sessionId always implies
 *     `persist: true` (the server rejects a sessionId with persistence disabled).
 *   • `replaceLeastRecent` is never sent: at the plan's cap the server always replaces the least
 *     recently active saved chat and reports it in `evictedSessionIds`.
 *   • `attachmentIds` is emitted only when there is at least one id.
 */
export function buildMemberChatRequestBody(init: MemberChatRequestInit): MemberChatRequestBody {
  const message = init.message.trim();
  if (!message) throw new Error('A message is required');

  const includeProfile = init.includeProfile !== false;
  const includeMessageHistory = init.includeMessageHistory !== false;

  const body: MemberChatRequestBody = {
    message,
    contextOptions: { includeProfile, includeMessageHistory },
  };

  if (init.matchId) body.matchId = init.matchId;

  if (init.matchId && includeMessageHistory && init.excerpts && init.excerpts.length > 0) {
    body.ephemeralMessageContext = {
      // Reduce every excerpt to exactly the three permitted fields — this is the leak guard.
      excerpts: init.excerpts.map((excerpt) => ({
        speaker: excerpt.speaker,
        sentAt: excerpt.sentAt,
        text: excerpt.text,
      })),
      historyTruncated: init.historyTruncated === true,
      userConfirmed: init.userConfirmed === true,
    };
  }

  if (init.contextRequestId) body.contextRequestId = init.contextRequestId;

  if (init.sessionId) {
    body.sessionOptions = { persist: true, sessionId: init.sessionId };
  } else if (init.persist) {
    body.sessionOptions = { persist: true };
  }

  if (init.attachmentIds && init.attachmentIds.length > 0) body.attachmentIds = [...init.attachmentIds];

  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response
// ─────────────────────────────────────────────────────────────────────────────

export interface MemberContextUsed {
  profile: boolean;
  match: boolean;
  messageHistory: boolean;
  messageCount: number;
  chatSession: boolean;
  sessionMessageCount: number;
  /** Attachments read for this turn. */
  attachmentCount: number;
}

export interface MemberContextRequest {
  requestId: string;
  searchTerms: string[];
  dateRange?: { from?: string; to?: string };
  maxMessages: number;
}

export interface MemberSessionMetadata {
  sessionId: string;
  updatedAt: string;
  expiresAt: string;
  messageCount: number;
}

/**
 * Outcome of a "find me ..." request. When the member asks Mr OneHook to find someone, the backend records
 * a OneHook suggestion; people who fit it then appear in Discover as "Mr. OneHook" cards with `reasoning`.
 */
export interface MemberMatchSuggestion {
  /** MATCHING_OFF: the member's matching is off, so there is no Discover feed to add to. */
  status: 'RECORDED' | 'PREMIUM_REQUIRED' | 'MATCHING_OFF' | 'UNAVAILABLE';
  reasoning: string;
}

/** One-line note shown under Mr OneHook's reply for a suggestion outcome. */
export function matchSuggestionNote(suggestion: MemberMatchSuggestion): string {
  switch (suggestion.status) {
    case 'RECORDED':
      return `Added to your Discover feed: ${suggestion.reasoning}`;
    case 'PREMIUM_REQUIRED':
      return 'Upgrade to Super to have Mr. OneHook find people for you.';
    case 'MATCHING_OFF':
      return 'Turn on matching in Settings to get suggestions in Discover.';
    default:
      return "I couldn't save that to your Discover feed right now. Please try again later.";
  }
}

export interface MemberChatResponse {
  reply: string;
  mood: MrOneHookMood;
  needsMoreContext: boolean;
  matchSuggestion?: MemberMatchSuggestion;
  /** Free tier only: messages left today (the server counts; absent for Super and above). */
  remainingMessages?: number;
  contextRequest?: MemberContextRequest;
  contextUsed?: MemberContextUsed;
  requestId?: string;
  session?: MemberSessionMetadata;
  /** Saved chats the server deleted to make room for this new one (least recently active first). */
  evictedSessionIds?: string[];
  /** The member's Mr OneHook plan for this turn. */
  plan?: MrOneHookPlan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseContextRequest(value: unknown): MemberContextRequest | undefined {
  if (!isRecord(value)) return undefined;
  const requestId = typeof value.requestId === 'string' ? value.requestId : '';
  const searchTerms = Array.isArray(value.searchTerms)
    ? value.searchTerms.filter((t): t is string => typeof t === 'string')
    : [];
  const maxMessages =
    typeof value.maxMessages === 'number' && Number.isFinite(value.maxMessages)
      ? value.maxMessages
      : 0;
  const request: MemberContextRequest = { requestId, searchTerms, maxMessages };
  if (isRecord(value.dateRange)) {
    const from = typeof value.dateRange.from === 'string' ? value.dateRange.from : undefined;
    const to = typeof value.dateRange.to === 'string' ? value.dateRange.to : undefined;
    if (from || to) request.dateRange = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }
  return request;
}

function parseContextUsed(value: unknown): MemberContextUsed | undefined {
  if (!isRecord(value)) return undefined;
  const bool = (v: unknown): boolean => v === true;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    profile: bool(value.profile),
    match: bool(value.match),
    messageHistory: bool(value.messageHistory),
    messageCount: num(value.messageCount),
    chatSession: bool(value.chatSession),
    sessionMessageCount: num(value.sessionMessageCount),
    attachmentCount: num(value.attachmentCount),
  };
}

function parseSessionMetadata(value: unknown): MemberSessionMetadata | undefined {
  if (!isRecord(value) || typeof value.sessionId !== 'string') return undefined;
  return {
    sessionId: value.sessionId,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : '',
    messageCount:
      typeof value.messageCount === 'number' && Number.isFinite(value.messageCount)
        ? value.messageCount
        : 0,
  };
}

/**
 * Parses and normalises a member-endpoint JSON body. Tolerant by design — an unexpected shape yields
 * safe defaults (empty reply, Neutral mood) rather than throwing, so a malformed response degrades to
 * a graceful error bubble instead of crashing the chat.
 */
export function parseMemberChatResponse(data: unknown): MemberChatResponse {
  if (!isRecord(data)) {
    return { reply: '', mood: 'Neutral', needsMoreContext: false };
  }
  const response: MemberChatResponse = {
    reply: typeof data.reply === 'string' ? data.reply : '',
    mood: isMood(data.mood) ? data.mood : 'Neutral',
    needsMoreContext: data.needsMoreContext === true,
  };
  if (response.needsMoreContext) {
    const contextRequest = parseContextRequest(data.contextRequest);
    if (contextRequest) response.contextRequest = contextRequest;
  }
  const contextUsed = parseContextUsed(data.contextUsed);
  if (contextUsed) response.contextUsed = contextUsed;
  if (typeof data.requestId === 'string') response.requestId = data.requestId;
  const session = parseSessionMetadata(data.session);
  if (session) response.session = session;
  if (typeof data.remainingMessages === 'number' && Number.isFinite(data.remainingMessages)) {
    response.remainingMessages = Math.max(0, Math.floor(data.remainingMessages));
  }
  if (Array.isArray(data.evictedSessionIds)) {
    const evicted = data.evictedSessionIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (evicted.length > 0) response.evictedSessionIds = evicted;
  }
  if (isMrOneHookPlan(data.plan)) response.plan = data.plan;
  if (isRecord(data.matchSuggestion)
    && (data.matchSuggestion.status === 'RECORDED'
      || data.matchSuggestion.status === 'PREMIUM_REQUIRED'
      || data.matchSuggestion.status === 'MATCHING_OFF'
      || data.matchSuggestion.status === 'UNAVAILABLE')) {
    response.matchSuggestion = {
      status: data.matchSuggestion.status,
      reasoning: typeof data.matchSuggestion.reasoning === 'string' ? data.matchSuggestion.reasoning : '',
    };
  }
  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle (list / read / delete)
// ─────────────────────────────────────────────────────────────────────────────

export type SessionScope = 'product' | 'connection';

export interface SessionListItem {
  sessionId: string;
  scope: SessionScope;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  messageCount: number;
}

function isSessionListItem(value: unknown): value is SessionListItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sessionId === 'string'
    && (v.scope === 'product' || v.scope === 'connection')
    && typeof v.updatedAt === 'string'
    && typeof v.createdAt === 'string';
}

/** Parses `GET .../sessions` (or the `sessions` of a 409 limit response); drops malformed items. */
export function parseSessionList(value: unknown): SessionListItem[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as { sessions?: unknown }).sessions)
      ? (value as { sessions: unknown[] }).sessions
      : [];
  return list.filter(isSessionListItem).map((v) => ({
    sessionId: v.sessionId,
    scope: v.scope,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : '',
    messageCount: typeof v.messageCount === 'number' ? v.messageCount : 0,
  }));
}

/** Parses `GET .../sessions/:id` into display turns; undefined when malformed. */
export function parseSessionDetail(value: unknown): SessionDetail | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = (value as { session?: unknown }).session ?? value;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.sessionId !== 'string' || !Array.isArray(v.messages)) return undefined;
  const messages = v.messages
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => {
      const attachments = parseAttachmentRefs(m.attachments);
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
        ...(attachments.length > 0 ? { attachments } : {}),
      };
    });
  return {
    sessionId: v.sessionId,
    ...(typeof v.matchId === 'string' ? { matchId: v.matchId } : {}),
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
    expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : '',
    messages,
  };
}

export interface SessionTurn {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Files sent with this (user) turn. */
  attachments?: ChatAttachmentRef[];
}

export interface SessionDetail {
  sessionId: string;
  matchId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  messages: SessionTurn[];
}

/**
 * Server error codes that mean "this session cannot be persisted/continued for this caller". The
 * client reacts by forgetting the stored sessionId and retrying the SAME question without
 * persistence, so a plan change or storage outage never blocks getting an answer.
 *
 * `CHAT_SESSION_LIMIT_REACHED` is now only a race (a concurrent request filled the plan's sessions at
 * save time): the client first retries once as is ({@link isSessionLimitRace}), and only then falls
 * back to a session-free answer.
 */
export const SESSION_ERROR_CODES: ReadonlySet<string> = new Set([
  'CHAT_SESSION_NOT_FOUND',
  'CHAT_SESSION_LIMIT_REACHED',
  'CHAT_SESSION_NOT_INCLUDED_IN_TIER',
  'CHAT_SESSION_STORAGE_NOT_CONFIGURED',
  'CHAT_SESSION_STORAGE_TEMPORARILY_UNAVAILABLE',
]);

export function isSessionErrorCode(code: unknown): boolean {
  return typeof code === 'string' && SESSION_ERROR_CODES.has(code);
}

/** 409 `CHAT_SESSION_LIMIT_REACHED`: a concurrent request filled the plan's saved chats. Retry once. */
export function isSessionLimitRace(status: number, code: unknown): boolean {
  return status === 409 && code === 'CHAT_SESSION_LIMIT_REACHED';
}

/**
 * Why a member request was refused in a way the UI must treat as terminal (not a transient "try
 * again"). These map to the backend auth/permission gate on `POST .../product-connection-chat`:
 *
 *   • LIMIT_REACHED     — HTTP 402 `MESSAGE_LIMIT_REACHED`: a member on the Free plan has used today's
 *                         10 messages. Every member can chat; this resets at the next UTC midnight or
 *                         with Mr OneHook Pro.
 *   • NOT_AUTHENTICATED — HTTP 401 `AUTH_REQUIRED` / `INVALID_ACCESS_TOKEN`: the session is missing or
 *                         expired; prompt the user to sign in again.
 *   • NOT_CONFIGURED    — HTTP 404 `ENDPOINT_NOT_FOUND` / 503 `CONTEXT_NOT_CONFIGURED`: the feature is
 *                         not enabled in this environment. Treat as unavailable, not as a user error.
 */
export type MemberChatAvailability =
  | 'AVAILABLE'
  | 'LIMIT_REACHED'
  | 'NOT_AUTHENTICATED'
  | 'NOT_CONFIGURED';

const LIMIT_REACHED_CODES: ReadonlySet<string> = new Set(['MESSAGE_LIMIT_REACHED']);
const NOT_AUTHENTICATED_CODES: ReadonlySet<string> = new Set([
  'AUTH_REQUIRED',
  'INVALID_ACCESS_TOKEN',
]);
const NOT_CONFIGURED_CODES: ReadonlySet<string> = new Set([
  'ENDPOINT_NOT_FOUND',
  'CONTEXT_NOT_CONFIGURED',
]);

/**
 * Classifies a failed member-chat HTTP response into a terminal availability outcome, or returns
 * undefined when the failure is NOT one of these (i.e. a transient/server error, OR a
 * recognised-but-unrelated per-request error such as a validation/session code the caller handles
 * elsewhere). The structured `error` code is authoritative; the HTTP status is only a fallback when
 * no recognised code is present.
 */
export function classifyMemberChatAvailability(
  status: number,
  errorCode: unknown,
): Exclude<MemberChatAvailability, 'AVAILABLE'> | undefined {
  const code = typeof errorCode === 'string' ? errorCode : '';
  if (code) {
    if (LIMIT_REACHED_CODES.has(code)) return 'LIMIT_REACHED';
    if (NOT_AUTHENTICATED_CODES.has(code)) return 'NOT_AUTHENTICATED';
    if (NOT_CONFIGURED_CODES.has(code)) return 'NOT_CONFIGURED';
    // A recognised-but-unrelated code (session/validation) is not a feature-availability outcome.
    return undefined;
  }
  if (status === 402) return 'LIMIT_REACHED';
  if (status === 401) return 'NOT_AUTHENTICATED';
  if (status === 404) return 'NOT_CONFIGURED';
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans (Free / Pro)
// ─────────────────────────────────────────────────────────────────────────────

const PLANS: readonly string[] = Object.values(MrOneHookPlan);

export function isMrOneHookPlan(value: unknown): value is MrOneHookPlan {
  return typeof value === 'string' && PLANS.includes(value);
}

/** Notice shown when a reply's `evictedSessionIds` removed saved chats. */
export function evictionNotice(count: number): string {
  return count > 1 ? 'Your oldest chats were replaced' : 'Your oldest chat was replaced';
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments
// ─────────────────────────────────────────────────────────────────────────────

const ATTACHMENT_KINDS: readonly string[] = Object.values(AttachmentKind);
const ATTACHMENT_SOURCES: readonly string[] = Object.values(AttachmentSource);

/** Parses `ChatSessionMessage.attachments`; drops malformed refs. */
export function parseAttachmentRefs(value: unknown): ChatAttachmentRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter(
      (a) =>
        typeof a.name === 'string'
        && typeof a.kind === 'string' && ATTACHMENT_KINDS.includes(a.kind)
        && typeof a.source === 'string' && ATTACHMENT_SOURCES.includes(a.source),
    )
    .map((a) => ({
      ...(typeof a.attachmentId === 'string' && a.attachmentId ? { attachmentId: a.attachmentId } : {}),
      name: a.name as string,
      kind: a.kind as AttachmentKind,
      ...(typeof a.sizeBytes === 'number' && Number.isFinite(a.sizeBytes) ? { sizeBytes: a.sizeBytes } : {}),
      source: a.source as AttachmentSource,
    }));
}

/** How a chip labels a file of a saved turn: uploads open; match-chat files were never kept. */
export function attachmentRefLabel(ref: ChatAttachmentRef): string {
  return ref.attachmentId ? ref.name : `${ref.name} · From your chat`;
}

/**
 * Why an attachment upload, its status poll, or a chat turn that carries attachments was refused.
 *
 *   • UNSUPPORTED_TYPE            — 415 `UNSUPPORTED_ATTACHMENT_TYPE`
 *   • TOO_LARGE                   — 413 `ATTACHMENT_TOO_LARGE` (over 5 MiB)
 *   • PROCESSING_UNAVAILABLE      — 429 `ATTACHMENT_PROCESSING_UNAVAILABLE` (burst or monthly allowance;
 *                                   chat still works; `retryAt` says when files work again)
 *   • RATE_LIMITED                — 429 `RATE_LIMITED` (transient)
 *   • PRO_REQUIRED                — 403 `PRO_REQUIRED`: open the Pro screen
 *   • MESSAGE_CONTEXT_NOT_ALLOWED — 403: the match does not allow its message history to be used
 *   • MATCH_NOT_AVAILABLE         — 404: the match is gone
 *   • NOT_FOUND                   — 404 `ATTACHMENT_NOT_FOUND` (expired, or another member's)
 *   • NOT_READY                   — 409 `ATTACHMENT_NOT_READY`: still processing, keep polling
 *   • NOT_USABLE                  — 400 `ATTACHMENT_NOT_USABLE` (failed processing, or another chat's)
 *   • NOT_CONFIGURED              — 404 `ENDPOINT_NOT_FOUND` / 503 `ATTACHMENTS_NOT_CONFIGURED`
 *   • NOT_AUTHENTICATED           — 401
 *   • INVALID                     — 400 `INVALID_ATTACHMENT_REQUEST`
 *   • UNAVAILABLE                 — anything else (503 temporarily unavailable, 500, unknown)
 */
export type AttachmentProblemKind =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'PROCESSING_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PRO_REQUIRED'
  | 'MESSAGE_CONTEXT_NOT_ALLOWED'
  | 'MATCH_NOT_AVAILABLE'
  | 'NOT_FOUND'
  | 'NOT_READY'
  | 'NOT_USABLE'
  | 'NOT_CONFIGURED'
  | 'NOT_AUTHENTICATED'
  | 'INVALID'
  | 'UNAVAILABLE';

export interface AttachmentProblem {
  kind: AttachmentProblemKind;
  /** ISO-8601, PROCESSING_UNAVAILABLE only: when files can be processed again. */
  retryAt?: string;
}

const ATTACHMENT_CODES: Readonly<Record<string, AttachmentProblemKind>> = {
  UNSUPPORTED_ATTACHMENT_TYPE: 'UNSUPPORTED_TYPE',
  ATTACHMENT_TOO_LARGE: 'TOO_LARGE',
  PAYLOAD_TOO_LARGE: 'TOO_LARGE',
  ATTACHMENT_PROCESSING_UNAVAILABLE: 'PROCESSING_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  PRO_REQUIRED: 'PRO_REQUIRED',
  MESSAGE_CONTEXT_NOT_ALLOWED: 'MESSAGE_CONTEXT_NOT_ALLOWED',
  MATCH_NOT_AVAILABLE: 'MATCH_NOT_AVAILABLE',
  ATTACHMENT_NOT_FOUND: 'NOT_FOUND',
  ATTACHMENT_NOT_READY: 'NOT_READY',
  ATTACHMENT_NOT_USABLE: 'NOT_USABLE',
  ENDPOINT_NOT_FOUND: 'NOT_CONFIGURED',
  ATTACHMENTS_NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_REQUIRED: 'NOT_AUTHENTICATED',
  INVALID_ACCESS_TOKEN: 'NOT_AUTHENTICATED',
  INVALID_ATTACHMENT_REQUEST: 'INVALID',
};

/** Classifies a failed attachment call (or an attachment-related chat-turn refusal). Code wins over status. */
export function classifyAttachmentError(status: number, body: unknown): AttachmentProblem {
  const record = isRecord(body) ? body : {};
  const code = typeof record.error === 'string' ? record.error : '';
  const retryAt = typeof record.retryAt === 'string' && record.retryAt ? record.retryAt : undefined;
  const known = ATTACHMENT_CODES[code];
  const kind: AttachmentProblemKind = known
    ?? (status === 415 ? 'UNSUPPORTED_TYPE'
      : status === 413 ? 'TOO_LARGE'
        : status === 401 ? 'NOT_AUTHENTICATED'
          : status === 429 ? 'RATE_LIMITED'
            : 'UNAVAILABLE');
  return kind === 'PROCESSING_UNAVAILABLE' && retryAt ? { kind, retryAt } : { kind };
}

/** Chat-turn codes that are about the turn's attachments (handled by the attachment flow, not as errors). */
const CHAT_TURN_ATTACHMENT_CODES: ReadonlySet<string> = new Set([
  'PRO_REQUIRED',
  'ATTACHMENT_NOT_READY',
  'ATTACHMENT_NOT_USABLE',
  'ATTACHMENT_NOT_FOUND',
  'MESSAGE_CONTEXT_NOT_ALLOWED',
]);

/** A refused chat turn that the attachment flow handles, or undefined for any other failure. */
export function chatTurnAttachmentProblem(status: number, code: unknown): AttachmentProblem | undefined {
  if (typeof code !== 'string' || !CHAT_TURN_ATTACHMENT_CODES.has(code)) return undefined;
  return classifyAttachmentError(status, { error: code });
}

/** Shown when files hit the processing allowance; chat keeps working. */
export const ATTACHMENT_HEAVY_USAGE_COPY =
  "Files can't be processed right now because of heavy usage. You can keep chatting.";

export const MESSAGE_CONTEXT_NOT_ALLOWED_COPY =
  "This match doesn't allow Mr OneHook to use your conversation, so files they sent can't be shared. Files you sent can still be used.";

/** One-line copy for an attachment problem. `formatTime` renders `retryAt` (defaults to the locale time). */
export function attachmentProblemCopy(
  problem: AttachmentProblem,
  formatTime: (iso: string) => string = (iso) =>
    new Date(iso).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }),
): string {
  switch (problem.kind) {
    case 'UNSUPPORTED_TYPE':
      return 'This type of file isn’t supported.';
    case 'TOO_LARGE':
      return 'This file is over 5 MB.';
    case 'PROCESSING_UNAVAILABLE':
      return problem.retryAt
        ? `${ATTACHMENT_HEAVY_USAGE_COPY} Files work again from ${formatTime(problem.retryAt)}.`
        : ATTACHMENT_HEAVY_USAGE_COPY;
    case 'RATE_LIMITED':
      return 'Too many requests. Try again in a minute.';
    case 'PRO_REQUIRED':
      return 'Sending files needs Mr OneHook Pro.';
    case 'MESSAGE_CONTEXT_NOT_ALLOWED':
      return MESSAGE_CONTEXT_NOT_ALLOWED_COPY;
    case 'MATCH_NOT_AVAILABLE':
      return 'This conversation is no longer available.';
    case 'NOT_FOUND':
      return 'This file has expired. Attach it again.';
    case 'NOT_READY':
      return 'Still reading this file…';
    case 'NOT_USABLE':
      return 'This file couldn’t be read. Remove it and try again.';
    case 'NOT_CONFIGURED':
      return 'Files aren’t available right now.';
    case 'NOT_AUTHENTICATED':
      return 'Please sign in again.';
    case 'INVALID':
      return 'This file couldn’t be uploaded.';
    default:
      return 'This file couldn’t be processed right now. Try again later.';
  }
}

/** Copy for a `FAILED` attachment's `failureReason`. */
export function attachmentFailureCopy(reason: string | undefined): string {
  switch (reason) {
    case 'UNREADABLE':
      return 'Nothing could be read from this file.';
    case 'TOO_LONG':
      return 'This file is too long to process.';
    case 'PROCESSING_UNAVAILABLE':
      return ATTACHMENT_HEAVY_USAGE_COPY;
    default:
      return 'This file couldn’t be read.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mr OneHook Pro (purchase, auto-renew, "Keep Pro", notices)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a Pro call was refused:
 *
 *   • PAYMENT_DECLINED             — 402: nothing was bought
 *   • INCLUDED_IN_MEMBERSHIP       — 409 `PRO_INCLUDED_IN_MEMBERSHIP`: nothing was charged
 *   • ALREADY_ACTIVE               — 409 `PRO_ALREADY_ACTIVE`
 *   • PURCHASE_IN_PROGRESS         — 409 `PRO_PURCHASE_IN_PROGRESS`
 *   • MEMBERSHIP_NOT_ENDING        — 409: "Keep Pro" needs a membership that includes Pro and is set to end
 *   • CONTINUATION_ALREADY_STARTED — 409: the kept plan's first charge was made (turn auto-renew off)
 *   • PAUSED_FOR_MEMBERSHIP        — 409: the membership covers Pro now; nothing renews
 *   • SUBSCRIPTION_NOT_FOUND       — 404 `PRO_SUBSCRIPTION_NOT_FOUND`
 *   • COMING_SOON                  — 503 `PAYMENTS_NOT_CONFIGURED`
 *   • PRO_OFF                      — 404 `ENDPOINT_NOT_FOUND`: Pro is off; hide its entry points
 *   • NOT_AUTHENTICATED            — 401
 *   • RATE_LIMITED                 — 429
 *   • INVALID                      — 400 `INVALID_PRO_REQUEST`
 *   • UNAVAILABLE                  — 503 `PRO_TEMPORARILY_UNAVAILABLE`, 500, network, unknown
 */
export type ProProblem =
  | 'PAYMENT_DECLINED'
  | 'INCLUDED_IN_MEMBERSHIP'
  | 'ALREADY_ACTIVE'
  | 'PURCHASE_IN_PROGRESS'
  | 'MEMBERSHIP_NOT_ENDING'
  | 'CONTINUATION_ALREADY_STARTED'
  | 'PAUSED_FOR_MEMBERSHIP'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'COMING_SOON'
  | 'PRO_OFF'
  | 'NOT_AUTHENTICATED'
  | 'RATE_LIMITED'
  | 'INVALID'
  | 'UNAVAILABLE';

const PRO_CODES: Readonly<Record<string, ProProblem>> = {
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  PRO_INCLUDED_IN_MEMBERSHIP: 'INCLUDED_IN_MEMBERSHIP',
  PRO_ALREADY_ACTIVE: 'ALREADY_ACTIVE',
  PRO_PURCHASE_IN_PROGRESS: 'PURCHASE_IN_PROGRESS',
  MEMBERSHIP_NOT_ENDING: 'MEMBERSHIP_NOT_ENDING',
  CONTINUATION_ALREADY_STARTED: 'CONTINUATION_ALREADY_STARTED',
  PRO_PAUSED_FOR_MEMBERSHIP: 'PAUSED_FOR_MEMBERSHIP',
  PRO_SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  PAYMENTS_NOT_CONFIGURED: 'COMING_SOON',
  ENDPOINT_NOT_FOUND: 'PRO_OFF',
  AUTH_REQUIRED: 'NOT_AUTHENTICATED',
  INVALID_ACCESS_TOKEN: 'NOT_AUTHENTICATED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_PRO_REQUEST: 'INVALID',
  PRO_TEMPORARILY_UNAVAILABLE: 'UNAVAILABLE',
};

/** Classifies a failed Pro call. The structured code wins; the status is the fallback. */
export function classifyProError(status: number, code: unknown): ProProblem {
  const known = typeof code === 'string' ? PRO_CODES[code] : undefined;
  if (known) return known;
  if (status === 402) return 'PAYMENT_DECLINED';
  if (status === 401) return 'NOT_AUTHENTICATED';
  if (status === 404 && !code) return 'PRO_OFF';
  if (status === 429) return 'RATE_LIMITED';
  return 'UNAVAILABLE';
}

export function proProblemCopy(problem: ProProblem): string {
  switch (problem) {
    case 'PAYMENT_DECLINED':
      return 'Your payment was declined. Nothing was charged.';
    case 'INCLUDED_IN_MEMBERSHIP':
      return 'Your membership already includes Mr OneHook Pro. Nothing was charged.';
    case 'ALREADY_ACTIVE':
      return 'You already have Mr OneHook Pro.';
    case 'PURCHASE_IN_PROGRESS':
      return 'Your purchase is still being processed. Check back in a moment.';
    case 'MEMBERSHIP_NOT_ENDING':
      return 'Your membership isn’t set to end, so there is nothing to keep yet.';
    case 'CONTINUATION_ALREADY_STARTED':
      return 'Your Mr OneHook Pro plan has already started. Turn off auto-renew instead.';
    case 'PAUSED_FOR_MEMBERSHIP':
      return 'Your membership covers Mr OneHook Pro now, so nothing renews.';
    case 'SUBSCRIPTION_NOT_FOUND':
      return 'You don’t have a Mr OneHook Pro subscription.';
    case 'COMING_SOON':
      return 'Buying Mr OneHook Pro is coming soon.';
    case 'PRO_OFF':
      return 'Mr OneHook Pro isn’t available right now.';
    case 'NOT_AUTHENTICATED':
      return 'Please sign in again.';
    case 'RATE_LIMITED':
      return 'Too many requests. Try again in a minute.';
    case 'INVALID':
      return 'That request couldn’t be completed.';
    default:
      return 'Mr OneHook Pro is temporarily unavailable. Please try again later.';
  }
}
