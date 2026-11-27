/**
 * Pure copy and state rules for forming a new hook (mirrors iOS `HookFormingGuard.swift` and `LetHookGoSheetViewController.swift`).
 */
import type { ArchiveAllowance, PendingCounts, UserStateSnapshot } from '../types';
import { freeSlots } from './app-mode';

export type HookFormingActionKind =
  | 'firstLike'
  | 'likeBack'
  | 'acceptHookRequest'
  | 'sendUnarchive'
  | 'respondUnarchive';

export interface HookFormingPromptSpec {
  title: string;
  message: string;
  requiresArchiveOrDeleteChoice: boolean;
  canArchiveCurrent: boolean;
}

const FIRST_LIKE_DAY_KEY_PREFIX = 'onehook.guard.firstLikeDay.';

function utcDayString(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function hasConfirmedFirstLikeToday(userId: string | undefined, nowMs = Date.now()): boolean {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${FIRST_LIKE_DAY_KEY_PREFIX}${userId}`) === utcDayString(nowMs);
  } catch {
    return false;
  }
}

export function markFirstLikeConfirmedToday(userId: string | undefined, nowMs = Date.now()): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${FIRST_LIKE_DAY_KEY_PREFIX}${userId}`, utcDayString(nowMs));
  } catch {
    /* ignore */
  }
}

export function totalPendingCount(pending?: PendingCounts | null): number {
  if (!pending) return 0;
  return (
    (pending.hookRequestsIn ?? 0) +
    (pending.hookRequestsOut ?? 0) +
    (pending.archiveRequestsIn ?? 0) +
    (pending.archiveRequestsOut ?? 0)
  );
}

export function buildHookFormingPrompt(
  kind: HookFormingActionKind,
  state: UserStateSnapshot | null | undefined,
  allowance: ArchiveAllowance | null | undefined,
  partnerName?: string
): HookFormingPromptSpec | null {
  const slotsLeft = freeSlots(state);
  const pendingCount = totalPendingCount(state?.pending);
  const canArchive =
    Boolean(state?.matching?.status === 'ON') &&
    allowance != null &&
    Math.max(0, allowance.planIncluded - allowance.planUsed) + allowance.purchased > 0;

  if (kind === 'firstLike') {
    if (pendingCount === 0) return null;
    if (hasConfirmedFirstLikeToday(state?.userId)) return null;
    return {
      title: 'Send this like?',
      message: `If you match, your ${pendingCount === 1 ? 'pending request' : `${pendingCount} pending requests`} will be cleared so you stay with one connection.`,
      requiresArchiveOrDeleteChoice: false,
      canArchiveCurrent: false,
    };
  }

  if (slotsLeft > 0) {
    if (pendingCount > 0) {
      return {
        title: partnerName ? `Connect with ${partnerName}?` : 'Form a new hook?',
        message: `Starting this hook clears your ${pendingCount === 1 ? 'other pending request' : `${pendingCount} other pending requests`}.`,
        requiresArchiveOrDeleteChoice: false,
        canArchiveCurrent: false,
      };
    }
    return null;
  }

  // At capacity (currently hooked): must replace or cancel.
  return {
    title: 'Let your current hook go first?',
    message: canArchive
      ? 'You can only hold one active hook right now. Archive your current conversation to keep it read-only, or delete it permanently before continuing.'
      : 'You already have an active hook. Ending it deletes the chat permanently before starting this new connection.',
    requiresArchiveOrDeleteChoice: true,
    canArchiveCurrent: canArchive,
  };
}
