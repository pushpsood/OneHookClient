/**
 * "Ask Mr OneHook about messages and files" in a match chat (mirrors iOS `ChatMessageSelection` and
 * `MrOneHookAskContext`).
 *
 * The member switches the conversation into select mode, ticks text messages and (with Mr OneHook Pro
 * available in this environment) photos and files, sees exactly what would be shared, and confirms.
 * Only then does this match's Mr OneHook chat open with the messages attached to the next question as
 * `ephemeralMessageContext` (`userConfirmed: true`) and the files as `attachmentIds`.
 *
 * The rules (what can be selected, the limits, what is sent) are pure and unit-tested here; ChatView
 * owns the mode and the telemetry. Nothing in this module touches the network or storage, except the
 * small in-memory record of matches whose history Mr OneHook may not use (see the end of the file).
 */
import { useSyncExternalStore } from 'react';
import type { ExcerptSpeaker } from 'onehook-mr-onehook-client';
import { decodeMessagePlaintext, type AttachmentEnvelope } from './chat-attachments';
import { DEFAULT_EXCERPT_BOUNDS, isReadableTextTurn, type SelectedExcerpt } from './mr-onehook-excerpts';

/** The limits of one question: the excerpt limits mirror the server's (30 messages, 12,000 characters). */
export interface AskLimits {
  maxMessages: number;
  maxTotalCharacters: number;
  /** One message longer than this is shortened (the server's per-text limit). */
  maxMessageCharacters: number;
  maxFiles: number;
  maxFileBytes: number;
}

export const DEFAULT_ASK_LIMITS: Omit<AskLimits, 'maxFiles' | 'maxFileBytes'> = {
  maxMessages: DEFAULT_EXCERPT_BOUNDS.maxMessages,
  maxTotalCharacters: DEFAULT_EXCERPT_BOUNDS.maxTotalCharacters,
  maxMessageCharacters: DEFAULT_EXCERPT_BOUNDS.maxMessageCharacters,
};

/** One message of the conversation that can be selected. */
export interface AskCandidate {
  messageId: string;
  speaker: ExcerptSpeaker;
  /** Epoch ms. */
  timestamp: number;
  /** The text Mr OneHook would read: a text message, or a photo's or file's caption (trimmed, at most
   * `maxMessageCharacters`). Absent when the match does not allow its history to be used. */
  text?: string;
  /** The text was cut to `maxMessageCharacters`. */
  shortened?: boolean;
  /** A photo or file of at most `maxFileBytes` (only when files can be selected). */
  file?: AttachmentEnvelope;
  /** A photo or file over `maxFileBytes` (only when files can be selected): it cannot be shared. */
  oversizedFile?: AttachmentEnvelope;
}

/** The parts of a chat message (`useChatMessages`) the rules read. */
export interface AskMessageView {
  messageId: string;
  senderId: string;
  /** The decrypted body (the chat stores the plaintext in `ciphertext`). */
  ciphertext: string;
  timestamp: number;
  undecryptable?: boolean;
  status?: string;
}

export interface AskCandidateOptions {
  /** The match allows Mr OneHook to use its messages. When false no text can be selected. */
  historyAllowed: boolean;
  /** Photos and files can be selected (Mr OneHook Pro is available in this environment). */
  filesAllowed: boolean;
  limits: Pick<AskLimits, 'maxMessageCharacters' | 'maxFileBytes'>;
}

/**
 * The message as something that can be selected, or null when it has nothing Mr OneHook may see.
 *
 * Text, like every excerpt that leaves the device (`isReadableTextTurn`): a readable, settled text
 * message; never one this device could not decrypt, a failed or sending one, an empty one, a "can't be
 * shown" placeholder, a location or contact card. A photo's or file's caption counts as text (as on
 * iOS). Files are selectable as before: any photo or file this device decrypted (one over the size
 * limit is shown as selectable and refused with a notice). Call events are not messages and never
 * reach this function.
 */
export function askCandidate(message: AskMessageView, options: AskCandidateOptions): AskCandidate | null {
  if (message.undecryptable) return null;
  let decoded: ReturnType<typeof decodeMessagePlaintext>;
  try {
    decoded = decodeMessagePlaintext(message.ciphertext);
  } catch {
    return null; // an attachment this build cannot read
  }
  const speaker: ExcerptSpeaker = message.senderId === 'me' ? 'self' : 'match';
  const base = { messageId: message.messageId, speaker, timestamp: message.timestamp };
  const withText = (raw: string): Pick<AskCandidate, 'text' | 'shortened'> => {
    const trimmed = raw.trim();
    const max = options.limits.maxMessageCharacters;
    return trimmed.length > max ? { text: trimmed.slice(0, max), shortened: true } : { text: trimmed };
  };

  if (decoded.type === 'text') {
    if (!options.historyAllowed) return null;
    const readable = isReadableTextTurn({
      speaker,
      text: decoded.text,
      timestamp: message.timestamp,
      status: message.status,
    });
    return readable ? { ...base, ...withText(decoded.text) } : null;
  }
  if (decoded.type !== 'attachment') return null; // structured: never shared

  const envelope = decoded.envelope;
  const caption = options.historyAllowed ? (envelope.caption ?? '').trim() : '';
  const candidate: AskCandidate = { ...base, ...(caption ? withText(caption) : {}) };
  if (options.filesAllowed) {
    if (envelope.size <= options.limits.maxFileBytes) candidate.file = envelope;
    else candidate.oversizedFile = envelope;
  }
  return candidate.text || candidate.file || candidate.oversizedFile ? candidate : null;
}

/** The selectable messages of a conversation, by message id (in conversation order). */
export function askCandidates(
  messages: readonly AskMessageView[],
  options: AskCandidateOptions,
): Map<string, AskCandidate> {
  const map = new Map<string, AskCandidate>();
  for (const message of messages) {
    const candidate = askCandidate(message, options);
    if (candidate) map.set(message.messageId, candidate);
  }
  return map;
}

/** What is selected, in numbers (for the bar and the limits). */
export interface AskSelectionTotals {
  messages: number;
  files: number;
  characters: number;
}

export function askSelectionTotals(
  selected: readonly string[],
  candidates: ReadonlyMap<string, AskCandidate>,
): AskSelectionTotals {
  const totals: AskSelectionTotals = { messages: 0, files: 0, characters: 0 };
  for (const id of selected) {
    const candidate = candidates.get(id);
    if (!candidate) continue;
    if (candidate.text) {
      totals.messages += 1;
      totals.characters += candidate.text.length;
    }
    if (candidate.file) totals.files += 1;
  }
  return totals;
}

export const askMessageLimitCopy = (max: number) => `You can share up to ${max} messages at a time.`;
export const askCharacterLimitCopy = (max: number) =>
  `Mr OneHook can read up to ${max.toLocaleString('en-US')} characters of messages at a time. Deselect a message to add this one.`;
export const askFileLimitCopy = (max: number) => `You can share up to ${max} files at a time.`;
export const ASK_FILE_TOO_LARGE_COPY = 'Files over 5 MB can’t be shared with Mr OneHook.';

/** Why message selection is off for a match whose history Mr OneHook may not use. */
export const ASK_HISTORY_NOT_ALLOWED_COPY =
  "This match doesn't allow Mr OneHook to use your conversation, so messages can't be selected.";

export type AskToggleResult =
  | { outcome: 'selected' | 'deselected'; selected: string[] }
  | { outcome: 'refused'; selected: string[]; notice: string };

/**
 * Selects or deselects one message. Deselecting always works; selecting needs a selectable message
 * and room under every limit (messages, characters, files). A refusal leaves the selection unchanged
 * and says why.
 */
export function toggleAskSelection(
  selected: readonly string[],
  messageId: string,
  candidates: ReadonlyMap<string, AskCandidate>,
  limits: AskLimits,
): AskToggleResult {
  if (selected.includes(messageId)) {
    return { outcome: 'deselected', selected: selected.filter((id) => id !== messageId) };
  }
  const candidate = candidates.get(messageId);
  if (!candidate) return { outcome: 'refused', selected: [...selected], notice: 'This message can’t be selected.' };
  if (!candidate.text && !candidate.file) {
    return { outcome: 'refused', selected: [...selected], notice: ASK_FILE_TOO_LARGE_COPY };
  }
  const totals = askSelectionTotals(selected, candidates);
  if (candidate.text) {
    if (totals.messages >= limits.maxMessages) {
      return { outcome: 'refused', selected: [...selected], notice: askMessageLimitCopy(limits.maxMessages) };
    }
    if (totals.characters + candidate.text.length > limits.maxTotalCharacters) {
      return { outcome: 'refused', selected: [...selected], notice: askCharacterLimitCopy(limits.maxTotalCharacters) };
    }
  }
  if (candidate.file && totals.files >= limits.maxFiles) {
    return { outcome: 'refused', selected: [...selected], notice: askFileLimitCopy(limits.maxFiles) };
  }
  return { outcome: 'selected', selected: [...selected, messageId] };
}

/** A file to upload with the question (decrypted on this device once the member confirms). */
export interface AskShareFile {
  messageId: string;
  envelope: AttachmentEnvelope;
  sender: ExcerptSpeaker;
  timestamp: number;
}

/** Exactly what the confirmation shows and what is sent: the excerpts and files, oldest first. */
export interface AskShare {
  excerpts: SelectedExcerpt[];
  files: AskShareFile[];
  /** Indexes (into `excerpts`) of the texts cut to the per-message limit. */
  shortened: number[];
}

export function buildAskShare(
  selected: readonly string[],
  candidates: ReadonlyMap<string, AskCandidate>,
): AskShare {
  const picked = selected
    .map((id) => candidates.get(id))
    .filter((c): c is AskCandidate => Boolean(c))
    .sort((a, b) => a.timestamp - b.timestamp);
  const share: AskShare = { excerpts: [], files: [], shortened: [] };
  for (const c of picked) {
    if (c.text) {
      // Exactly the three fields the request carries.
      if (c.shortened) share.shortened.push(share.excerpts.length);
      share.excerpts.push({ speaker: c.speaker, sentAt: new Date(c.timestamp).toISOString(), text: c.text });
    }
    if (c.file) share.files.push({ messageId: c.messageId, envelope: c.file, sender: c.speaker, timestamp: c.timestamp });
  }
  return share;
}

/** "2 messages and 1 file" (empty when nothing). */
export function askCountPhrase(messages: number, files: number): string {
  const parts: string[] = [];
  if (messages > 0) parts.push(`${messages} message${messages === 1 ? '' : 's'}`);
  if (files > 0) parts.push(`${files} file${files === 1 ? '' : 's'}`);
  return parts.join(' and ');
}

/** The confirmation's title. */
export function askConfirmTitle(share: Pick<AskShare, 'excerpts' | 'files'>): string {
  const m = share.excerpts.length;
  const f = share.files.length;
  if (f === 0) return m === 1 ? 'Ask Mr OneHook about this message?' : `Ask Mr OneHook about these ${m} messages?`;
  if (m === 0 && f === 1) return 'Ask Mr OneHook about this file?';
  return `Ask Mr OneHook about these ${askCountPhrase(m, f)}?`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matches whose message history Mr OneHook may not use
// ─────────────────────────────────────────────────────────────────────────────
//
// The server decides per match (`contextPolicy.messageHistoryAllowed`, read service-to-service) and
// the browser cannot read it ahead of a request. A 403 `MESSAGE_CONTEXT_NOT_ALLOWED` for a match is
// remembered here (in memory, for this page) so message selection is no longer offered for it.

const historyDenied = new Set<string>();
const listeners = new Set<() => void>();

export function noteMessageHistoryNotAllowed(matchId: string | undefined): void {
  if (!matchId || historyDenied.has(matchId)) return;
  historyDenied.add(matchId);
  listeners.forEach((l) => l());
}

export function isMessageHistoryNotAllowed(matchId: string): boolean {
  return historyDenied.has(matchId);
}

/** Tests only. */
export function resetMessageHistoryPolicy(): void {
  historyDenied.clear();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once the server refused this match's history (re-renders when it is learned). */
export function useMessageHistoryNotAllowed(matchId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => historyDenied.has(matchId),
    () => false,
  );
}
