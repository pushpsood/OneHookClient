/**
 * E2EE chat message reactions (mirrors iOS `ChatInteractions.swift` / `ChatReactionUsage.swift` / `ChatEmojiCatalog.swift`).
 *
 * Wire format:
 *   - `Message.reactions` is an AWSJSON string mapping `userId -> wireV2Ciphertext`.
 *   - Plaintext inside each reactor's ciphertext is 1..8 normalized emoji concatenated (e.g. "❤️😂").
 *   - Single-emoji reactions remain exact backwards-compatible strings; toggling past 8 drops oldest.
 *   - No emoji content is ever emitted in analytics/telemetry — only action ('add' | 'clear').
 */

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'] as const;
export const MAX_REACTIONS_PER_MEMBER = 8;
export const MAX_REACTION_UTF8_BYTES = 32;

const SEGMENTER =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;

function splitGraphemes(text: string): string[] {
  if (SEGMENTER) {
    return Array.from(SEGMENTER.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** Strips U+FE0F variation selector so ❤ and ❤️ share one identity. */
export function reactionIdentity(emoji: string): string {
  return Array.from(emoji)
    .filter((ch) => ch.codePointAt(0) !== 0xfe0f)
    .join('');
}

export function sameReactionEmoji(a: string, b: string): boolean {
  return reactionIdentity(a) === reactionIdentity(b);
}

/** Validates a single non-ASCII emoji grapheme cluster within UTF-8 bounds. */
export function normalizeSingleReaction(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length !== 1) return null;
  const g = graphemes[0];
  if (new TextEncoder().encode(g).byteLength > MAX_REACTION_UTF8_BYTES) return null;
  if (!/[^\x00-\x7F]/.test(g)) return null;
  if (!/\p{Extended_Pictographic}/u.test(g)) return null;
  return g;
}

/** Parses up to `MAX_REACTIONS_PER_MEMBER` distinct emoji from a decrypted reaction set string. */
export function parseReactionEmojis(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const grapheme of splitGraphemes(value)) {
    const norm = normalizeSingleReaction(grapheme);
    if (!norm) continue;
    const id = reactionIdentity(norm);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(norm);
  }
  return out.slice(-MAX_REACTIONS_PER_MEMBER);
}

export function combineReactionEmojis(emojis: readonly string[]): string | null {
  const list = parseReactionEmojis(emojis.join(''));
  return list.length > 0 ? list.slice(-MAX_REACTIONS_PER_MEMBER).join('') : null;
}

export function normalizeReactionSet(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length === 0 || graphemes.length > MAX_REACTIONS_PER_MEMBER) return null;
  for (const g of graphemes) {
    if (!normalizeSingleReaction(g)) return null;
  }
  return combineReactionEmojis(graphemes);
}

export function toggleReaction(current: string | null | undefined, chosen: string): string | null {
  const list = parseReactionEmojis(current);
  const idx = list.findIndex((e) => sameReactionEmoji(e, chosen));
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    const norm = normalizeSingleReaction(chosen);
    if (norm) list.push(norm);
  }
  return combineReactionEmojis(list);
}

/** Parses `Message.reactions` AWSJSON string into `userId -> ciphertext`. */
export function parseReactionsMap(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [uid, val] of Object.entries(parsed)) {
      if (uid && typeof val === 'string' && val.length > 0) out[uid] = val;
    }
    return out;
  } catch {
    return {};
  }
}

export interface ReactionChip {
  emoji: string;
  count: number;
  includesMine: boolean;
}

export function buildReactionChips(
  decryptedByUser: Record<string, string | null | undefined>,
  myUserId?: string
): ReactionChip[] {
  const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const [uid, setStr] of Object.entries(decryptedByUser)) {
    const isMine = Boolean(myUserId && (uid === myUserId || uid === 'me'));
    for (const emoji of parseReactionEmojis(setStr)) {
      const id = reactionIdentity(emoji);
      const prev = counts.get(id);
      if (prev) {
        prev.count += 1;
        if (isMine) prev.mine = true;
      } else {
        counts.set(id, { emoji, count: 1, mine: isMine });
      }
    }
  }
  const rank = (emoji: string) => {
    const idx = QUICK_REACTIONS.findIndex((q) => sameReactionEmoji(q, emoji));
    return idx >= 0 ? idx : QUICK_REACTIONS.length;
  };
  return Array.from(counts.values())
    .map((entry) => ({ emoji: entry.emoji, count: entry.count, includesMine: entry.mine }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const ra = rank(a.emoji);
      const rb = rank(b.emoji);
      if (ra !== rb) return ra - rb;
      return a.emoji.localeCompare(b.emoji);
    });
}

export interface ReactorEntry {
  userId: string;
  emoji: string;
  isMine: boolean;
}

export function listReactors(
  decryptedByUser: Record<string, string | null | undefined>,
  myUserId?: string
): ReactorEntry[] {
  const entries: ReactorEntry[] = [];
  for (const [uid, setStr] of Object.entries(decryptedByUser)) {
    const isMine = Boolean(myUserId && (uid === myUserId || uid === 'me'));
    for (const emoji of parseReactionEmojis(setStr)) {
      entries.push({ userId: uid, emoji, isMine });
    }
  }
  return entries.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.userId !== b.userId) return a.userId.localeCompare(b.userId);
    return a.emoji.localeCompare(b.emoji);
  });
}

const USAGE_KEY_PREFIX = 'onehook.chat.reactionUsage.';

export function getRankedReactions(userId?: string, limit = 24): string[] {
  if (!userId || typeof window === 'undefined') return [...QUICK_REACTIONS];
  try {
    const raw = window.localStorage.getItem(`${USAGE_KEY_PREFIX}${userId}`);
    if (!raw) return [...QUICK_REACTIONS];
    const counts = JSON.parse(raw) as Record<string, number>;
    const merged = new Set<string>([...QUICK_REACTIONS, ...Object.keys(counts)]);
    return Array.from(merged)
      .filter((e) => normalizeSingleReaction(e) != null)
      .sort((a, b) => {
        const ca = counts[reactionIdentity(a)] ?? 0;
        const cb = counts[reactionIdentity(b)] ?? 0;
        if (cb !== ca) return cb - ca;
        const ia = QUICK_REACTIONS.findIndex((q) => sameReactionEmoji(q, a));
        const ib = QUICK_REACTIONS.findIndex((q) => sameReactionEmoji(q, b));
        return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
      })
      .slice(0, limit);
  } catch {
    return [...QUICK_REACTIONS];
  }
}

export function recordReactionUsage(userId: string | undefined, emoji: string): void {
  const norm = normalizeSingleReaction(emoji);
  if (!userId || !norm || typeof window === 'undefined') return;
  try {
    const key = `${USAGE_KEY_PREFIX}${userId}`;
    const raw = window.localStorage.getItem(key);
    const counts: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const id = reactionIdentity(norm);
    counts[id] = (counts[id] ?? 0) + 1;
    window.localStorage.setItem(key, JSON.stringify(counts));
  } catch {
    /* ignore */
  }
}

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: Array<{ emoji: string; keywords: string }>;
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'hearts',
    label: 'Hearts & Love',
    emojis: [
      { emoji: '❤️', keywords: 'heart love red' },
      { emoji: '🩷', keywords: 'pink heart love' },
      { emoji: '🧡', keywords: 'orange heart' },
      { emoji: '💛', keywords: 'yellow heart' },
      { emoji: '💚', keywords: 'green heart' },
      { emoji: '💙', keywords: 'blue heart' },
      { emoji: '💜', keywords: 'purple heart' },
      { emoji: '🖤', keywords: 'black heart' },
      { emoji: '🤍', keywords: 'white heart' },
      { emoji: '🤎', keywords: 'brown heart' },
      { emoji: '❤️‍🔥', keywords: 'heart fire passion' },
      { emoji: '💖', keywords: 'sparkling heart' },
      { emoji: '💕', keywords: 'two hearts' },
      { emoji: '💓', keywords: 'beating heart' },
      { emoji: '💘', keywords: 'cupid arrow heart' },
      { emoji: '🌹', keywords: 'rose flower' },
      { emoji: '💋', keywords: 'kiss lips' },
      { emoji: '🫶', keywords: 'heart hands love' },
    ],
  },
  {
    id: 'smileys',
    label: 'Smileys',
    emojis: [
      { emoji: '😂', keywords: 'laugh joy tears' },
      { emoji: '🥹', keywords: 'touched tears smile' },
      { emoji: '😍', keywords: 'heart eyes love' },
      { emoji: '🥰', keywords: 'smiling hearts adore' },
      { emoji: '😘', keywords: 'kiss blow' },
      { emoji: '😊', keywords: 'blush warm smile' },
      { emoji: '😁', keywords: 'grin happy' },
      { emoji: '🤣', keywords: 'rofl laugh' },
      { emoji: '😉', keywords: 'wink' },
      { emoji: '😌', keywords: 'relieved calm' },
      { emoji: '🫠', keywords: 'melting' },
      { emoji: '🥳', keywords: 'party celebrate' },
      { emoji: '😮', keywords: 'surprised wow open mouth' },
      { emoji: '🤯', keywords: 'mind blown shocked' },
      { emoji: '😢', keywords: 'cry sad tear' },
      { emoji: '😭', keywords: 'sob crying' },
      { emoji: '🥺', keywords: 'pleading puppy eyes' },
      { emoji: '🤔', keywords: 'thinking hmm' },
      { emoji: '🤭', keywords: 'giggle hand over mouth' },
      { emoji: '🫣', keywords: 'peeking shy' },
      { emoji: '😴', keywords: 'sleepy tired' },
      { emoji: '😎', keywords: 'cool sunglasses' },
      { emoji: '😤', keywords: 'hmph proud' },
      { emoji: '😬', keywords: 'grimace awkward' },
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    emojis: [
      { emoji: '👍', keywords: 'thumbs up yes good' },
      { emoji: '👎', keywords: 'thumbs down no' },
      { emoji: '🙏', keywords: 'please thanks namaste pray' },
      { emoji: '👏', keywords: 'clap applause bravo' },
      { emoji: '🙌', keywords: 'celebrate hands up' },
      { emoji: '🤝', keywords: 'handshake agree' },
      { emoji: '✌️', keywords: 'peace victory' },
      { emoji: '🤞', keywords: 'fingers crossed luck' },
      { emoji: '🫶', keywords: 'heart hands' },
      { emoji: '🫡', keywords: 'salute respect' },
      { emoji: '🤙', keywords: 'call me chill' },
      { emoji: '💪', keywords: 'strong muscle' },
      { emoji: '👋', keywords: 'wave hello bye' },
      { emoji: '🫂', keywords: 'hug embrace' },
    ],
  },
  {
    id: 'vibes',
    label: 'Moments & Vibes',
    emojis: [
      { emoji: '🔥', keywords: 'fire hot lit' },
      { emoji: '✨', keywords: 'sparkles magic' },
      { emoji: '🎉', keywords: 'party confetti celebrate' },
      { emoji: '💯', keywords: '100 agree true' },
      { emoji: '⭐', keywords: 'star favorite' },
      { emoji: '☀️', keywords: 'sun morning' },
      { emoji: '🌙', keywords: 'moon night' },
      { emoji: '☕', keywords: 'coffee cafe date' },
      { emoji: '🥂', keywords: 'cheers toast drink' },
      { emoji: '🍽️', keywords: 'dinner food' },
      { emoji: '🎵', keywords: 'music song' },
      { emoji: '📸', keywords: 'photo camera' },
      { emoji: '📍', keywords: 'pin location' },
      { emoji: '✈️', keywords: 'travel flight trip' },
      { emoji: '👀', keywords: 'eyes looking' },
      { emoji: '💬', keywords: 'chat talk' },
    ],
  },
];
