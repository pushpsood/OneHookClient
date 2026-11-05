/**
 * Mr.OneHook — the in-app, authenticated AI conversation.
 *
 * Mr.OneHook is NOT a person and has no match record: this transcript is local-only (React state +
 * per-user/per-scope localStorage) and must never be surfaced as a match. The only network call is
 * the authenticated member endpoint `POST ${chatbotUrl}/api/member/product-connection-chat`, sent
 * with the Amplify Cognito ID token as a Bearer credential.
 *
 * A conversation has one scope: product-only (no matchId) or exactly one authorized match. Match
 * scope can ground answers in locally-decrypted history, but ONLY after the model asks for more
 * context (`needsMoreContext`) AND the user explicitly approves the excerpts the device selected.
 * Excerpts are never persisted — not in the transcript, not in the session payload, not in logs.
 *
 * Must (free) chats live only in memory and reset when the app is closed (10 messages per UTC day).
 * Session persistence is tier-gated: only a paid (Super / Infinity) local display tier requests it, and any
 * server-side session denial is handled by transparently retrying the same question without a
 * session so the user still gets an answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { chatbotUrl } from '../utils/env.config';
import { isPaidSubscriptionTier } from 'onehook-api-client/membership';
import type { SubscriptionTier } from '../types';
import {
  buildMemberChatRequestBody,
  classifyMemberChatAvailability,
  isSessionErrorCode,
  MEMBER_CHAT_PATH,
  type MemberChatAvailability,
  parseMemberChatResponse,
  matchSuggestionNote,
  type MemberChatResponse,
  type MemberSessionMetadata,
  type MrOneHookMessage,
  type MrOneHookMood,
  parseSessionDetail,
  parseSessionList,
  sessionLimitFromError,
  type SessionListItem,
} from './mr-onehook-contract';
import type { ExcerptSelectionRequest, ExcerptSelectionResult } from './mr-onehook-excerpts';

export type { MrOneHookMessage, MrOneHookMood, SessionListItem } from './mr-onehook-contract';

// Mirrors ChatbotWidget's failure copy so the AI voice is consistent across surfaces.
const SERVER_ERROR_COPY =
  'Sorry — I got a little overwhelmed there. Give me a moment and try again.';
const NETWORK_ERROR_COPY =
  "Hmm, I can't connect right now. Check your connection and try again in a moment.";
// Terminal availability copy — shown once, not retryable, and used to gate the entry point.
const LIMIT_REACHED_COPY =
  'You’ve used today’s 10 free messages with Mr.OneHook. Upgrade to Super to keep chatting, or come back tomorrow.';
const NOT_AUTHENTICATED_COPY =
  'Please sign in again to chat with Mr.OneHook.';
const NOT_CONFIGURED_COPY =
  'Mr.OneHook is temporarily unavailable. Please try again later.';

function availabilityCopy(outcome: Exclude<MemberChatAvailability, 'AVAILABLE'>): string {
  switch (outcome) {
    case 'LIMIT_REACHED':
      return LIMIT_REACHED_COPY;
    case 'NOT_AUTHENTICATED':
      return NOT_AUTHENTICATED_COPY;
    case 'NOT_CONFIGURED':
      return NOT_CONFIGURED_COPY;
  }
}

/** A terminal (non-retryable) member-chat failure carrying its classified availability outcome. */
class MemberChatTerminalError extends Error {
  constructor(readonly outcome: Exclude<MemberChatAvailability, 'AVAILABLE'>) {
    super(outcome);
    this.name = 'MemberChatTerminalError';
  }
}

/** Product-only scope, or a single authorized match. */
export type MrOneHookScope = { type: 'product' } | { type: 'match'; matchId: string };

/** Resolves local, already-decrypted excerpts for a server `contextRequest`. Match scope only. */
export type LocalExcerptResolver = (request: ExcerptSelectionRequest) => ExcerptSelectionResult;

/**
 * A pending excerpt review. While this is set the UI shows the exact excerpts that WOULD be shared
 * and waits for the user to approve (`confirmReview`) or decline (`cancelReview`). No excerpt leaves
 * the device until approval.
 */
export interface PendingExcerptReview {
  excerpts: ExcerptSelectionResult['excerpts'];
  historyTruncated: boolean;
  searchTerms: string[];
  /** Carried so the confirmed retry re-asks the original question with the approved excerpts. */
  message: string;
  contextRequestId?: string;
}

export interface UseMrOneHookChatOptions {
  userId: string;
  scope: MrOneHookScope;
  /** Verified local display tier; only a paid (Super / Infinity) tier requests session persistence. */
  tier: SubscriptionTier;
  /** Supplied for match scope so a `needsMoreContext` turn can search local history. */
  resolveLocalExcerpts?: LocalExcerptResolver;
  /**
   * Super and above: a saved chat from another scope (a match chat while on the product chat, or the
   * reverse) was chosen in the tabs. The host switches to that scope; the session is already remembered.
   */
  onOpenScope?: (scope: MrOneHookScope) => void;
}

export interface UseMrOneHookChat {
  messages: MrOneHookMessage[];
  loading: boolean;
  hasError: boolean;
  mood: MrOneHookMood;
  session: MemberSessionMetadata | null;
  pendingReview: PendingExcerptReview | null;
  /**
   * Terminal availability of Mr.OneHook for this member. 'AVAILABLE' until the backend reports a
   * non-retryable auth/permission/config outcome; the UI should hide or disable the entry point and
   * stop accepting input once this is anything else.
   */
  availability: MemberChatAvailability;
  /** Free tier: messages left today, from the last reply (undefined for Super+ or before the first reply). */
  remainingMessages?: number;
  send: (text: string) => Promise<void>;
  confirmReview: () => Promise<void>;
  cancelReview: () => void;
  clear: () => void;
  /**
   * Super and above: the member's saved chats (all scopes; the total is capped server-side). Empty for
   * Must, whose chat lives only in memory and resets when the app is closed.
   */
  sessions: SessionListItem[];
  refreshSessions: () => Promise<void>;
  /** Opens a saved product chat in this conversation. */
  resumeSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  /**
   * Set when a NEW chat was refused because the member already has the maximum saved chats. The member
   * either replaces the least recent one ({@link replaceLeastRecentAndSend}) or deletes one and sends again.
   */
  sessionLimit: SessionLimit | null;
  replaceLeastRecentAndSend: () => Promise<void>;
  dismissSessionLimit: () => void;
  /** The member agreed to replace the least recent saved chat: the current chat is now a new one. */
  replacing: boolean;
  /** Starts a new chat that replaces the least recent saved chat when its first message is sent. */
  startReplacingLeastRecent: () => void;
  /** The current saved chat's id (undefined for a new, unsaved chat). */
  currentSessionId: string | undefined;
}

/**
 * The chat tabs. Pure, for tests.
 * - Super+: saved chats oldest first ("Chat 1"...), plus "New chat" while the current chat is unsaved.
 *   While replacing, the least recent chat is left out (the new chat takes its place).
 * - Must: one "Chat" tab.
 */
export function mrOneHookTabs(
  sessions: SessionListItem[],
  activeId: string | undefined,
  paid: boolean,
  replacing: boolean,
): Array<{ sessionId?: string; title: string }> {
  if (!paid) return [{ title: 'Chat' }];
  const oldest = leastRecentSession(sessions);
  const saved = [...sessions]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((s) => !(replacing && oldest && s.sessionId === oldest.sessionId));
  const tabs: Array<{ sessionId?: string; title: string }> = saved.map((s, i) => ({
    sessionId: s.sessionId,
    title: `Chat ${i + 1}`,
  }));
  if (!activeId || !saved.some((s) => s.sessionId === activeId)) tabs.push({ title: 'New chat' });
  return tabs;
}

/** The saved chat the server replaces at the limit: the least recently active one. */
export function leastRecentSession(sessions: SessionListItem[]): SessionListItem | undefined {
  return sessions.reduce<SessionListItem | undefined>(
    (min, s) => (!min || s.updatedAt < min.updatedAt ? s : min),
    undefined,
  );
}

/** Remembers which saved chat continues in a scope (used when the tabs switch scope). */
export function rememberSessionForScope(userId: string, scope: MrOneHookScope, sessionId: string): void {
  persistSessionId(userId, scope, sessionId);
}

export interface SessionLimit {
  maxSessions: number;
  sessions: SessionListItem[];
  /** The message that was refused; sent again once there is room. */
  pendingMessage: string;
}

class SessionLimitReachedError extends Error {
  constructor(readonly maxSessions: number, readonly sessions: SessionListItem[]) {
    super('CHAT_SESSION_LIMIT_REACHED');
  }
}

function scopeKey(scope: MrOneHookScope): string {
  return scope.type === 'match' ? `match:${scope.matchId}` : 'product';
}

function transcriptStorageKey(userId: string, scope: MrOneHookScope): string {
  return `onehook.mrOneHook.transcript.${userId}.${scopeKey(scope)}`;
}

function sessionStorageKey(userId: string, scope: MrOneHookScope): string {
  return `onehook.mrOneHook.session.${userId}.${scopeKey(scope)}`;
}

/**
 * Must (free) members' chat lives only in memory: it resets when the app is closed. Removes any transcript
 * an earlier version stored for them on this device.
 */
function forgetStoredTranscript(userId: string, scope: MrOneHookScope): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(transcriptStorageKey(userId, scope));
    window.localStorage.removeItem(sessionStorageKey(userId, scope));
  } catch {
    /* ignore disabled storage */
  }
}

function loadTranscript(userId: string, scope: MrOneHookScope, persistAllowed = true): MrOneHookMessage[] {
  if (typeof window === 'undefined' || !userId || !persistAllowed) return [];
  try {
    const raw = window.localStorage.getItem(transcriptStorageKey(userId, scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MrOneHookMessage[]) : [];
  } catch {
    return [];
  }
}

function saveTranscript(
  userId: string,
  scope: MrOneHookScope,
  messages: MrOneHookMessage[],
  persistAllowed = true,
): void {
  if (typeof window === 'undefined' || !userId || !persistAllowed) return;
  try {
    // Persist only durable turns; error bubbles are transient UI, not conversation history. Excerpts
    // are never part of a transcript turn, so nothing sensitive is written here.
    const durable = messages.filter((m) => !m.isError);
    window.localStorage.setItem(transcriptStorageKey(userId, scope), JSON.stringify(durable));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function loadSessionId(userId: string, scope: MrOneHookScope): string | undefined {
  if (typeof window === 'undefined' || !userId) return undefined;
  try {
    return window.localStorage.getItem(sessionStorageKey(userId, scope)) || undefined;
  } catch {
    return undefined;
  }
}

function persistSessionId(userId: string, scope: MrOneHookScope, sessionId: string | undefined): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const key = sessionStorageKey(userId, scope);
    if (sessionId) window.localStorage.setItem(key, sessionId);
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore quota / disabled storage */
  }
}

/**
 * Reads the Cognito ID token from the current Amplify session. The member route verifies the ID
 * token (it checks `aud` and reads the member's roles/tier from claims the ACCESS token does not
 * carry), so the ID token — not the access token — is the correct bearer here.
 */
async function fetchIdToken(): Promise<string | null> {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}

function toEpochMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : undefined;
}

export function useMrOneHookChat(options: UseMrOneHookChatOptions): UseMrOneHookChat {
  const { userId, scope, tier, resolveLocalExcerpts, onOpenScope } = options;
  const matchId = scope.type === 'match' ? scope.matchId : undefined;
  const persistAllowed = isPaidSubscriptionTier(tier);
  const key = scopeKey(scope);

  const [messages, setMessages] = useState<MrOneHookMessage[]>(() => loadTranscript(userId, scope, persistAllowed));
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mood, setMood] = useState<MrOneHookMood>('Happy');
  const [session, setSession] = useState<MemberSessionMetadata | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingExcerptReview | null>(null);
  const [availability, setAvailability] = useState<MemberChatAvailability>('AVAILABLE');
  const [remainingMessages, setRemainingMessages] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionLimit, setSessionLimit] = useState<SessionLimit | null>(null);
  const [replacing, setReplacing] = useState(false);
  /** Bumped when a reply saves a chat, so the tabs reload the list. */
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const hydratedKeyRef = useRef<string | undefined>(undefined);
  const replacingRef = useRef(false);
  replacingRef.current = replacing;
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const onOpenScopeRef = useRef(onOpenScope);
  onOpenScopeRef.current = onOpenScope;

  const sessionIdRef = useRef<string | undefined>(persistAllowed ? loadSessionId(userId, scope) : undefined);
  const resolveRef = useRef<LocalExcerptResolver | undefined>(resolveLocalExcerpts);
  resolveRef.current = resolveLocalExcerpts;

  // Reload when the user or scope changes so transcripts/sessions never bleed across accounts/scopes.
  useEffect(() => {
    if (!persistAllowed) forgetStoredTranscript(userId, scope);
    setMessages(loadTranscript(userId, scope, persistAllowed));
    sessionIdRef.current = persistAllowed ? loadSessionId(userId, scope) : undefined;
    setSession(null);
    setSessionLimit(null);
    setReplacing(false);
    setPendingReview(null);
    setHasError(false);
    setMood('Happy');
    setAvailability('AVAILABLE');
    // scope is reconstructed each render; key is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, persistAllowed]);

  useEffect(() => {
    saveTranscript(userId, scope, messages, persistAllowed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, messages, persistAllowed]);

  const pushError = useCallback((copy: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content: copy, isError: true }]);
    setMood('Sad');
    setHasError(true);
  }, []);

  /**
   * Routes a thrown error to the right surface: a terminal availability outcome latches
   * `availability` (so the entry point is gated) and shows its one-time copy; everything else is a
   * transient, retryable error bubble.
   */
  const handleFailure = useCallback(
    (err: unknown, pendingMessage?: string) => {
      if (err instanceof SessionLimitReachedError) {
        setSessions(err.sessions);
        setSessionLimit({ maxSessions: err.maxSessions, sessions: err.sessions, pendingMessage: pendingMessage ?? '' });
        setMood('Neutral');
        return;
      }
      if (err instanceof MemberChatTerminalError) {
        setAvailability(err.outcome);
        pushError(availabilityCopy(err.outcome));
        return;
      }
      pushError(
        err instanceof Error && err.message === 'NOT_AUTHENTICATED'
          ? NETWORK_ERROR_COPY
          : SERVER_ERROR_COPY,
      );
    },
    [pushError],
  );

  /**
   * Posts one member request, transparently retrying WITHOUT a session when the server reports a
   * session-level denial (tier not eligible, limit reached, unknown/expired session, storage off).
   */
  const postOnce = useCallback(
    async (init: {
      message: string;
      excerpts?: ExcerptSelectionResult['excerpts'];
      historyTruncated?: boolean;
      userConfirmed?: boolean;
      contextRequestId?: string;
      replaceLeastRecent?: boolean;
    }): Promise<MemberChatResponse> => {
      const token = await fetchIdToken();
      if (!token) throw new Error('NOT_AUTHENTICATED');

      const attempt = async (useSession: boolean): Promise<Response> => {
        const body = buildMemberChatRequestBody({
          message: init.message,
          ...(matchId ? { matchId } : {}),
          includeProfile: true,
          includeMessageHistory: true,
          ...(init.excerpts ? { excerpts: init.excerpts } : {}),
          ...(init.historyTruncated !== undefined ? { historyTruncated: init.historyTruncated } : {}),
          ...(init.userConfirmed !== undefined ? { userConfirmed: init.userConfirmed } : {}),
          ...(init.contextRequestId ? { contextRequestId: init.contextRequestId } : {}),
          ...(useSession && persistAllowed
            ? {
                persist: true,
                ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
                ...(init.replaceLeastRecent || replacingRef.current ? { replaceLeastRecent: true } : {}),
              }
            : {}),
        });
        return fetch(`${chatbotUrl}${MEMBER_CHAT_PATH}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      };

      let response = await attempt(persistAllowed);
      if (!response.ok && persistAllowed) {
        const errorBody = (await response.clone().json().catch(() => ({}))) as { error?: unknown };
        // A NEW saved chat at the limit: let the member choose (replace the least recent, or delete one).
        const limit = sessionLimitFromError(errorBody, Boolean(sessionIdRef.current));
        if (limit) throw new SessionLimitReachedError(limit.maxSessions, limit.sessions);
        if (isSessionErrorCode(errorBody.error)) {
          // The session can't be used — forget it and answer the same question session-free.
          sessionIdRef.current = undefined;
          persistSessionId(userId, scope, undefined);
          setSession(null);
          response = await attempt(false);
        }
      }

      if (!response.ok) {
        // Distinguish a terminal auth/permission/config outcome (not retryable, gates the entry)
        // from a transient server error (retryable bubble). The structured `error` code is the
        // tie-breaker over the HTTP status.
        const errorBody = (await response.clone().json().catch(() => ({}))) as { error?: unknown };
        const outcome = classifyMemberChatAvailability(response.status, errorBody.error);
        if (outcome) throw new MemberChatTerminalError(outcome);
        throw new Error('SERVER_ERROR');
      }
      return parseMemberChatResponse(await response.json());
    },
    // scope captured via key + matchId; persistAllowed derived from tier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, persistAllowed, userId, key],
  );

  const applySession = useCallback(
    (result: MemberChatResponse) => {
      if (result.session) {
        sessionIdRef.current = result.session.sessionId;
        persistSessionId(userId, scope, result.session.sessionId);
        setSession(result.session);
        setCurrentSessionId(result.session.sessionId);
        setReplacing(false);
        setSessionsVersion((v) => v + 1);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [userId, key],
  );

  /** Handles a parsed response: either stage a local excerpt review, or render the final answer. */
  const handleResult = useCallback(
    (result: MemberChatResponse, originalMessage: string) => {
      applySession(result);

      if (result.needsMoreContext && matchId && resolveRef.current && result.contextRequest) {
        const request = result.contextRequest;
        const selection = resolveRef.current({
          searchTerms: request.searchTerms,
          maxMessages: request.maxMessages,
          dateRange: {
            from: toEpochMs(request.dateRange?.from),
            to: toEpochMs(request.dateRange?.to),
          },
        });
        // Surface the model's request-for-context as its turn, then (only if we actually found
        // something locally) stage the excerpts for explicit user review before anything is sent.
        setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
        setMood(result.mood);
        if (selection.excerpts.length > 0) {
          setPendingReview({
            excerpts: selection.excerpts,
            historyTruncated: selection.historyTruncated,
            searchTerms: request.searchTerms,
            message: originalMessage,
            ...(request.requestId ? { contextRequestId: request.requestId } : {}),
          });
        }
        return;
      }

      // A "find me ..." request: say what happened to the suggestion (added to Discover, needs Super, or
      // could not be saved) under the reply.
      const content = result.matchSuggestion
        ? `${result.reply}\n\n${matchSuggestionNote(result.matchSuggestion)}`
        : result.reply;
      setMessages((prev) => [...prev, { role: 'assistant', content }]);
      setMood(result.mood || 'Happy');
      setRemainingMessages(result.remainingMessages);
    },
    [applySession, matchId],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || pendingReview) return;
      // Terminal availability (not entitled / signed out / not configured) — stop accepting input.
      if (availability !== 'AVAILABLE') return;

      const userMessage: MrOneHookMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev.filter((m) => !m.isError), userMessage]);
      setLoading(true);
      setHasError(false);
      setMood('Thinking');

      try {
        // First pass never carries excerpts — the model must ask for context before we share any.
        const result = await postOnce({ message: trimmed });
        handleResult(result, trimmed);
      } catch (err) {
        handleFailure(err, trimmed);
      } finally {
        setLoading(false);
      }
    },
    [loading, pendingReview, availability, postOnce, handleResult, handleFailure],
  );

  const confirmReview = useCallback(async () => {
    if (!pendingReview || loading) return;
    const review = pendingReview;
    setPendingReview(null);
    setLoading(true);
    setHasError(false);
    setMood('Thinking');

    try {
      const result = await postOnce({
        message: review.message,
        excerpts: review.excerpts,
        historyTruncated: review.historyTruncated,
        userConfirmed: true,
        ...(review.contextRequestId ? { contextRequestId: review.contextRequestId } : {}),
      });
      handleResult(result, review.message);
    } catch (err) {
      handleFailure(err);
    } finally {
      setLoading(false);
    }
  }, [pendingReview, loading, postOnce, handleResult, handleFailure]);

  const cancelReview = useCallback(() => {
    setPendingReview(null);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setPendingReview(null);
    setSession(null);
    setHasError(false);
    setMood('Happy');
    // Start a fresh server session on the next message; the prior one lapses per its retention.
    sessionIdRef.current = undefined;
    persistSessionId(userId, scope, undefined);
    setCurrentSessionId(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  const authorizedFetch = useCallback(async (path: string, init?: RequestInit): Promise<Response> => {
    const token = await fetchIdToken();
    if (!token) throw new Error('NOT_AUTHENTICATED');
    return fetch(`${chatbotUrl}${MEMBER_CHAT_PATH}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!persistAllowed) {
      setSessions([]);
      return;
    }
    try {
      const response = await authorizedFetch('/sessions');
      if (response.ok) setSessions(parseSessionList(await response.json()));
    } catch {
      /* the list is a convenience; chatting still works */
    }
  }, [authorizedFetch, persistAllowed]);

  const resumeSession = useCallback(
    async (sessionId: string) => {
      if (!persistAllowed || loading) return;
      try {
        const response = await authorizedFetch(`/sessions/${encodeURIComponent(sessionId)}`);
        const detail = response.ok ? parseSessionDetail(await response.json()) : undefined;
        if (!detail) throw new Error('SERVER_ERROR');
        if ((detail.matchId ?? undefined) !== matchId) {
          // A chat from another scope: remember it there and let the host switch.
          const target: MrOneHookScope = detail.matchId
            ? { type: 'match', matchId: detail.matchId }
            : { type: 'product' };
          persistSessionId(userId, target, detail.sessionId);
          onOpenScopeRef.current?.(target);
          return;
        }
        sessionIdRef.current = detail.sessionId;
        setCurrentSessionId(detail.sessionId);
        setReplacing(false);
        persistSessionId(userId, scope, detail.sessionId);
        setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content })));
        setPendingReview(null);
        setSessionLimit(null);
        setHasError(false);
        setMood('Happy');
      } catch {
        pushError(SERVER_ERROR_COPY);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authorizedFetch, persistAllowed, loading, userId, key, pushError],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!persistAllowed) return;
      const response = await authorizedFetch(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error('SERVER_ERROR');
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      setSessionLimit((prev) => (prev
        ? { ...prev, sessions: prev.sessions.filter((s) => s.sessionId !== sessionId) }
        : prev));
      if (sessionIdRef.current === sessionId) {
        sessionIdRef.current = undefined;
        persistSessionId(userId, scope, undefined);
        setSession(null);
        setMessages([]);
        setCurrentSessionId(undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authorizedFetch, persistAllowed, userId, key],
  );

  const replaceLeastRecentAndSend = useCallback(async () => {
    if (!sessionLimit || loading) return;
    const { pendingMessage } = sessionLimit;
    setSessionLimit(null);
    if (!pendingMessage) return;
    setLoading(true);
    setMood('Thinking');
    try {
      const result = await postOnce({ message: pendingMessage, replaceLeastRecent: true });
      handleResult(result, pendingMessage);
      void refreshSessions();
    } catch (err) {
      handleFailure(err, pendingMessage);
    } finally {
      setLoading(false);
    }
  }, [sessionLimit, loading, postOnce, handleResult, handleFailure, refreshSessions]);

  const dismissSessionLimit = useCallback(() => setSessionLimit(null), []);

  const startReplacingLeastRecent = useCallback(() => {
    clear();
    setReplacing(true);
  }, [clear]);

  // Super and above: load the saved chats for the tabs. The server is the source of truth for a saved
  // chat's turns, so a remembered chat is reloaded from it; with none remembered, the most recent saved
  // chat of this scope opens, rather than starting another.
  useEffect(() => {
    if (!persistAllowed || !userId) {
      setSessions([]);
      setCurrentSessionId(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await authorizedFetch('/sessions');
        if (!response.ok || cancelled) return;
        const list = parseSessionList(await response.json());
        if (cancelled) return;
        setSessions(list);
        const remembered = sessionIdRef.current;
        if (remembered && !list.some((s) => s.sessionId === remembered)) {
          // Deleted elsewhere or expired.
          sessionIdRef.current = undefined;
          persistSessionId(userId, scope, undefined);
        }
        setCurrentSessionId(sessionIdRef.current);
        // Load a chat's turns once per scope; later runs (after a reply saved) only refresh the list.
        const hydrateKey = `${userId}|${key}`;
        if (hydratedKeyRef.current === hydrateKey) return;
        hydratedKeyRef.current = hydrateKey;
        const wanted = sessionIdRef.current
          ?? (scope.type === 'product' && !replacingRef.current
            ? [...list].filter((s) => s.scope === 'product').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
                ?.sessionId
            : undefined);
        if (!wanted) return;
        const detailResponse = await authorizedFetch(`/sessions/${encodeURIComponent(wanted)}`);
        const detail = detailResponse.ok ? parseSessionDetail(await detailResponse.json()) : undefined;
        if (cancelled || !detail) return;
        sessionIdRef.current = detail.sessionId;
        persistSessionId(userId, scope, detail.sessionId);
        setCurrentSessionId(detail.sessionId);
        setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content })));
      } catch {
        /* the tabs are a convenience; chatting still works */
      }
    })();
    return () => {
      cancelled = true;
    };
    // scope is reconstructed each render; key is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, persistAllowed, authorizedFetch, sessionsVersion]);

  return {
    messages,
    loading,
    hasError,
    mood,
    session,
    pendingReview,
    availability,
    remainingMessages,
    send,
    confirmReview,
    cancelReview,
    clear,
    sessions,
    refreshSessions,
    resumeSession,
    deleteSession,
    sessionLimit,
    replaceLeastRecentAndSend,
    dismissSessionLimit,
    replacing,
    startReplacingLeastRecent,
    currentSessionId,
  };
}
