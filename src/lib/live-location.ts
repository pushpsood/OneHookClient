/**
 * Live-location session state on the receiving side (OneHookBackend/docs/chat-location-contact.md,
 * "Live-share lifecycle").
 *
 * A share starts with a `live_location` chat message. Later positions arrive as `LiveLocationUpdate`
 * rows, from `getLiveLocations` on open and from the `onLiveLocation` subscription; each one moves the
 * pin of the bubble with the same `sessionId` instead of adding a message. The two sources can arrive
 * in any order, so merging is by the backend's `at`: the newer row wins and `ended` is final.
 *
 * Pure: no React, no network. The hook in hooks/use-live-locations.ts feeds it.
 */
import {
  parseLiveLocationUpdate,
  type LiveLocationContent,
} from './chat-structured';

/** Hard ceiling on a share, as enforced by the backend (`startedAt` + 8 h). */
export const MAX_LIVE_SHARE_MS = 8 * 60 * 60 * 1000;

/**
 * How long after the start message a share may still be "about to start". The sharer sends the
 * message first and publishes right after, so a missing row is not proof of a stopped share until
 * this much time has passed.
 */
export const LIVE_START_GRACE_MS = 60 * 1000;

/** A `LiveLocationUpdate` exactly as AppSync returns it (all seven fields). */
export interface LiveLocationRow {
  matchId: string;
  userId: string;
  sessionId: string;
  ciphertext?: string | null;
  at: number;
  expiresAt: number;
  ended: boolean;
}

/** A decrypted position. `updatedAt` is the backend's `at` for the row that carried it. */
export interface LivePosition {
  lat: number;
  lon: number;
  accuracyM?: number;
  headingDeg?: number;
  speedMps?: number;
  updatedAt: number;
}

/** What this device knows about one share. */
export interface LiveSessionState {
  userId: string;
  sessionId: string;
  at: number;
  expiresAt: number;
  ended: boolean;
  /** Absent when the row carried no readable position (ended, or not decryptable here). */
  position?: LivePosition;
}

export type LiveSessions = Readonly<Record<string, LiveSessionState>>;

/** Shares are keyed by owner AND session: the backend keys rows by `<userId>#<sessionId>` too. */
export function liveSessionKey(userId: string, sessionId: string): string {
  return `${userId}#${sessionId}`;
}

/**
 * Turns a row plus its decrypted plaintext (null when it could not be opened) into session state.
 * A plaintext that is not a valid update for the row's own session contributes no position.
 */
export function sessionFromRow(row: LiveLocationRow, plaintext: string | null): LiveSessionState {
  const state: LiveSessionState = {
    userId: row.userId,
    sessionId: row.sessionId,
    at: row.at,
    expiresAt: row.expiresAt,
    ended: Boolean(row.ended),
  };
  if (state.ended || plaintext === null) return state;
  const update = parseLiveLocationUpdate(plaintext, row.sessionId);
  if (!update) return state;
  const position: LivePosition = { lat: update.lat, lon: update.lon, updatedAt: row.at };
  if (update.accuracyM !== undefined) position.accuracyM = update.accuracyM;
  if (update.headingDeg !== undefined) position.headingDeg = update.headingDeg;
  if (update.speedMps !== undefined) position.speedMps = update.speedMps;
  state.position = position;
  return state;
}

/**
 * Merges one incoming state. Returns the same object when nothing changes, so React can skip a render.
 *
 *  - `ended` is final: once a share ended, no row revives it (a stale `getLiveLocations` result that
 *    lands after the end event must not restart the pin). The ended state drops the live position.
 *  - Otherwise the newer `at` wins. On a tie the incoming row wins only if it adds a position.
 *  - A newer row without a readable position keeps the previous position (with its own `updatedAt`).
 */
export function mergeLiveSession(sessions: LiveSessions, incoming: LiveSessionState): LiveSessions {
  const key = liveSessionKey(incoming.userId, incoming.sessionId);
  const existing = sessions[key];
  if (!existing) {
    const stored = incoming.ended ? withoutPosition(incoming) : incoming;
    return { ...sessions, [key]: stored };
  }
  if (existing.ended) return sessions;
  if (incoming.ended) {
    return {
      ...sessions,
      [key]: withoutPosition({ ...incoming, at: Math.max(existing.at, incoming.at) }),
    };
  }
  if (incoming.at < existing.at) return sessions;
  if (incoming.at === existing.at && (existing.position || !incoming.position)) return sessions;
  const merged: LiveSessionState = incoming.position
    ? incoming
    : existing.position
      ? { ...incoming, position: existing.position }
      : incoming;
  return { ...sessions, [key]: merged };
}

function withoutPosition(state: LiveSessionState): LiveSessionState {
  if (!state.position) return state;
  const { position: _dropped, ...rest } = state;
  void _dropped;
  return rest;
}

/** Whether a live share is running right now. */
export function isLiveSessionRunning(session: LiveSessionState, now: number): boolean {
  return !session.ended && now < session.expiresAt;
}

/**
 * One pin per member: each member's running share with the newest `at` that has a position.
 * Keyed by userId.
 */
export function latestPinPerMember(
  sessions: LiveSessions,
  now: number
): Record<string, LiveSessionState & { position: LivePosition }> {
  const out: Record<string, LiveSessionState & { position: LivePosition }> = {};
  for (const session of Object.values(sessions)) {
    if (!session.position || !isLiveSessionRunning(session, now)) continue;
    const current = out[session.userId];
    if (!current || session.at > current.at) {
      out[session.userId] = session as LiveSessionState & { position: LivePosition };
    }
  }
  return out;
}

/** What a live-location bubble shows right now. */
export interface LiveBubbleView {
  status: 'live' | 'ended';
  lat: number;
  lon: number;
  accuracyM?: number;
  /** When the shown position was accepted (or the share started, before any update). */
  updatedAt: number;
  expiresAt: number;
  /** True when the position came from an update rather than the start message. */
  moved: boolean;
}

export interface ResolveLiveBubbleInput {
  start: LiveLocationContent;
  /** The state for `<sender>#<start.sessionId>`, if any arrived. */
  session?: LiveSessionState;
  /** Server timestamp of the start message (epoch ms). */
  sentAt: number;
  /** When the latest successful `getLiveLocations` for this conversation returned (epoch ms). */
  loadedAt?: number;
  now: number;
}

/**
 * Resolves a bubble from its start message and whatever the backend reported. The share is ended when
 * the backend said so, when `expiresAt` passed, or when a running-share list fetched well after the
 * share began did not contain it (it was stopped, or ended by the backend, while this device was
 * away). A list fetched before or right after the start proves nothing; the subscription covers that.
 * `expiresAt` never exceeds the backend's 8-hour ceiling, whatever the start message claims.
 */
export function resolveLiveBubble({ start, session, sentAt, loadedAt, now }: ResolveLiveBubbleInput): LiveBubbleView {
  const ceiling = start.startedAt + MAX_LIVE_SHARE_MS;
  const expiresAt = Math.min(session?.expiresAt ?? start.expiresAt, ceiling);
  const missingAfterLoad =
    !session && loadedAt !== undefined && loadedAt - sentAt > LIVE_START_GRACE_MS;
  const ended = Boolean(session?.ended) || now >= expiresAt || missingAfterLoad;
  const position = session?.position;
  return {
    status: ended ? 'ended' : 'live',
    lat: position?.lat ?? start.lat,
    lon: position?.lon ?? start.lon,
    accuracyM: position ? position.accuracyM : start.accuracyM,
    updatedAt: position?.updatedAt ?? start.startedAt,
    expiresAt,
    moved: Boolean(position),
  };
}

/** "just now", "4 min ago", "2 h ago". */
export function formatUpdatedAgo(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/** Clock time for "Live until 14:05"; prefixed with the weekday when it is not today. */
export function formatClockTime(at: number, now: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date(now).toDateString()) return time;
  return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}
