/**
 * Conversation picker sort model.
 *
 * Owns the sort options, their persisted choice (localStorage), the humanization of wire enums, and
 * the comparator. Two invariants the comparator MUST uphold, matching the shipped iOS design:
 *   1. Mr.OneHook is ALWAYS pinned first, in every order.
 *   2. Unknown age / distance / intent sort LAST — never coerced to 0 (which would wrongly rank an
 *      unknown value as "youngest" or "nearest").
 */
import { useEffect, useState } from 'react';

export type ConversationSort =
  | 'recent'
  | 'name_asc'
  | 'name_desc'
  | 'age_asc'
  | 'age_desc'
  | 'nearest'
  | 'intent';

export interface SortOption {
  id: ConversationSort;
  label: string;
  /** Eyebrow shown above the list, e.g. "SORTED BY NEAREST FIRST". */
  eyebrow: string;
}

export const CONVERSATION_SORTS: SortOption[] = [
  { id: 'recent', label: 'Recent activity', eyebrow: 'SORTED BY RECENT ACTIVITY' },
  { id: 'name_asc', label: 'Name (A–Z)', eyebrow: 'SORTED BY NAME A–Z' },
  { id: 'name_desc', label: 'Name (Z–A)', eyebrow: 'SORTED BY NAME Z–A' },
  { id: 'age_asc', label: 'Age (youngest first)', eyebrow: 'SORTED BY YOUNGEST FIRST' },
  { id: 'age_desc', label: 'Age (oldest first)', eyebrow: 'SORTED BY OLDEST FIRST' },
  { id: 'nearest', label: 'Nearest first', eyebrow: 'SORTED BY NEAREST FIRST' },
  { id: 'intent', label: 'Relationship intent', eyebrow: 'SORTED BY RELATIONSHIP INTENT' },
];

const DEFAULT_SORT: ConversationSort = 'recent';
const STORAGE_KEY = 'onehook.chat.conversationSort';

/** Minimal projection the comparator needs from a conversation row. */
export interface SortableConversation {
  id: string;
  /** Pins the row to the very top regardless of order. */
  isMrOneHook?: boolean;
  name: string;
  age?: number | null;
  distanceKm?: number | null;
  relationshipType?: string | null;
  /** Epoch ms of last activity; higher = more recent. */
  lastActivity?: number | null;
}

/**
 * Humanize a wire enum such as `ETHICALLY_NON_MONOGAMOUS` → "Ethically non monogamous". Returns an
 * empty string for missing values so callers can `filter(Boolean)` parts out.
 */
export function humanizeEnum(value?: string | null): string {
  if (!value) return '';
  const words = value.replace(/[_-]+/g, ' ').trim().toLowerCase().split(/\s+/);
  if (words.length === 0 || words[0] === '') return '';
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function getSortOption(id: ConversationSort): SortOption {
  return CONVERSATION_SORTS.find((s) => s.id === id) ?? CONVERSATION_SORTS[0];
}

function readStoredSort(): ConversationSort {
  if (typeof window === 'undefined') return DEFAULT_SORT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) as ConversationSort | null;
    return CONVERSATION_SORTS.some((s) => s.id === raw) ? (raw as ConversationSort) : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

/** React hook for the persisted sort choice. */
export function useConversationSort(): [ConversationSort, (next: ConversationSort) => void] {
  const [sort, setSort] = useState<ConversationSort>(readStoredSort);

  useEffect(() => {
    const sync = () => setSort(readStoredSort());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const update = (next: ConversationSort) => {
    setSort(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return [sort, update];
}

// A relative ordering for relationship intent, most- to least-committed. Unknown / unlisted values
// fall through to "last".
const INTENT_RANK: Record<string, number> = {
  LIFE_PARTNER: 0,
  LONG_TERM: 1,
  LONG_TERM_OPEN_SHORT: 2,
  SHORT_TERM_OPEN_LONG: 3,
  SHORT_TERM: 4,
  ETHICALLY_NON_MONOGAMOUS: 5,
  FRIENDS: 6,
  FIGURING_IT_OUT: 7,
};

/** number|null-safe ascending compare that always sorts null/undefined LAST. */
function compareNumberAsc(a: number | null | undefined, b: number | null | undefined): number {
  const an = a == null || Number.isNaN(a);
  const bn = b == null || Number.isNaN(b);
  if (an && bn) return 0;
  if (an) return 1; // unknown last
  if (bn) return -1;
  return (a as number) - (b as number);
}

/**
 * Sort conversations for the picker. Mr.OneHook is always first; unknown values always last.
 * Returns a new array (does not mutate the input).
 */
export function sortConversations<T extends SortableConversation>(
  items: T[],
  sort: ConversationSort
): T[] {
  const copy = [...items];
  copy.sort((a, b) => {
    // Invariant 1: Mr.OneHook pinned first in every order.
    if (a.isMrOneHook && !b.isMrOneHook) return -1;
    if (b.isMrOneHook && !a.isMrOneHook) return 1;
    if (a.isMrOneHook && b.isMrOneHook) return 0;

    switch (sort) {
      case 'name_asc':
        return a.name.localeCompare(b.name);
      case 'name_desc':
        return b.name.localeCompare(a.name);
      case 'age_asc':
        return compareNumberAsc(a.age, b.age);
      case 'age_desc': {
        // Oldest first, but unknown still LAST (so we can't just negate age_asc).
        const an = a.age == null;
        const bn = b.age == null;
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        return (b.age as number) - (a.age as number);
      }
      case 'nearest':
        return compareNumberAsc(a.distanceKm, b.distanceKm);
      case 'intent': {
        const ar = a.relationshipType ? INTENT_RANK[a.relationshipType] : undefined;
        const br = b.relationshipType ? INTENT_RANK[b.relationshipType] : undefined;
        return compareNumberAsc(ar ?? null, br ?? null);
      }
      case 'recent':
      default: {
        // Most recent first; unknown activity LAST.
        const an = a.lastActivity == null;
        const bn = b.lastActivity == null;
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        return (b.lastActivity as number) - (a.lastActivity as number);
      }
    }
  });
  return copy;
}
