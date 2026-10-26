/**
 * Evidence window selection (OneHook moderation Phase 2, docs/MODERATION.md §2, §9.3).
 *
 * Builds the exact set of messages that will be shared as decrypted evidence: the most recent 200
 * messages within the last 30 days (whichever cap bites first), oldest first in the bundle (per the
 * canonical sort rule). System and undecryptable messages are skipped; messages from other
 * conversations are never seen here because the caller only ever passes ONE conversation's history.
 *
 * Pure and deterministic so it can be unit-tested without a browser or the network. `nowMs` is
 * injected (defaults to Date.now) so the 30-day cutoff is testable.
 */
import type { BundleMessage, SenderSide } from './evidence-bundle';
import { EVIDENCE_WINDOW, sortMessages } from './evidence-bundle';

/** A single decrypted source message as the chat UI already holds it (via the E2EE hook). */
export interface SourceMessage {
  messageId: string;
  /** Epoch milliseconds the message was sent. */
  sentAtMs: number;
  senderSide: SenderSide;
  /**
   * Decrypted plaintext, or null for a message that must be skipped: a system message, an
   * attachment/media-only message (no text in this release), or anything without a text body.
   */
  text: string | null;
  /** True when the envelope could not be decrypted on this device; such messages are skipped. */
  undecryptable?: boolean;
}

export interface WindowOptions {
  maxMessages?: number;
  maxDays?: number;
  nowMs?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO-8601 UTC with millisecond precision, e.g. "2026-10-26T12:34:56.789Z". */
export function toIsoUtcMillis(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Select and map the evidence window.
 *
 *  1. Drop undecryptable messages and messages with no text body (system / media-only).
 *  2. Drop anything older than `maxDays` before `nowMs` (30-day cap).
 *  3. Keep only the most recent `maxMessages` (200-message cap).
 *  4. Return them oldest-first, canonically sorted (sentAt then messageId), mapped to BundleMessage.
 */
export function selectEvidenceWindow(
  messages: readonly SourceMessage[],
  opts: WindowOptions = {}
): BundleMessage[] {
  const maxMessages = opts.maxMessages ?? EVIDENCE_WINDOW.maxMessages;
  const maxDays = opts.maxDays ?? EVIDENCE_WINDOW.maxDays;
  const nowMs = opts.nowMs ?? Date.now();
  const cutoffMs = nowMs - maxDays * MS_PER_DAY;

  const eligible = messages.filter(
    (m) =>
      !m.undecryptable &&
      typeof m.text === 'string' &&
      !isFramedNonText(m.text) &&
      m.sentAtMs >= cutoffMs
  );

  // Keep the most recent `maxMessages`: order by (sentAt, messageId) and take the tail.
  const ordered = [...eligible].sort((a, b) => {
    if (a.sentAtMs !== b.sentAtMs) return a.sentAtMs - b.sentAtMs;
    if (a.messageId < b.messageId) return -1;
    if (a.messageId > b.messageId) return 1;
    return 0;
  });
  const windowed = ordered.length > maxMessages ? ordered.slice(ordered.length - maxMessages) : ordered;

  const mapped: BundleMessage[] = windowed.map((m) => ({
    messageId: m.messageId,
    sentAt: toIsoUtcMillis(m.sentAtMs),
    senderSide: m.senderSide,
    text: m.text as string,
  }));

  // Canonical oldest-first order (sentAt then messageId by UTF-16 code unit).
  return sortMessages(mapped);
}

/**
 * Defence in depth: chat plaintext uses C0-control framing for structured payloads (U+0001
 * attachment envelope with the media key, U+0002 call signal with SDP/ICE). Such a payload must
 * never enter an evidence bundle even if an upstream mapper let it through. Tab, newline and
 * carriage return are ordinary text.
 */
export function isFramedNonText(text: string): boolean {
  if (text.length === 0) return false;
  if (text.includes('\u0001') || text.includes('\u0002')) return true;
  const c = text.charCodeAt(0);
  return c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d;
}
