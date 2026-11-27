/**
 * ArchiveStore & WalletStore & ChatActivityBadge state.
 * Mirrors iOS `Archives.swift`, `Wallet.swift`, and `ChatActivityBadge.swift`.
 */
import { create } from 'zustand';
import { StateApi } from '../api/state';
import { getCognitoAuth } from '../lib/cognito-auth';
import {
  CurrentHookAction,
  UnarchiveRequestState,
  type ArchiveAllowance,
  type ArchiveItem,
  type ListArchivesResponse,
  type WalletResponse,
} from '../types';
import { refreshUserStateInStore } from '../hooks/use-api';

// ── Archives ─────────────────────────────────────────────────────────────────

export type ArchiveListSort =
  | 'recent'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'age_asc'
  | 'age_desc'
  | 'nearest';

interface ArchiveStoreState {
  list: ListArchivesResponse | null;
  loading: boolean;
  error: string | null;
  seenRequests: Set<string>;
}

export const useArchiveStore = create<ArchiveStoreState>(() => ({
  list: null,
  loading: false,
  error: null,
  seenRequests: new Set<string>(),
}));

export async function refreshArchives(): Promise<ListArchivesResponse | null> {
  useArchiveStore.setState({ loading: true, error: null });
  try {
    const res = await StateApi.listArchives();
    useArchiveStore.setState({ list: res, loading: false, error: null });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load archived chats.';
    useArchiveStore.setState({ loading: false, error: message });
    return null;
  }
}

export async function archiveHookAndSync(matchId: string): Promise<void> {
  await StateApi.archiveHook(matchId);
  await Promise.all([refreshUserStateInStore(), refreshArchives()]);
}

export async function sendUnarchiveAndSync(
  matchId: string,
  currentHook?: CurrentHookAction
): Promise<void> {
  await StateApi.sendUnarchiveRequest(matchId, currentHook);
  await Promise.all([refreshUserStateInStore(), refreshArchives()]);
}

export async function respondUnarchiveAndSync(
  matchId: string,
  accept: boolean,
  currentHook?: CurrentHookAction
): Promise<void> {
  await StateApi.respondUnarchiveRequest(matchId, accept, currentHook);
  await Promise.all([refreshUserStateInStore(), refreshArchives()]);
}

export async function withdrawUnarchiveAndSync(matchId: string): Promise<void> {
  await StateApi.withdrawUnarchiveRequest(matchId);
  await Promise.all([refreshUserStateInStore(), refreshArchives()]);
}

export async function deleteArchiveAndSync(matchId: string): Promise<void> {
  await StateApi.deleteArchive(matchId);
  useArchiveStore.setState((s) =>
    s.list
      ? {
          list: {
            ...s.list,
            archives: s.list.archives.filter((a) => a.matchId !== matchId),
          },
        }
      : s
  );
  await Promise.all([refreshUserStateInStore(), refreshArchives()]);
}

export function markArchiveRequestSeenOnce(matchId: string): void {
  const { seenRequests } = useArchiveStore.getState();
  if (!matchId || seenRequests.has(matchId)) return;
  const next = new Set(seenRequests);
  next.add(matchId);
  useArchiveStore.setState({ seenRequests: next });
  void StateApi.markUnarchiveRequestSeen(matchId).catch(() => undefined);
}

export function totalRemainingArchives(allowance: ArchiveAllowance | null | undefined): number {
  if (!allowance) return 0;
  return Math.max(0, allowance.planIncluded - allowance.planUsed) + allowance.purchased;
}

export function sortArchiveItems(
  items: readonly ArchiveItem[],
  sort: ArchiveListSort,
  profiles: Record<string, { name?: string; age?: number | null } | null | undefined>,
  distancesKm: Record<string, number | null | undefined>
): ArchiveItem[] {
  const incoming = items.filter((a) => a.requestState === UnarchiveRequestState.RECEIVED);
  const rest = items.filter((a) => a.requestState !== UnarchiveRequestState.RECEIVED);

  const cmp = (a: ArchiveItem, b: ArchiveItem): number => {
    switch (sort) {
      case 'oldest':
        return a.archivedAt - b.archivedAt;
      case 'name_asc': {
        const na = (profiles[a.peerId]?.name ?? '').toLowerCase();
        const nb = (profiles[b.peerId]?.name ?? '').toLowerCase();
        if (!na && nb) return 1;
        if (na && !nb) return -1;
        return na.localeCompare(nb);
      }
      case 'name_desc': {
        const na = (profiles[a.peerId]?.name ?? '').toLowerCase();
        const nb = (profiles[b.peerId]?.name ?? '').toLowerCase();
        if (!na && nb) return 1;
        if (na && !nb) return -1;
        return nb.localeCompare(na);
      }
      case 'age_asc': {
        const aa = profiles[a.peerId]?.age;
        const ab = profiles[b.peerId]?.age;
        if (aa == null && ab == null) return b.archivedAt - a.archivedAt;
        if (aa == null) return 1;
        if (ab == null) return -1;
        return aa - ab;
      }
      case 'age_desc': {
        const aa = profiles[a.peerId]?.age;
        const ab = profiles[b.peerId]?.age;
        if (aa == null && ab == null) return b.archivedAt - a.archivedAt;
        if (aa == null) return 1;
        if (ab == null) return -1;
        return ab - aa;
      }
      case 'nearest': {
        const da = distancesKm[a.peerId];
        const db = distancesKm[b.peerId];
        if (da == null && db == null) return b.archivedAt - a.archivedAt;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      }
      default:
        return b.archivedAt - a.archivedAt;
    }
  };

  return [...[...incoming].sort(cmp), ...[...rest].sort(cmp)];
}

// ── Wallet & Boosts ──────────────────────────────────────────────────────────

interface WalletStoreState {
  wallet: WalletResponse | null;
  loading: boolean;
  boosting: boolean;
  error: string | null;
}

export const useWalletStore = create<WalletStoreState>(() => ({
  wallet: null,
  loading: false,
  boosting: false,
  error: null,
}));

export async function refreshWallet(): Promise<WalletResponse | null> {
  useWalletStore.setState({ loading: true, error: null });
  try {
    const wallet = await StateApi.getWallet();
    useWalletStore.setState({ wallet, loading: false, error: null });
    return wallet;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load wallet.';
    useWalletStore.setState({ loading: false, error: message });
    return null;
  }
}

export async function startBoostFromWallet(count = 1): Promise<WalletResponse> {
  useWalletStore.setState({ boosting: true, error: null });
  try {
    const wallet = await StateApi.startBoost(count);
    useWalletStore.setState({ wallet, boosting: false, error: null });
    return wallet;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start boost.';
    useWalletStore.setState({ boosting: false, error: message });
    throw err;
  }
}

export function isWalletBoosting(wallet: WalletResponse | null | undefined, nowMs = Date.now()): boolean {
  const boost = wallet?.boost;
  if (!boost?.active) return false;
  return boost.endsAt * 1000 > nowMs;
}

export async function refreshAuthAfterTierChange(): Promise<void> {
  try {
    await getCognitoAuth().refreshAccessToken();
  } catch {
    /* ignore */
  }
  await refreshUserStateInStore();
}

// ── Chat Activity Red-Dot Badge (ChatActivityBadge.swift) ───────────────────

interface ChatActivityState {
  hasNewActivity: boolean;
  unreadMatchIds: Set<string>;
}

export const useChatActivityStore = create<ChatActivityState>(() => ({
  hasNewActivity: false,
  unreadMatchIds: new Set<string>(),
}));

export function noteChatActivity(matchId?: string): void {
  useChatActivityStore.setState((s) => {
    const next = new Set(s.unreadMatchIds);
    if (matchId) next.add(matchId);
    return { hasNewActivity: true, unreadMatchIds: next };
  });
}

export function clearChatActivity(matchId?: string): void {
  if (!matchId) {
    useChatActivityStore.setState({ hasNewActivity: false, unreadMatchIds: new Set<string>() });
    return;
  }
  useChatActivityStore.setState((s) => {
    const next = new Set(s.unreadMatchIds);
    next.delete(matchId);
    return { hasNewActivity: next.size > 0, unreadMatchIds: next };
  });
}
