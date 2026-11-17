import { useSyncExternalStore } from 'react';
import { LiveLocationApi } from '../api/live-location';
import { browserLocationSource, systemClock, windowPageLifecycle } from '../lib/browser-location';
import {
  LiveLocationSharing,
  type LiveSharingSnapshot,
  type LiveSharingTransport,
} from '../lib/live-location-sharing';
import { useAppStore } from '../store/app-store';

/**
 * The tab's one live-location sharing engine (lib/live-location-sharing.ts), wired to the browser and
 * the app. It is a module singleton, not component state, because a share belongs to the tab: it keeps
 * running while the member switches conversations or leaves the Chat screen, and ends when the tab
 * closes.
 *
 * It follows the app store on its own, so the rules hold wherever the member is in the app:
 *  - a hook that leaves State (released, blocked) or becomes suspended ends its share;
 *  - signing out, or another account signing in, ends every share.
 */

const transport: LiveSharingTransport = {
  publish: (matchId, sessionId, ciphertext, expiresAt) =>
    LiveLocationApi.publishLiveLocation(matchId, sessionId, ciphertext, expiresAt),
  stop: (matchId, sessionId) => LiveLocationApi.stopLiveLocation(matchId, sessionId),
  stopOnUnload: (matchId, sessionId) => LiveLocationApi.stopOnUnload(matchId, sessionId),
  subscribe: (matchId, onRow) => LiveLocationApi.subscribe(matchId, (row) => onRow(row)),
  primeUnloadAuth: () => LiveLocationApi.primeUnloadAuth(),
  clearUnloadAuth: () => LiveLocationApi.clearUnloadAuth(),
};

let engine: LiveLocationSharing | null = null;

/** The engine, created (and attached to the app store) on first use. */
export function liveSharing(): LiveLocationSharing {
  if (engine) return engine;
  const created = new LiveLocationSharing({
    transport,
    location: browserLocationSource(),
    clock: systemClock,
    page: windowPageLifecycle(),
    log: (message) => console.debug(`[chat] ${message}`),
  });
  engine = created;

  let userId = useAppStore.getState().currentUser?.id ?? null;
  let hooks = useAppStore.getState().userState?.hooks;
  useAppStore.subscribe((state) => {
    const nextUser = state.currentUser?.id ?? null;
    if (nextUser !== userId) {
      // Signed out, or a different account: none of the running shares belong to it.
      if (userId !== null) created.endAll('signed_out');
      userId = nextUser;
    }
    const nextHooks = state.userState?.hooks;
    if (nextHooks !== hooks) {
      hooks = nextHooks;
      created.reconcile(nextHooks);
    }
  });
  return created;
}

/** The engine's state, for rendering (banner, Stop buttons, "Ended" before the server echo). */
export function useLiveSharing(): LiveSharingSnapshot {
  const instance = liveSharing();
  return useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot);
}
