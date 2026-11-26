/**
 * Mr.OneHook — the in-app, authenticated AI conversation.
 *
 * Mr.OneHook is NOT a person and has no match record: this transcript is local-only (React state +
 * per-user/per-scope localStorage) and must never be surfaced as a match. Every network call goes
 * through the published `onehook-mr-onehook-client` (`mrOneHookClient`): the member chat
 * turn (ProductConnectionChat) and the saved-chat routes, each with the Amplify Cognito ID token as a
 * Bearer credential.
 *
 * A conversation has one scope: product-only (no matchId) or exactly one authorized match. Match
 * scope can ground answers in locally-decrypted history, but ONLY after the model asks for more
 * context (`needsMoreContext`) AND the user explicitly approves the excerpts the device selected.
 * Excerpts are never persisted — not in the transcript, not in the session payload, not in logs.
 *
 * Plans (from `GET /api/member/mr-onehook-pro` and `plan` in every reply): Free (Must and Super) gets
 * 10 messages per UTC day and 1 saved chat; Pro (a Pro subscription, or a membership that includes it)
 * gets unlimited messages, 3 saved chats and files. Every signed-in member saves chats: at the plan's
 * cap a new chat replaces the least recently active one on the server, and the reply lists it in
 * `evictedSessionIds` (the tab goes, and a short notice says so). Any other server-side session denial
 * is handled by transparently retrying the same question without a session so the user still gets an
 * answer.
 *
 * Files (Pro): see `mr-onehook-attachments.ts` for the upload → poll → send flow; this module wires it
 * to the generated SDK ({@link sdkAttachmentDeps}, {@link useMrOneHookAttachments}).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttachmentKind,
  AttachmentSource,
  AttachmentStatus,
  MrOneHookPlan,
  type ChatAttachment,
  type ChatAttachmentRef,
  type ProductConnectionChatCommandInput,
} from 'onehook-mr-onehook-client';
import { fetchIdToken, mrOneHookClient, sdkFailure, withoutMetadata } from '../api/external-sdk-clients';
import {
  ATTACHMENTS_ONLY_TURN_TEXT,
  buildMemberChatRequestBody,
  chatTurnAttachmentProblem,
  classifyMemberChatAvailability,
  classifyAttachmentError,
  evictionNotice,
  isSessionErrorCode,
  isSessionLimitRace,
  type AttachmentProblem,
  type MemberChatAvailability,
  parseMemberChatResponse,
  matchSuggestionNote,
  type MemberChatResponse,
  type MemberSessionMetadata,
  type MrOneHookMessage,
  type MrOneHookMood,
  parseSessionDetail,
  parseSessionList,
  type SessionListItem,
} from './mr-onehook-contract';
import type { ExcerptSelectionRequest, ExcerptSelectionResult, SelectedExcerpt } from './mr-onehook-excerpts';
import { noteMessageHistoryNotAllowed } from './mr-onehook-ask';
import {
  ATTACHMENT_POLL_MIN_GAP_MS,
  createPollGate,
  encodeAttachmentName,
  runAttachment,
  selectAttachments,
  type AttachmentCallResult,
  type AttachmentDeps,
  type AttachmentOrigin,
  type LocalFile,
  type PendingAttachment,
  type SelectionRejection,
} from './mr-onehook-attachments';


/** A saved-chat call's result: the output, or the HTTP status of a failure (a network error throws). */
type SessionCallResult = { ok: true; data: unknown } | { ok: false; status: number };

async function sessionCall(call: () => Promise<object>): Promise<SessionCallResult> {
  try {
    return { ok: true, data: withoutMetadata(await call()) };
  } catch (err) {
    const failure = sdkFailure(err);
    if (!failure) throw err;
    return { ok: false, status: failure.status };
  }
}

export type { MrOneHookMessage, MrOneHookMood, SessionListItem } from './mr-onehook-contract';

// Mirrors ChatbotWidget's failure copy so the AI voice is consistent across surfaces.
const SERVER_ERROR_COPY =
  'Sorry — I got a little overwhelmed there. Give me a moment and try again.';
const NETWORK_ERROR_COPY =
  "Hmm, I can't connect right now. Check your connection and try again in a moment.";
// Terminal availability copy — shown once, not retryable, and used to gate the entry point.
const LIMIT_REACHED_COPY =
  'You’ve used today’s 10 free messages with Mr.OneHook. Get Mr OneHook Pro for unlimited messages, or come back tomorrow.';
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

/** A turn the attachment flow handles (Pro needed, a file not ready / not usable, match history not allowed). */
class AttachmentTurnError extends Error {
  constructor(readonly problem: AttachmentProblem) {
    super(problem.kind);
    this.name = 'AttachmentTurnError';
  }
}

/** What happened to a sent turn, so the composer can restore the text or open the Pro screen. */
export type SendOutcome =
  | { status: 'sent' }
  | { status: 'failed' }
  | { status: 'skipped' }
  | { status: 'attachment_problem'; problem: AttachmentProblem };

/** Files sent with a turn: their ids, and the refs shown as chips on the user's bubble. */
export interface TurnAttachments {
  ids: string[];
  refs: ChatAttachmentRef[];
}

/**
 * Messages the member picked in a match chat ("Ask Mr OneHook about messages and files") and confirmed
 * after seeing exactly what would be shared. Sent once, with the next question, as
 * `ephemeralMessageContext` with `userConfirmed: true`. Match scope only; never stored.
 */
export interface ConfirmedExcerpts {
  excerpts: SelectedExcerpt[];
  historyTruncated: boolean;
}

/** Shown when a match does not allow its messages to be shared with Mr OneHook (403 MESSAGE_CONTEXT_NOT_ALLOWED). */
export const MESSAGE_HISTORY_NOT_ALLOWED_COPY =
  "This match doesn't allow Mr OneHook to use your conversation, so messages from it can't be shared.";

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
  /** A reply reported the member's Mr OneHook plan (e.g. it changed since the Pro status was read). */
  onPlan?: (plan: MrOneHookPlan) => void;
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
  /** Free plan: messages left today, from the last reply (undefined on Pro or before the first reply). */
  remainingMessages?: number;
  /** `confirmed`: messages the member picked and confirmed in the match chat (match scope only). */
  send: (text: string, attachments?: TurnAttachments, confirmed?: ConfirmedExcerpts) => Promise<SendOutcome>;
  confirmReview: () => Promise<void>;
  cancelReview: () => void;
  clear: () => void;
  /** The member's saved chats (all scopes; the plan caps the total server-side: Free 1, Pro 3). */
  sessions: SessionListItem[];
  refreshSessions: () => Promise<void>;
  /** Opens a saved product chat in this conversation. */
  resumeSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  /** "Your oldest chat was replaced": set when a reply's `evictedSessionIds` removed saved chats. */
  evictionNotice: string | null;
  dismissEvictionNotice: () => void;
  /**
   * The member started a new chat at the plan's cap: the least recent saved chat is left out of the tabs
   * (the server replaces it when the first message is saved).
   */
  replacing: boolean;
  /** Starts a new chat that replaces the least recent saved chat when its first message is sent. */
  startReplacingLeastRecent: () => void;
  /** The current saved chat's id (undefined for a new, unsaved chat). */
  currentSessionId: string | undefined;
}

/**
 * The chat tabs. Pure, for tests. Every plan: saved chats oldest first ("Chat 1"...), plus "New chat"
 * while the current chat is unsaved. While replacing, the least recent chat is left out (the new chat
 * takes its place).
 */
export function mrOneHookTabs(
  sessions: SessionListItem[],
  activeId: string | undefined,
  replacing: boolean,
): Array<{ sessionId?: string; title: string }> {
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

/**
 * Applies a reply's `evictedSessionIds` to the saved-chat list: those tabs go. Pure, for tests. Returns
 * the remaining sessions and the notice to show (null when nothing was evicted).
 */
export function applyEvictions(
  sessions: SessionListItem[],
  evictedSessionIds: readonly string[] | undefined,
): { sessions: SessionListItem[]; notice: string | null } {
  if (!evictedSessionIds || evictedSessionIds.length === 0) return { sessions, notice: null };
  const evicted = new Set(evictedSessionIds);
  return { sessions: sessions.filter((s) => !evicted.has(s.sessionId)), notice: evictionNotice(evicted.size) };
}

/** Forgets a scope's remembered session when the server evicted it. */
function forgetEvictedSessionIds(userId: string, scopes: MrOneHookScope[], evicted: readonly string[]): void {
  for (const scope of scopes) {
    const remembered = loadSessionId(userId, scope);
    if (remembered && evicted.includes(remembered)) persistSessionId(userId, scope, undefined);
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

/**
 * Reads the Cognito ID token from the current Amplify session. The member route verifies the ID
 * token (it checks `aud` and reads the member's roles/tier from claims the ACCESS token does not
 * carry), so the ID token — not the access token — is the correct bearer here.
 */
function toEpochMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : undefined;
}

export function useMrOneHookChat(options: UseMrOneHookChatOptions): UseMrOneHookChat {
  const { userId, scope, resolveLocalExcerpts, onOpenScope } = options;
  const matchId = scope.type === 'match' ? scope.matchId : undefined;
  // Every signed-in member saves chats (Free 1, Pro 3); the server enforces the cap.
  const persistAllowed = Boolean(userId);
  const key = scopeKey(scope);

  const [messages, setMessages] = useState<MrOneHookMessage[]>(() => loadTranscript(userId, scope));
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mood, setMood] = useState<MrOneHookMood>('Happy');
  const [session, setSession] = useState<MemberSessionMetadata | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingExcerptReview | null>(null);
  const [availability, setAvailability] = useState<MemberChatAvailability>('AVAILABLE');
  const [remainingMessages, setRemainingMessages] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [evictionNoticeText, setEvictionNoticeText] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  /** Bumped when a reply saves a chat, so the tabs reload the list. */
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const hydratedKeyRef = useRef<string | undefined>(undefined);
  const replacingRef = useRef(false);
  replacingRef.current = replacing;
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const onOpenScopeRef = useRef(onOpenScope);
  onOpenScopeRef.current = onOpenScope;
  const onPlanRef = useRef(options.onPlan);
  onPlanRef.current = options.onPlan;

  const sessionIdRef = useRef<string | undefined>(persistAllowed ? loadSessionId(userId, scope) : undefined);
  const resolveRef = useRef<LocalExcerptResolver | undefined>(resolveLocalExcerpts);
  resolveRef.current = resolveLocalExcerpts;

  // Reload when the user or scope changes so transcripts/sessions never bleed across accounts/scopes.
  useEffect(() => {
    setMessages(loadTranscript(userId, scope));
    sessionIdRef.current = persistAllowed ? loadSessionId(userId, scope) : undefined;
    setSession(null);
    setEvictionNoticeText(null);
    setReplacing(false);
    setPendingReview(null);
    setHasError(false);
    setMood('Happy');
    setAvailability('AVAILABLE');
    // scope is reconstructed each render; key is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, persistAllowed]);

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
   * Routes a thrown error to the right surface: a terminal availability outcome latches
   * `availability` (so the entry point is gated) and shows its one-time copy; everything else is a
   * transient, retryable error bubble.
   */
  const handleFailure = useCallback(
    (err: unknown) => {
      if (err instanceof AttachmentTurnError && err.problem.kind === 'MESSAGE_CONTEXT_NOT_ALLOWED') {
        pushError(MESSAGE_HISTORY_NOT_ALLOWED_COPY);
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
   * Posts one member request. A 409 `CHAT_SESSION_LIMIT_REACHED` (a concurrent request filled the plan's
   * saved chats) is retried once as is; any other session-level denial (unknown/expired session, storage
   * off) is answered by retrying WITHOUT a session.
   */
  const postOnce = useCallback(
    async (init: {
      message: string;
      excerpts?: ExcerptSelectionResult['excerpts'];
      historyTruncated?: boolean;
      userConfirmed?: boolean;
      contextRequestId?: string;
      attachmentIds?: string[];
    }): Promise<MemberChatResponse> => {
      const token = await fetchIdToken();
      if (!token) throw new Error('NOT_AUTHENTICATED');

      // One generated-SDK call (ProductConnectionChat). An HTTP failure comes back as {status, body} so
      // the session and availability rules below can read the error code; a network error throws.
      type Attempt =
        | { ok: true; data: unknown }
        | { ok: false; status: number; body: { error?: unknown } & Record<string, unknown> };
      const attempt = async (useSession: boolean): Promise<Attempt> => {
        const body = buildMemberChatRequestBody({
          message: init.message,
          ...(matchId ? { matchId } : {}),
          includeProfile: true,
          includeMessageHistory: true,
          ...(init.excerpts ? { excerpts: init.excerpts } : {}),
          ...(init.historyTruncated !== undefined ? { historyTruncated: init.historyTruncated } : {}),
          ...(init.userConfirmed !== undefined ? { userConfirmed: init.userConfirmed } : {}),
          ...(init.contextRequestId ? { contextRequestId: init.contextRequestId } : {}),
          ...(init.attachmentIds && init.attachmentIds.length > 0 ? { attachmentIds: init.attachmentIds } : {}),
          ...(useSession && persistAllowed
            ? { persist: true, ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}) }
            : {}),
        });
        try {
          const out = await mrOneHookClient.productConnectionChat(body as ProductConnectionChatCommandInput);
          return { ok: true, data: withoutMetadata(out) };
        } catch (err) {
          const failure = sdkFailure(err);
          if (!failure) throw err;
          return { ok: false, status: failure.status, body: failure.body };
        }
      };

      let response = await attempt(persistAllowed);
      if (response.ok === false && persistAllowed && isSessionLimitRace(response.status, response.body.error)) {
        // A rare race at save time: the server makes room on the next try.
        response = await attempt(true);
      }
      if (response.ok === false && persistAllowed && isSessionErrorCode(response.body.error)) {
        // The session can't be used — forget it and answer the same question session-free.
        sessionIdRef.current = undefined;
        persistSessionId(userId, scope, undefined);
        setSession(null);
        response = await attempt(false);
      }

      if (response.ok === false) {
        // Distinguish a terminal auth/permission/config outcome (not retryable, gates the entry)
        // from a transient server error (retryable bubble). The structured `error` code is the
        // tie-breaker over the HTTP status.
        const errorBody = response.body;
        // The match does not allow its history to be used: remember it so message selection is not
        // offered again for this match.
        if (errorBody.error === 'MESSAGE_CONTEXT_NOT_ALLOWED') noteMessageHistoryNotAllowed(matchId);
        if (init.excerpts && init.excerpts.length > 0 && errorBody.error === 'MESSAGE_CONTEXT_NOT_ALLOWED') {
          throw new AttachmentTurnError({ kind: 'MESSAGE_CONTEXT_NOT_ALLOWED' });
        }
        if (init.attachmentIds && init.attachmentIds.length > 0) {
          const problem = chatTurnAttachmentProblem(response.status, errorBody.error);
          if (problem) throw new AttachmentTurnError(problem);
        } else if (errorBody.error === 'PRO_REQUIRED') {
          throw new AttachmentTurnError({ kind: 'PRO_REQUIRED' });
        }
        const outcome = classifyMemberChatAvailability(response.status, errorBody.error);
        if (outcome) throw new MemberChatTerminalError(outcome);
        throw new Error('SERVER_ERROR');
      }
      return parseMemberChatResponse((response as { data: unknown }).data);
    },
    // scope captured via key + matchId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, persistAllowed, userId, key],
  );

  const applySession = useCallback(
    (result: MemberChatResponse) => {
      if (result.plan) onPlanRef.current?.(result.plan);
      if (result.evictedSessionIds && result.evictedSessionIds.length > 0) {
        const evicted = result.evictedSessionIds;
        setSessions((prev) => applyEvictions(prev, evicted).sessions);
        setEvictionNoticeText(evictionNotice(evicted.length));
        // Another scope may remember an evicted chat (e.g. a match chat): forget it there too.
        forgetEvictedSessionIds(userId, [{ type: 'product' }, ...(matchId ? [{ type: 'match', matchId } as const] : [])], evicted);
      }
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
    [userId, key, matchId],
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
    async (text: string, attachments?: TurnAttachments, confirmed?: ConfirmedExcerpts): Promise<SendOutcome> => {
      const trimmed = text.trim();
      const hasFiles = Boolean(attachments && attachments.ids.length > 0);
      // Files alone are a turn (Mr OneHook Pro): the request carries `message: ""` with the ids.
      if ((!trimmed && !hasFiles) || loading || pendingReview) return { status: 'skipped' };
      // Terminal availability (not entitled / signed out / not configured) — stop accepting input.
      if (availability !== 'AVAILABLE') return { status: 'skipped' };
      // What the turn reads as: the server saves a files-only turn as ATTACHMENTS_ONLY_TURN_TEXT.
      const shownText = trimmed || ATTACHMENTS_ONLY_TURN_TEXT;

      const userMessage: MrOneHookMessage = {
        role: 'user',
        content: shownText,
        ...(attachments && attachments.refs.length > 0 ? { attachments: attachments.refs } : {}),
      };
      setMessages((prev) => [...prev.filter((m) => !m.isError), userMessage]);
      setLoading(true);
      setHasError(false);
      setMood('Thinking');

      try {
        // Excerpts go only when the member picked and confirmed them in the match chat; otherwise the
        // first pass carries none and the model must ask for context before any is shared.
        const shared = matchId && confirmed && confirmed.excerpts.length > 0 ? confirmed : undefined;
        const result = await postOnce({
          message: trimmed,
          ...(attachments && attachments.ids.length > 0 ? { attachmentIds: attachments.ids } : {}),
          ...(shared
            ? { excerpts: shared.excerpts, historyTruncated: shared.historyTruncated, userConfirmed: true }
            : {}),
        });
        // A follow-up excerpt review re-sends the question without the files, so it needs words.
        handleResult(result, shownText);
        return { status: 'sent' };
      } catch (err) {
        if (err instanceof AttachmentTurnError) {
          // The composer keeps the text and files and handles it (Pro screen, keep polling, ...).
          setMessages((prev) => prev.filter((m) => m !== userMessage));
          setMood('Neutral');
          return { status: 'attachment_problem', problem: err.problem };
        }
        handleFailure(err);
        return { status: 'failed' };
      } finally {
        setLoading(false);
      }
    },
    [loading, pendingReview, availability, postOnce, handleResult, handleFailure, matchId],
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

  // Saved-chat routes (ListChatSessions, GetChatSession, DeleteChatSession) through the generated SDK.
  const listSessions = useCallback(() => sessionCall(() => mrOneHookClient.listChatSessions({})), []);
  const getSession = useCallback(
    (sessionId: string) => sessionCall(() => mrOneHookClient.getChatSession({ sessionId })),
    [],
  );
  const removeSession = useCallback(
    (sessionId: string) => sessionCall(() => mrOneHookClient.deleteChatSession({ sessionId })),
    [],
  );

  const refreshSessions = useCallback(async () => {
    if (!persistAllowed) {
      setSessions([]);
      return;
    }
    try {
      const response = await listSessions();
      if (response.ok === true) setSessions(parseSessionList(response.data));
    } catch {
      /* the list is a convenience; chatting still works */
    }
  }, [listSessions, persistAllowed]);

  const resumeSession = useCallback(
    async (sessionId: string) => {
      if (!persistAllowed || loading) return;
      try {
        const response = await getSession(sessionId);
        const detail = response.ok === true ? parseSessionDetail(response.data) : undefined;
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
        setMessages(sessionTurnsToMessages(detail.messages));
        setPendingReview(null);
        setHasError(false);
        setMood('Happy');
      } catch {
        pushError(SERVER_ERROR_COPY);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getSession, persistAllowed, loading, userId, key, pushError],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!persistAllowed) return;
      const response = await removeSession(sessionId);
      if (response.ok === false && response.status !== 404) throw new Error('SERVER_ERROR');
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (sessionIdRef.current === sessionId) {
        sessionIdRef.current = undefined;
        persistSessionId(userId, scope, undefined);
        setSession(null);
        setMessages([]);
        setCurrentSessionId(undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [removeSession, persistAllowed, userId, key],
  );

  const dismissEvictionNotice = useCallback(() => setEvictionNoticeText(null), []);

  const startReplacingLeastRecent = useCallback(() => {
    clear();
    setReplacing(true);
  }, [clear]);

  // Load the saved chats for the tabs. The server is the source of truth for a saved chat's turns, so
  // a remembered chat is reloaded from it; with none remembered, the most recent saved chat of this
  // scope opens, rather than starting another.
  useEffect(() => {
    if (!persistAllowed || !userId) {
      setSessions([]);
      setCurrentSessionId(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await listSessions();
        if (response.ok === false || cancelled) return;
        const list = parseSessionList(response.data);
        if (cancelled) return;
        setSessions(list);
        const remembered = sessionIdRef.current;
        if (remembered && !list.some((s) => s.sessionId === remembered)) {
          // Deleted elsewhere, replaced at the plan's cap, or expired.
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
        const detailResponse = await getSession(wanted);
        const detail = detailResponse.ok === true ? parseSessionDetail(detailResponse.data) : undefined;
        if (cancelled || !detail) return;
        sessionIdRef.current = detail.sessionId;
        persistSessionId(userId, scope, detail.sessionId);
        setCurrentSessionId(detail.sessionId);
        setMessages(sessionTurnsToMessages(detail.messages));
      } catch {
        /* the tabs are a convenience; chatting still works */
      }
    })();
    return () => {
      cancelled = true;
    };
    // scope is reconstructed each render; key is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, persistAllowed, listSessions, getSession, sessionsVersion]);

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
    evictionNotice: evictionNoticeText,
    dismissEvictionNotice,
    replacing,
    startReplacingLeastRecent,
    currentSessionId,
  };
}

/** Saved turns to transcript messages (with their files as chips). */
function sessionTurnsToMessages(turns: { role: 'user' | 'assistant'; content: string; attachments?: ChatAttachmentRef[] }[]): MrOneHookMessage[] {
  return turns.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments (Mr OneHook Pro): the generated SDK behind the attachment flow
// ─────────────────────────────────────────────────────────────────────────────

async function attachmentCall(call: () => Promise<object>): Promise<AttachmentCallResult> {
  try {
    const out = withoutMetadata(await call()) as { attachment: ChatAttachment };
    return { ok: true, attachment: out.attachment };
  } catch (err) {
    const failure = sdkFailure(err);
    if (!failure) throw err;
    return { ok: false, status: failure.status, body: failure.body };
  }
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** One gate for every file of this tab, so concurrent polls stay within GetChatAttachment's budget. */
const pollGate = createPollGate(ATTACHMENT_POLL_MIN_GAP_MS, () => Date.now(), sleepMs);

/** UploadChatAttachment / GetChatAttachment through `mrOneHookClient`, for {@link runAttachment}. */
export function sdkAttachmentDeps(cancelled?: () => boolean): AttachmentDeps {
  return {
    upload: (input) =>
      attachmentCall(() =>
        mrOneHookClient.uploadChatAttachment({
          body: input.body,
          contentType: input.contentType,
          fileName: input.fileName,
          ...(input.matchId ? { matchId: input.matchId } : {}),
          ...(input.sender ? { sender: input.sender } : {}),
        }),
      ),
    get: async (attachmentId) => {
      await pollGate();
      return attachmentCall(() => mrOneHookClient.getChatAttachment({ attachmentId }));
    },
    sleep: sleepMs,
    now: () => Date.now(),
    ...(cancelled ? { cancelled } : {}),
  };
}

/**
 * Uploads files a member selected in a match chat ("Ask Mr OneHook"), decrypted on this device, with
 * `X-Attachment-Match-Id` / `X-Attachment-Sender`. Resolves with the uploaded items (status
 * `processing`, to be polled in the Mr OneHook chat), or the first refusal (e.g. 403
 * `MESSAGE_CONTEXT_NOT_ALLOWED`: the match does not allow its history to be used).
 */
export async function uploadMatchChatAttachments(
  files: Array<LocalFile & { origin: AttachmentOrigin }>,
  deps: AttachmentDeps = sdkAttachmentDeps(),
): Promise<{ ok: true; items: PendingAttachment[] } | { ok: false; problem: AttachmentProblem }> {
  const items: PendingAttachment[] = [];
  for (const file of files) {
    const [selected] = selectAttachments([], [file], { maxAttachmentBytes: Number.MAX_SAFE_INTEGER, maxAttachmentsPerMessage: 1 }, file.origin).items;
    let result: AttachmentCallResult;
    try {
      result = await deps.upload({
        body: new Uint8Array(await file.blob.arrayBuffer()),
        contentType: selected.contentType,
        fileName: encodeAttachmentName(file.name),
        matchId: file.origin.matchId,
        sender: file.origin.sender,
      });
    } catch {
      return { ok: false, problem: { kind: 'UNAVAILABLE' } };
    }
    if (result.ok === false) return { ok: false, problem: classifyAttachmentError(result.status, result.body) };
    items.push({
      ...selected,
      blob: undefined,
      attachmentId: result.attachment.attachmentId,
      kind: result.attachment.kind,
      status: result.attachment.status === AttachmentStatus.READY
        ? 'ready'
        : result.attachment.status === AttachmentStatus.FAILED
          ? 'failed'
          : 'processing',
    });
  }
  return { ok: true, items };
}

/** Opens an uploaded file of a saved turn (GetChatAttachmentContent) as a download. */
export async function openChatAttachmentContent(attachmentId: string, name: string): Promise<boolean> {
  try {
    const out = await mrOneHookClient.getChatAttachmentContent({ attachmentId });
    const bytes = out.body as Uint8Array;
    const blob = new Blob([bytes.slice() as unknown as ArrayBuffer], { type: out.contentType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

export interface UseMrOneHookAttachments {
  items: PendingAttachment[];
  /** Adds picked files; returns what was refused client-side (over 5 MB, more than 3). */
  add: (files: LocalFile[]) => SelectionRejection[];
  /** Adds files already uploaded elsewhere ("Ask Mr OneHook" from a match chat). */
  adopt: (items: PendingAttachment[]) => void;
  remove: (localId: string) => void;
  clear: () => void;
  /** 409 `ATTACHMENT_NOT_READY` on send: poll these again. */
  repoll: () => void;
  /** A refused turn about the files (not usable / expired): mark them failed. */
  markFailed: (problem: AttachmentProblem) => void;
  /** The files sent with a turn, as ids and chips. */
  turnAttachments: () => TurnAttachments;
}

/**
 * The composer's files. Pro: each file uploads and polls as soon as it is added (or as soon as the plan
 * becomes Pro). Free: files stay selected and nothing is uploaded.
 */
export function useMrOneHookAttachments(options: {
  plan: MrOneHookPlan;
  limits: { maxAttachmentBytes: number; maxAttachmentsPerMessage: number };
  /** Test seam; defaults to the generated SDK. */
  deps?: (cancelled: () => boolean) => AttachmentDeps;
}): UseMrOneHookAttachments {
  const { plan, limits } = options;
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const running = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const mounted = useRef(true);
  const depsFactory = options.deps ?? sdkAttachmentDeps;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(
    (item: PendingAttachment) => {
      if (running.current.has(item.localId)) return;
      running.current.add(item.localId);
      const cancelled = () => !mounted.current || removed.current.has(item.localId);
      void runAttachment(item, depsFactory(cancelled), (next) => {
        setItems((prev) => prev.map((i) => (i.localId === next.localId ? next : i)));
      }).finally(() => running.current.delete(item.localId));
    },
    [depsFactory],
  );

  // Pro: run every file that is waiting (newly added, adopted, or selected before buying Pro).
  useEffect(() => {
    if (plan !== MrOneHookPlan.PRO) return;
    for (const item of items) {
      if ((item.status === 'selected' || (item.status === 'processing' && item.attachmentId)) && !running.current.has(item.localId)) {
        start(item);
      }
    }
  }, [plan, items, start]);

  const add = useCallback(
    (files: LocalFile[]) => {
      const { items: next, rejected } = selectAttachments(itemsRef.current, files, limits);
      setItems(next);
      return rejected;
    },
    [limits],
  );
  const adopt = useCallback((adopted: PendingAttachment[]) => {
    setItems((prev) => [...prev, ...adopted].slice(0, Math.max(1, limits.maxAttachmentsPerMessage)));
  }, [limits.maxAttachmentsPerMessage]);
  const remove = useCallback((localId: string) => {
    removed.current.add(localId);
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  }, []);
  const clear = useCallback(() => {
    for (const i of itemsRef.current) removed.current.add(i.localId);
    setItems([]);
  }, []);
  const repoll = useCallback(() => {
    setItems((prev) => prev.map((i) => (i.attachmentId && i.status === 'ready' ? { ...i, status: 'processing' } : i)));
  }, []);
  const markFailed = useCallback((problem: AttachmentProblem) => {
    setItems((prev) => prev.map((i) => ({ ...i, status: 'failed', problem })));
  }, []);
  const turnAttachments = useCallback((): TurnAttachments => {
    const ready = itemsRef.current.filter((i) => i.status === 'ready' && i.attachmentId);
    return {
      ids: ready.map((i) => i.attachmentId as string),
      refs: ready.map((i) => ({
        ...(i.origin ? {} : { attachmentId: i.attachmentId }),
        name: i.name,
        kind: i.kind ?? AttachmentKind.DOCUMENT,
        sizeBytes: i.sizeBytes,
        source: i.origin ? AttachmentSource.MATCH_CHAT : AttachmentSource.UPLOAD,
      })),
    };
  }, []);

  return { items, add, adopt, remove, clear, repoll, markFailed, turnAttachments };
}
