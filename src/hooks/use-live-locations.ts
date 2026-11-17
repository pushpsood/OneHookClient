import { useEffect, useRef, useState } from 'react';
import { LiveLocationApi, type LiveLocationUpdate } from '../api/live-location';
import {
  mergeLiveSession,
  sessionFromRow,
  type LiveSessions,
} from '../lib/live-location';

/** Opens a sealed payload with the conversation's E2EE session (`useChatMessages().decryptPayload`). */
export type DecryptPayload = (ciphertext: string) => Promise<{ text: string; undecryptable: boolean }>;

export interface LiveLocationsState {
  /** Every share this device has heard of in the conversation, keyed `<userId>#<sessionId>`. */
  sessions: LiveSessions;
  /** When the latest `getLiveLocations` succeeded, or undefined before the first success. */
  loadedAt?: number;
}

const EMPTY: LiveSessions = {};

/**
 * Follows the live-location shares of one conversation: subscribes to `onLiveLocation` first (so no
 * update slips between the read and the subscribe), then reads the running shares with
 * `getLiveLocations`. Both feed `mergeLiveSession`, which orders them by `at`, so arrival order does
 * not matter. The list is re-read when the tab becomes visible or the network returns, because an
 * update or end missed while the socket was down is not replayed.
 *
 * Positions are decrypted on device. A row that cannot be opened still updates the share's status
 * (ended, expiry), just without moving the pin.
 */
export function useLiveLocations(matchId: string, decrypt: DecryptPayload | undefined): LiveLocationsState {
  const [state, setState] = useState<LiveLocationsState>({ sessions: EMPTY });
  // The decrypt function changes identity when the encryption manager does; reading it through a ref
  // keeps the subscription from being torn down and rebuilt each time.
  const decryptRef = useRef(decrypt);
  decryptRef.current = decrypt;

  useEffect(() => {
    setState({ sessions: EMPTY });
    if (!matchId) return;
    let cancelled = false;

    const open = async (row: LiveLocationUpdate): Promise<string | null> => {
      if (row.ended || !row.ciphertext) return null;
      const fn = decryptRef.current;
      if (!fn) return null;
      try {
        const opened = await fn(row.ciphertext);
        return opened.undecryptable ? null : opened.text;
      } catch {
        return null;
      }
    };

    const apply = async (row: LiveLocationUpdate) => {
      // The subscription is per match, but a row for another conversation must never land here.
      if (row.matchId !== matchId) return;
      const session = sessionFromRow(row, await open(row));
      if (cancelled) return;
      setState((prev) => {
        const sessions = mergeLiveSession(prev.sessions, session);
        return sessions === prev.sessions ? prev : { ...prev, sessions };
      });
    };

    const load = async () => {
      try {
        const rows = await LiveLocationApi.getLiveLocations(matchId);
        await Promise.all(rows.map(apply));
        if (!cancelled) setState((prev) => ({ ...prev, loadedAt: Date.now() }));
      } catch (err) {
        // Non-fatal: bubbles fall back to the start message and its expiry.
        console.debug('[chat] getLiveLocations failed', err);
      }
    };

    const unsubscribe = LiveLocationApi.subscribe(matchId, (row) => void apply(row));
    void load();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const onOnline = () => void load();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      unsubscribe();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    };
  }, [matchId]);

  return state;
}

/** Re-renders every `intervalMs` while `enabled`, for "live until" and "updated 2 min ago" labels. */
export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}
