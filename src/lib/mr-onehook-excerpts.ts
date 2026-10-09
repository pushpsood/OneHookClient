/**
 * Mr.OneHook ephemeral-excerpt selector.
 *
 * This module is PURE and side-effect free: given a list of already-decrypted, locally-held match
 * messages it chooses a small, bounded set of excerpts to attach to a single authenticated
 * `POST /api/member/product-connection-chat` request. It is the only place that decides WHAT leaves
 * the device as conversational context, so the privacy guarantees live here and are unit-tested in
 * isolation (no React, no network, no storage).
 *
 * Hard rules enforced here:
 *   • Only readable, plain-text turns are eligible — undecryptable messages, attachment envelopes,
 *     failed/sending sends, and empty bodies are excluded and can never become an excerpt.
 *   • Nothing but `speaker`, `sentAt` and `text` ever appears on an excerpt. Message IDs, ciphertext,
 *     attachment keys, status and read receipts are intentionally dropped — they must NEVER be sent.
 *   • Count, per-message length and total length are bounded to mirror the server's limits
 *     (EPHEMERAL_CONTEXT_MAX_MESSAGES / _MAX_CHARACTERS / CONTEXT_MAX_INPUT_CHARACTERS) so a request
 *     is never rejected for being too large and the device never over-shares.
 */

import { isAttachmentFrame } from './chat-attachments';

/**
 * One already-decrypted candidate turn, normalized to the two facts the selector needs: who spoke
 * (from the signed-in user's perspective) and when. `text` is the decrypted plaintext body (the chat
 * UI stores decrypted text in a message's `ciphertext` field; see `useChatMessages`).
 */
export interface SelectableMessage {
  speaker: 'self' | 'match';
  text: string;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Set when the envelope could not be decrypted on this device — never eligible. */
  undecryptable?: boolean;
  /** MessageStatus wire value (e.g. 'SENT', 'FAILED'); FAILED/SENDING turns are excluded. */
  status?: string;
}

/** A single excerpt exactly as it is serialised into the request — nothing else is ever added. */
export interface SelectedExcerpt {
  speaker: 'self' | 'match';
  /** ISO-8601 timestamp. */
  sentAt: string;
  text: string;
}

export interface ExcerptSelectionRequest {
  /** Terms from the user's question and/or the server's `contextRequest`. Case-insensitive. */
  searchTerms?: readonly string[];
  /** Optional inclusive epoch-ms window (mirrors a server `contextRequest.dateRange`). */
  dateRange?: { from?: number; to?: number };
  /** Upper bound on how many excerpts to return for this request. */
  maxMessages: number;
}

export interface ExcerptSelectionBounds {
  /** Absolute cap on excerpt count regardless of what a request asks for. */
  maxMessages: number;
  /** Cap on the summed length of all excerpt bodies. */
  maxTotalCharacters: number;
  /** Cap on a single excerpt body; longer bodies are clamped, never dropped silently. */
  maxMessageCharacters: number;
}

export interface ExcerptSelectionResult {
  excerpts: SelectedExcerpt[];
  /**
   * True when at least one eligible readable turn was NOT included (count/length bounds or date
   * filtering). The server forwards this to the model so it knows the context is partial.
   */
  historyTruncated: boolean;
}

/** Mirrors the backend defaults (EPHEMERAL_CONTEXT_MAX_MESSAGES / _MAX_CHARACTERS / CONTEXT_MAX_INPUT_CHARACTERS). */
export const DEFAULT_EXCERPT_BOUNDS: ExcerptSelectionBounds = {
  maxMessages: 30,
  maxTotalCharacters: 12000,
  maxMessageCharacters: 4000,
};

/** Status wire values that mean "not a settled, readable turn" and are therefore never eligible. */
const EXCLUDED_STATUSES = new Set(['FAILED', 'SENDING']);

function isReadableTextTurn(message: SelectableMessage): boolean {
  if (message.undecryptable) return false;
  if (message.status && EXCLUDED_STATUSES.has(message.status.toUpperCase())) return false;
  const text = message.text?.trim();
  if (!text) return false;
  // An attachment envelope is framed plaintext, not conversation — it must never be shared as text.
  if (isAttachmentFrame(message.text)) return false;
  return true;
}

function withinRange(timestamp: number, range?: ExcerptSelectionRequest['dateRange']): boolean {
  if (!range) return true;
  if (range.from != null && timestamp < range.from) return false;
  if (range.to != null && timestamp > range.to) return false;
  return true;
}

function normalizeTerms(terms?: readonly string[]): string[] {
  if (!terms) return [];
  return terms
    .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
    .filter((t) => t.length > 0);
}

function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function clampText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Chooses a bounded, privacy-minimized set of excerpts.
 *
 * Strategy: keep only readable text turns in range, then prioritise turns that match the search
 * terms (most recent first), falling back to the most recent turns so the model always gets some
 * grounding even when nothing matches. The final list is returned in chronological order so the
 * model reads the exchange the way it happened.
 */
export function selectEphemeralExcerpts(
  messages: readonly SelectableMessage[],
  request: ExcerptSelectionRequest,
  bounds: ExcerptSelectionBounds = DEFAULT_EXCERPT_BOUNDS,
): ExcerptSelectionResult {
  const requestedMax = Number.isFinite(request.maxMessages) ? Math.floor(request.maxMessages) : 0;
  const effectiveMax = Math.max(0, Math.min(requestedMax, bounds.maxMessages));

  const eligible = messages.filter(isReadableTextTurn);
  const inRange = eligible.filter((m) => withinRange(m.timestamp, request.dateRange));
  const terms = normalizeTerms(request.searchTerms);

  // Priority: relevant turns first, then by recency. Chronological order is restored on output.
  const prioritized = [...inRange].sort((a, b) => {
    const aRelevant = matchesAnyTerm(a.text, terms);
    const bRelevant = matchesAnyTerm(b.text, terms);
    if (aRelevant !== bRelevant) return aRelevant ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  const picked: SelectableMessage[] = [];
  let totalCharacters = 0;
  for (const message of prioritized) {
    if (picked.length >= effectiveMax) break;
    const text = clampText(message.text.trim(), bounds.maxMessageCharacters);
    if (!text) continue;
    if (totalCharacters + text.length > bounds.maxTotalCharacters) continue;
    picked.push({ ...message, text });
    totalCharacters += text.length;
  }

  const excerpts = picked
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(
      (message): SelectedExcerpt => ({
        speaker: message.speaker,
        sentAt: new Date(message.timestamp).toISOString(),
        text: message.text,
      }),
    );

  return { excerpts, historyTruncated: excerpts.length < eligible.length };
}

/**
 * Adapts the chat UI's decrypted message view (`useChatMessages` output) into selector input.
 *
 * The chat view normalizes a sender to the literal `'me'` for the signed-in user and stores the
 * DECRYPTED plaintext in `ciphertext`. This adapter maps that to the selector's speaker/text/time
 * shape and drops everything else so no identifier can leak into an excerpt.
 */
export function toSelectableMessages(
  views: readonly {
    senderId: string;
    ciphertext: string;
    timestamp: number;
    undecryptable?: boolean;
    status?: string;
  }[],
): SelectableMessage[] {
  return views.map((view) => ({
    speaker: view.senderId === 'me' ? 'self' : 'match',
    text: view.ciphertext ?? '',
    timestamp: view.timestamp,
    undecryptable: view.undecryptable,
    status: view.status,
  }));
}
