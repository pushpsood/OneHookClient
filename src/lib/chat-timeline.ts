/**
 * Chat timeline layout, grouping, search, disappearing timer helpers, starred sync cache,
 * partner restriction gates, and plain-text export builder (mirrors iOS `ChatTimeline`,
 * `ChatConversationSearch`, `ChatDisappearing`, `ChatStarredSync`, `PartnerRestrictions`,
 * and `ChatSettingsViewController.exportChat`).
 */
import { decodeMessagePlaintext } from './chat-attachments';
import type { PartnerChatRestrictions } from '../api/rest';
import type { ChatMessageView } from '../types';

export type BubblePosition = 'single' | 'first' | 'middle' | 'last';

const GROUP_WINDOW_MS = 2 * 60 * 1000;

function localDayStart(epochMs: number): number {
  const d = new Date(epochMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatDayLabel(dayStartMs: number, nowMs = Date.now()): string {
  const todayStart = localDayStart(nowMs);
  const yesterdayStart = todayStart - 86_400_000;
  if (dayStartMs === todayStart) return 'Today';
  if (dayStartMs === yesterdayStart) return 'Yesterday';
  return new Date(dayStartMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(new Date(dayStartMs).getFullYear() !== new Date(nowMs).getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function formatMessageTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function sameLocalDay(aMs: number, bMs: number): boolean {
  return localDayStart(aMs) === localDayStart(bMs);
}

/** Computes grouped bubble positions across chronological messages. */
export function computeBubblePositions(
  messages: readonly Pick<ChatMessageView, 'messageId' | 'senderId' | 'timestamp'>[]
): Map<string, BubblePosition> {
  const positions = new Map<string, BubblePosition>();
  for (let i = 0; i < messages.length; i += 1) {
    const prev = i > 0 ? messages[i - 1] : null;
    const curr = messages[i];
    const next = i + 1 < messages.length ? messages[i + 1] : null;

    const joinsPrev =
      prev != null &&
      prev.senderId === curr.senderId &&
      curr.timestamp - prev.timestamp >= 0 &&
      curr.timestamp - prev.timestamp <= GROUP_WINDOW_MS &&
      sameLocalDay(prev.timestamp, curr.timestamp);

    const joinsNext =
      next != null &&
      next.senderId === curr.senderId &&
      next.timestamp - curr.timestamp >= 0 &&
      next.timestamp - curr.timestamp <= GROUP_WINDOW_MS &&
      sameLocalDay(curr.timestamp, next.timestamp);

    const pos: BubblePosition =
      !joinsPrev && !joinsNext
        ? 'single'
        : !joinsPrev && joinsNext
          ? 'first'
          : joinsPrev && joinsNext
            ? 'middle'
            : 'last';
    positions.set(curr.messageId, pos);
  }
  return positions;
}

export function messagePreviewText(message: Pick<ChatMessageView, 'ciphertext' | 'undecryptable'>): string {
  if (message.undecryptable) return 'Locked message';
  try {
    const decoded = decodeMessagePlaintext(message.ciphertext);
    if (decoded.type === 'text') return decoded.text;
    if (decoded.type === 'attachment') {
      const cap = decoded.envelope.caption?.trim();
      if (cap) return cap;
      switch (decoded.envelope.kind) {
        case 'image':
          return 'Photo';
        case 'video':
          return 'Video';
        case 'audio':
          return 'Voice note';
        default:
          return decoded.envelope.name || 'File';
      }
    }
    if (decoded.type === 'structured') {
      switch (decoded.content.type) {
        case 'location':
          return decoded.content.name || 'Location';
        case 'live_location':
          return 'Live location';
        case 'contact':
          return decoded.content.displayName || 'Shared contact';
      }
    }
  } catch {
    /* ignore */
  }
  return 'Message';
}

// ── Search & Filters (ChatConversationSearch.swift) ──────────────────────────

export type ConversationSearchFilter = 'all' | 'from_me' | 'from_them' | 'media' | 'links';

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi);
  return matches ?? [];
}

export function searchConversationMessages(
  messages: readonly ChatMessageView[],
  query: string,
  filter: ConversationSearchFilter
): string[] {
  const q = query.trim().toLowerCase();
  const out: string[] = [];
  for (const m of messages) {
    if (m.undecryptable) continue;
    const mine = m.senderId === 'me';
    if (filter === 'from_me' && !mine) continue;
    if (filter === 'from_them' && mine) continue;

    let decoded;
    try {
      decoded = decodeMessagePlaintext(m.ciphertext);
    } catch {
      continue;
    }

    if (filter === 'media') {
      if (decoded.type !== 'attachment') continue;
      if (!q) {
        out.push(m.messageId);
        continue;
      }
      const haystack = `${decoded.envelope.name ?? ''} ${decoded.envelope.caption ?? ''}`.toLowerCase();
      if (haystack.includes(q)) out.push(m.messageId);
      continue;
    }

    if (filter === 'links') {
      const urls =
        decoded.type === 'text'
          ? extractUrls(decoded.text)
          : decoded.type === 'attachment' && decoded.envelope.caption
            ? extractUrls(decoded.envelope.caption)
            : [];
      if (urls.length === 0) continue;
      if (!q || urls.some((u) => u.toLowerCase().includes(q))) out.push(m.messageId);
      continue;
    }

    const preview = messagePreviewText(m).toLowerCase();
    if (!q || preview.includes(q)) {
      out.push(m.messageId);
    }
  }
  return out;
}

// ── Disappearing messages (ChatDisappearing.swift) ───────────────────────────

export const DISAPPEARING_PRESETS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 0, label: 'Off' },
  { seconds: 86_400, label: '24 hours' },
  { seconds: 7 * 86_400, label: '7 days' },
  { seconds: 90 * 86_400, label: '90 days' },
];

export function formatDisappearingShort(seconds: number): string {
  const s = Math.max(1, seconds);
  if (s % 86_400 === 0) return `${s / 86_400}d`;
  if (s % 3_600 === 0) return `${s / 3_600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export function formatDisappearingLong(seconds: number): string {
  if (!seconds || seconds <= 0) return 'Off';
  const s = Math.max(1, seconds);
  const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (s % 86_400 === 0 && s / 86_400 >= 2) return unit(s / 86_400, 'day', 'days');
  if (s % 3_600 === 0) return unit(s / 3_600, 'hour', 'hours');
  if (s % 60 === 0) return unit(s / 60, 'minute', 'minutes');
  return unit(s, 'second', 'seconds');
}

const DISAPPEARING_KEY = 'onehook.chat.disappearingSent';

export function getSentDisappearingSeconds(messageId: string): number | null {
  if (typeof window === 'undefined' || !messageId) return null;
  try {
    const raw = window.localStorage.getItem(DISAPPEARING_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, number>;
    const val = map[messageId];
    return typeof val === 'number' && val > 0 ? val : null;
  } catch {
    return null;
  }
}

export function recordSentDisappearingSeconds(messageId: string, seconds: number): void {
  if (typeof window === 'undefined' || !messageId || seconds <= 0) return;
  try {
    const raw = window.localStorage.getItem(DISAPPEARING_KEY);
    const map: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[messageId] = seconds;
    const keys = Object.keys(map);
    if (keys.length > 2000) {
      for (const oldKey of keys.slice(0, keys.length - 2000)) delete map[oldKey];
    }
    window.localStorage.setItem(DISAPPEARING_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

// ── Partner Restrictions (PartnerRestrictions.swift) ─────────────────────────

export const EMPTY_PARTNER_RESTRICTIONS: PartnerChatRestrictions = {
  saveMedia: false,
  export: false,
  mrOneHook: false,
};

export const PartnerRestrictionGate = {
  canSaveMedia: (mine: boolean, restrictions: PartnerChatRestrictions): boolean =>
    mine || !restrictions.saveMedia,
  canExportChat: (restrictions: PartnerChatRestrictions): boolean => !restrictions.export,
  shareableWithMrOneHook: <T extends { senderId: string }>(
    picked: readonly T[],
    restrictions: PartnerChatRestrictions
  ): T[] => (restrictions.mrOneHook ? picked.filter((m) => m.senderId === 'me') : [...picked]),
  saveMediaNotice: (partnerName: string): string =>
    `${partnerName} doesn’t allow saving photos and videos from this chat.`,
  exportNotice: (partnerName: string): string =>
    `${partnerName} doesn’t allow exporting this conversation.`,
  mrOneHookNotice: (partnerName: string): string =>
    `${partnerName} doesn’t allow sharing their messages or files with Mr.OneHook.`,
  mrOneHookLeftOutNotice: (partnerName: string): string =>
    `${partnerName} keeps their messages out of Mr.OneHook, so only yours were included.`,
};

/** Exports readable chat history as plain text, excluding undecryptable messages. */
export function buildChatTranscript(
  messages: readonly ChatMessageView[],
  partnerName: string
): string {
  const lines: string[] = [`OneHook conversation with ${partnerName}`, `Exported ${new Date().toLocaleString()}`, ''];
  for (const m of messages) {
    if (m.undecryptable) continue;
    const who = m.senderId === 'me' ? 'You' : partnerName;
    const when = new Date(m.timestamp).toLocaleString();
    lines.push(`[${when}] ${who}: ${messagePreviewText(m)}`);
  }
  return lines.join('\n');
}
