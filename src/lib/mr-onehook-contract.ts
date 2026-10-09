/**
 * Mr.OneHook authenticated chat contract.
 *
 * Typed, framework-free models and (de)serialisers for the OneHook UX Enhancement backend:
 *   • `POST /api/public/product-chat`            — anonymous, product-only (landing widget)
 *   • `POST /api/member/product-connection-chat` — authenticated member product + connection chat
 *   • `GET/DELETE .../sessions[/:id]`            — tier-gated AI-session lifecycle
 *
 * Everything here is pure so the request builder and response parser can be unit-tested without a
 * network. The builder is also the enforcement point for "never send message IDs/keys": an excerpt
 * is reduced to exactly `{ speaker, sentAt, text }` on the way out.
 */

import type { SelectedExcerpt } from './mr-onehook-excerpts';

export type MrOneHookMood = 'Happy' | 'Neutral' | 'Thinking' | 'Sad' | 'Excited';

export const MR_ONEHOOK_MOODS: readonly MrOneHookMood[] = [
  'Happy',
  'Neutral',
  'Thinking',
  'Sad',
  'Excited',
];

/** Anonymous product chat used by the public landing widget. */
export const PUBLIC_PRODUCT_CHAT_PATH = '/api/public/product-chat';
/** Authenticated member product + connection chat (and its `/sessions` sub-routes). */
export const MEMBER_CHAT_PATH = '/api/member/product-connection-chat';

/** A single rendered turn in the local Mr.OneHook transcript. */
export interface MrOneHookMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Transient inline error bubble — styled distinctly and never persisted. */
  isError?: boolean;
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

export interface MemberChatResponse {
  reply: string;
  mood: MrOneHookMood;
  needsMoreContext: boolean;
  contextRequest?: MemberContextRequest;
  contextUsed?: MemberContextUsed;
  requestId?: string;
  session?: MemberSessionMetadata;
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

export interface SessionTurn {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
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
 * persistence, so a tier downgrade or a hit limit never blocks getting an answer.
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
