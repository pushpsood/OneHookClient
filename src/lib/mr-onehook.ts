/**
 * Mr.OneHook — the in-app, authenticated AI conversation.
 *
 * Mr.OneHook is NOT a person and has no match record: this transcript is local-only (React state +
 * per-user/per-scope localStorage) and must never be surfaced as a match. The only network call is
 * the authenticated member endpoint `POST ${chatbotUrl}/api/member/product-connection-chat`, sent
 * with the Amplify Cognito ACCESS token as a Bearer credential.
 *
 * A conversation has one scope: product-only (no matchId) or exactly one authorized match. Match
 * scope can ground answers in locally-decrypted history, but ONLY after the model asks for more
 * context (`needsMoreContext`) AND the user explicitly approves the excerpts the device selected.
 * Excerpts are never persisted — not in the transcript, not in the session payload, not in logs.
 *
 * Session persistence is tier-gated: only a non-FREE local display tier requests it, and any
 * server-side session denial is handled by transparently retrying the same question without a
 * session so the user still gets an answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { chatbotUrl } from '../utils/env.config';
import { SubscriptionTier } from '../types';
import {
  buildMemberChatRequestBody,
  isSessionErrorCode,
  MEMBER_CHAT_PATH,
  parseMemberChatResponse,
  type MemberChatResponse,
  type MemberSessionMetadata,
  type MrOneHookMessage,
  type MrOneHookMood,
} from './mr-onehook-contract';
import type { ExcerptSelectionRequest, ExcerptSelectionResult } from './mr-onehook-excerpts';

export type { MrOneHookMessage, MrOneHookMood } from './mr-onehook-contract';

// Mirrors ChatbotWidget's failure copy so the AI voice is consistent across surfaces.
const SERVER_ERROR_COPY =
  'Sorry — I got a little overwhelmed there. Give me a moment and try again.';
const NETWORK_ERROR_COPY =
  "Hmm, I can't connect right now. Check your connection and try again in a moment.";

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
  /** Verified local display tier; only a non-FREE tier requests session persistence. */
  tier: SubscriptionTier;
  /** Supplied for match scope so a `needsMoreContext` turn can search local history. */
  resolveLocalExcerpts?: LocalExcerptResolver;
}

export interface UseMrOneHookChat {
  messages: MrOneHookMessage[];
  loading: boolean;
  hasError: boolean;
  mood: MrOneHookMood;
  session: MemberSessionMetadata | null;
  pendingReview: PendingExcerptReview | null;
  send: (text: string) => Promise<void>;
  confirmReview: () => Promise<void>;
  cancelReview: () => void;
  clear: () => void;
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

function loadTranscript(userId: string, scope: MrOneHookScope): MrOneHookMessage[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(transcriptStorageKey(userId, scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MrOneHookMessage[]) : [];
  } catch {
    return [];
  }
}

function saveTranscript(userId: string, scope: MrOneHookScope, messages: MrOneHookMessage[]): void {
  if (typeof window === 'undefined' || !userId) return;
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

/** Reads the Cognito ACCESS token (not the id token) from the current Amplify session. */
async function fetchAccessToken(): Promise<string | null> {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString() || null;
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
  const { userId, scope, tier, resolveLocalExcerpts } = options;
  const matchId = scope.type === 'match' ? scope.matchId : undefined;
  const persistAllowed = tier !== SubscriptionTier.FREE;
  const key = scopeKey(scope);

  const [messages, setMessages] = useState<MrOneHookMessage[]>(() => loadTranscript(userId, scope));
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mood, setMood] = useState<MrOneHookMood>('Happy');
  const [session, setSession] = useState<MemberSessionMetadata | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingExcerptReview | null>(null);

  const sessionIdRef = useRef<string | undefined>(loadSessionId(userId, scope));
  const resolveRef = useRef<LocalExcerptResolver | undefined>(resolveLocalExcerpts);
  resolveRef.current = resolveLocalExcerpts;

  // Reload when the user or scope changes so transcripts/sessions never bleed across accounts/scopes.
  useEffect(() => {
    setMessages(loadTranscript(userId, scope));
    sessionIdRef.current = loadSessionId(userId, scope);
    setSession(null);
    setPendingReview(null);
    setHasError(false);
    setMood('Happy');
    // scope is reconstructed each render; key is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  useEffect(() => {
    saveTranscript(userId, scope, messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, messages]);

  const pushError = useCallback((copy: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content: copy, isError: true }]);
    setMood('Sad');
    setHasError(true);
  }, []);

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
    }): Promise<MemberChatResponse> => {
      const token = await fetchAccessToken();
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
            ? { persist: true, ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}) }
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
        if (isSessionErrorCode(errorBody.error)) {
          // The session can't be used — forget it and answer the same question session-free.
          sessionIdRef.current = undefined;
          persistSessionId(userId, scope, undefined);
          setSession(null);
          response = await attempt(false);
        }
      }

      if (!response.ok) throw new Error('SERVER_ERROR');
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

      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
      setMood(result.mood || 'Happy');
    },
    [applySession, matchId],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || pendingReview) return;

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
        pushError(err instanceof Error && err.message === 'NOT_AUTHENTICATED' ? NETWORK_ERROR_COPY : SERVER_ERROR_COPY);
      } finally {
        setLoading(false);
      }
    },
    [loading, pendingReview, postOnce, handleResult, pushError],
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
      pushError(err instanceof Error && err.message === 'NOT_AUTHENTICATED' ? NETWORK_ERROR_COPY : SERVER_ERROR_COPY);
    } finally {
      setLoading(false);
    }
  }, [pendingReview, loading, postOnce, handleResult, pushError]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  return {
    messages,
    loading,
    hasError,
    mood,
    session,
    pendingReview,
    send,
    confirmReview,
    cancelReview,
    clear,
  };
}
