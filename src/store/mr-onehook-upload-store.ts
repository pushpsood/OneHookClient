/**
 * App-lifetime store for Mr.OneHook Pro file attachments & uploads (mirrors iOS
 * `MrOneHookUploadManager` from `feat/pro-improvements`).
 *
 * Keeping the selected tray and in-flight uploads here rather than local component state means
 * switching tabs (e.g., to Profile or Discover to upgrade to Pro) does not cancel uploads or drop
 * ready/waiting files. Cleared on sign-out or when sent.
 */
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { AttachmentKind, AttachmentSource, MrOneHookPlan, type MrOneHookPlanLimits } from 'onehook-mr-onehook-client';
import {
  runAttachment,
  selectAttachments,
  type AttachmentDeps,
  type LocalFile,
  type PendingAttachment,
  type SelectionRejection,
} from '../lib/mr-onehook-attachments';
import { type AttachmentProblem } from '../lib/mr-onehook-contract';
import { sdkAttachmentDeps, type TurnAttachments, type UseMrOneHookAttachments } from '../lib/mr-onehook';

interface UploadStoreState {
  ownerId?: string;
  items: PendingAttachment[];
}

export const useMrOneHookUploadStore = create<UploadStoreState>(() => ({
  items: [],
}));

const runningIds = new Set<string>();
const removedIds = new Set<string>();

function startItemUpload(
  item: PendingAttachment,
  depsFactory: (cancelled: () => boolean) => AttachmentDeps = sdkAttachmentDeps
): void {
  if (runningIds.has(item.localId)) return;
  const ownerAtStart = useMrOneHookUploadStore.getState().ownerId;
  runningIds.add(item.localId);
  const cancelled = () =>
    removedIds.has(item.localId) || useMrOneHookUploadStore.getState().ownerId !== ownerAtStart;

  void runAttachment(item, depsFactory(cancelled), (next) => {
    useMrOneHookUploadStore.setState((s) => ({
      items: s.items.map((i) => (i.localId === next.localId ? next : i)),
    }));
  }).finally(() => {
    runningIds.delete(item.localId);
  });
}

export const MrOneHookUploadManager = {
  syncOwner(userId: string | undefined): void {
    const curr = useMrOneHookUploadStore.getState().ownerId;
    if (curr !== userId) {
      for (const it of useMrOneHookUploadStore.getState().items) {
        removedIds.add(it.localId);
      }
      runningIds.clear();
      useMrOneHookUploadStore.setState({ ownerId: userId, items: [] });
    }
  },

  addFiles(
    files: readonly LocalFile[],
    limits: Pick<MrOneHookPlanLimits, 'maxAttachmentBytes' | 'maxAttachmentsPerMessage'>
  ): SelectionRejection[] {
    const { items: next, rejected } = selectAttachments(useMrOneHookUploadStore.getState().items, files, limits);
    useMrOneHookUploadStore.setState({ items: next });
    return rejected;
  },

  adopt(adopted: PendingAttachment[], maxAttachments: number): void {
    if (adopted.length === 0) return;
    useMrOneHookUploadStore.setState((s) => {
      const existingIds = new Set(s.items.map((i) => i.attachmentId).filter(Boolean));
      const unique = adopted.filter((i) => !i.attachmentId || !existingIds.has(i.attachmentId));
      return { items: [...s.items, ...unique].slice(0, Math.max(1, maxAttachments)) };
    });
  },

  remove(localId: string): void {
    removedIds.add(localId);
    useMrOneHookUploadStore.setState((s) => ({
      items: s.items.filter((i) => i.localId !== localId),
    }));
  },

  clear(): void {
    for (const it of useMrOneHookUploadStore.getState().items) {
      removedIds.add(it.localId);
    }
    useMrOneHookUploadStore.setState({ items: [] });
  },

  repoll(): void {
    useMrOneHookUploadStore.setState((s) => ({
      items: s.items.map((i) => (i.attachmentId && i.status === 'ready' ? { ...i, status: 'processing' } : i)),
    }));
  },

  markFailed(problem: AttachmentProblem): void {
    useMrOneHookUploadStore.setState((s) => ({
      items: s.items.map((i) => ({ ...i, status: 'failed', problem })),
    }));
  },

  pumpProUploads(
    plan: MrOneHookPlan,
    depsFactory: (cancelled: () => boolean) => AttachmentDeps = sdkAttachmentDeps
  ): void {
    if (plan !== MrOneHookPlan.PRO) return;
    for (const item of useMrOneHookUploadStore.getState().items) {
      if ((item.status === 'selected' || (item.status === 'processing' && item.attachmentId)) && !runningIds.has(item.localId)) {
        startItemUpload(item, depsFactory);
      }
    }
  },

  turnAttachments(): TurnAttachments {
    const ready = useMrOneHookUploadStore.getState().items.filter((i) => i.status === 'ready' && i.attachmentId);
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
  },
};

/**
 * Drop-in replacement for `useMrOneHookAttachments` backed by app-lifetime `MrOneHookUploadManager`.
 * Navigating away from Mr.OneHook chat keeps uploads running and tray intact until sent/cleared.
 */
export function useMrOneHookPersistentUploads(options: {
  userId?: string;
  plan: MrOneHookPlan;
  limits: Pick<MrOneHookPlanLimits, 'maxAttachmentBytes' | 'maxAttachmentsPerMessage'>;
  deps?: (cancelled: () => boolean) => AttachmentDeps;
}): UseMrOneHookAttachments {
  const { userId, plan, limits, deps } = options;
  const items = useMrOneHookUploadStore((s) => s.items);

  useEffect(() => {
    if (userId) MrOneHookUploadManager.syncOwner(userId);
  }, [userId]);

  useEffect(() => {
    MrOneHookUploadManager.pumpProUploads(plan, deps);
  }, [plan, items, deps]);

  const add = useCallback(
    (files: LocalFile[]) => MrOneHookUploadManager.addFiles(files, limits),
    [limits]
  );
  const adopt = useCallback(
    (adopted: PendingAttachment[]) => MrOneHookUploadManager.adopt(adopted, limits.maxAttachmentsPerMessage),
    [limits.maxAttachmentsPerMessage]
  );
  const remove = useCallback((localId: string) => MrOneHookUploadManager.remove(localId), []);
  const clear = useCallback(() => MrOneHookUploadManager.clear(), []);
  const repoll = useCallback(() => MrOneHookUploadManager.repoll(), []);
  const markFailed = useCallback((problem: AttachmentProblem) => MrOneHookUploadManager.markFailed(problem), []);
  const turnAttachments = useCallback(() => MrOneHookUploadManager.turnAttachments(), []);

  return { items, add, adopt, remove, clear, repoll, markFailed, turnAttachments };
}
