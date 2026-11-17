/**
 * Live-location SHARING on the web (the sender side of OneHookBackend/docs/chat-location-contact.md,
 * "Live-share lifecycle"). The receiving side is lib/live-location.ts + hooks/use-live-locations.ts.
 *
 *  1. Start: the chat mints a sessionId, sends the `live_location` message (contentType TEXT), then
 *     calls {@link LiveLocationSharing.begin}, which publishes the first position straight away (the
 *     first accepted publish creates the server row and fixes `startedAt`).
 *  2. Update: each position fix that moved at least 25 m (or is much more accurate) becomes the share's
 *     pending update; it goes out when the 5-s window is open. Fixes in between replace it (coalesced,
 *     never queued). A member standing still publishes nothing.
 *  3. Stop: Stop here, Stop on another device (`ended` on onLiveLocation), expiry, the hook released or
 *     suspended (State, or the server's `Unauthorized` / `CONVERSATION_SUSPENDED`), or the server
 *     refusing the share. Each one ends the share here; Stop also tells the server.
 *
 * THE TAB OWNS THE SHARE. Browsers give a web page no background location: there is no service-worker
 * geolocation, and a closed tab runs nothing. So a share runs while this tab is open, keeps publishing
 * while the tab is hidden for as long as the browser keeps delivering positions to it, and is stopped
 * when the page goes away (`pagehide`: a best-effort keepalive `stopLiveLocation`; expiry ends it
 * regardless). The UI says so: "Location won't update if you close this tab."
 *
 * This is NOT the matching location: Discover's coordinates come from hooks/use-user-location.ts, a
 * one-shot read that only runs while the page is visible. This engine never touches it.
 *
 * Pure apart from the injected dependencies (transport, location source, clock, page lifecycle), so the
 * throttle, coalescing and lifecycle rules are unit-tested without a browser.
 */
import { GraphQLOperationError } from '../api/graphql-error';
import { isConversationSuspended } from './call-errors';
import { buildLiveLocationUpdatePayload, frameStructuredContent, type LocationFix } from './chat-structured';
import { MAX_LIVE_SHARE_MS } from './live-location';
import { distanceMeters } from './map-links';

/** One accepted publish per 5 s per (match, user, session). */
export const MIN_PUBLISH_INTERVAL_MS = 5_000;
/** Movement below this is not an update (the web has no OS distance filter, so this is it). */
export const DISTANCE_FILTER_M = 25;
/** After this long without moving, positions are requested at low accuracy to save battery. */
export const STATIONARY_AFTER_MS = 2 * 60_000;
/** The backend's ciphertext cap (16 KB). A sealed update is far smaller; bigger means a bug. */
export const MAX_LIVE_CIPHERTEXT_CHARS = 16_384;
/** How often expiry and the pending update are checked while a share runs. */
export const TICK_MS = 1_000;

/** How often the token copy for the pagehide stop is refreshed while a share runs. */
export const UNLOAD_AUTH_REFRESH_MS = 5 * 60_000;

/** The duration choices, with their `chat.live_location_duration` values. */
export const LIVE_DURATIONS = [
  { value: 'min_15', label: '15 minutes', ms: 15 * 60_000 },
  { value: 'hour_1', label: '1 hour', ms: 60 * 60_000 },
  { value: 'hour_8', label: '8 hours', ms: 8 * 60 * 60_000 },
] as const;

export type LiveDurationValue = (typeof LIVE_DURATIONS)[number]['value'];

/** The copy shown everywhere a share is started and on the sharing banner. */
export const TAB_BOUND_COPY = "Location won't update if you close this tab.";

/** Why a share ended on this tab. */
export type LiveShareEndReason =
  /** The member tapped Stop here. */
  | 'stopped'
  /** It reached `expiresAt`. */
  | 'expired'
  /** Stopped on another device or tab, or the server says it is over (`LIVE_LOCATION_ENDED`). */
  | 'ended_elsewhere'
  /** The hook was released or blocked (`Unauthorized`, or the hook left State). */
  | 'released'
  /** The conversation became read-only (`CONVERSATION_SUSPENDED`, or State says suspended). */
  | 'suspended'
  /** The server refused the share (`BadRequest`: a bug, logged). */
  | 'rejected'
  /** Location permission was revoked while sharing. */
  | 'location_denied'
  /** The page was closed, reloaded or navigated away. */
  | 'tab_closed'
  /** The member signed out. */
  | 'signed_out';

/** The toast for a share that ended by itself; null when the member did it (nothing to explain). */
export function endNotice(reason: LiveShareEndReason): string | null {
  switch (reason) {
    case 'expired':
      return 'Live location ended';
    case 'ended_elsewhere':
      return 'Live location stopped on another device';
    case 'released':
      return "Live location stopped: you're no longer hooked";
    case 'suspended':
      return 'Live location paused: this chat is read only';
    case 'rejected':
      return "Live location couldn't continue";
    case 'location_denied':
      return 'Live location stopped: location access was turned off for this site';
    default:
      return null;
  }
}

/** What one publish attempt came to. */
export type PublishOutcome =
  | { kind: 'published' }
  /** `Throttled`: drop this update (never queue it); the next fix goes out. */
  | { kind: 'throttled' }
  /** Transport or encryption failure: keep sharing, the next fix tries again. */
  | { kind: 'failed' }
  | { kind: 'ended'; reason: LiveShareEndReason };

/** Maps a publish error to what the sharer does (the contract's "Errors" table). */
export function publishOutcomeFromError(err: unknown): PublishOutcome {
  if (isConversationSuspended(err)) return { kind: 'ended', reason: 'suspended' };
  const type = err instanceof GraphQLOperationError ? err.errorType : undefined;
  switch (type) {
    case 'Throttled':
      return { kind: 'throttled' };
    case 'LIVE_LOCATION_ENDED':
      return { kind: 'ended', reason: 'ended_elsewhere' };
    case 'Unauthorized':
      return { kind: 'ended', reason: 'released' };
    case 'BadRequest':
      return { kind: 'ended', reason: 'rejected' };
    default:
      return { kind: 'failed' };
  }
}

/** A new share's window: now until `durationMs` from now, never past the backend's 8-hour ceiling. */
export function makeLiveWindow(durationMs: number, now: number): { startedAt: number; expiresAt: number } {
  const length = Math.max(1, Math.min(Math.round(durationMs), MAX_LIVE_SHARE_MS));
  return { startedAt: now, expiresAt: now + length };
}

/** A new share's sessionId: a UUID v4 (the backend accepts 8 to 64 of `A-Z a-z 0-9 -`). */
export function newLiveSessionId(
  rng: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = globalThis.crypto
): string {
  if (typeof rng.randomUUID === 'function') return rng.randomUUID();
  const bytes = rng.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Whether `next` is worth publishing after `reference` (the last position that counted): it moved at
 * least 25 m and by more than its own accuracy radius (so GPS jitter while standing still is not
 * movement), or it is a much better fix of about the same place.
 */
export function isSignificantMove(reference: LocationFix | undefined, next: LocationFix): boolean {
  if (!reference) return true;
  const moved = distanceMeters(reference, next);
  if (moved >= DISTANCE_FILTER_M && moved >= (next.accuracyM ?? 0)) return true;
  const before = reference.accuracyM;
  const after = next.accuracyM;
  return before !== undefined && after !== undefined && after <= before / 2 && before - after >= 10;
}

// ── Dependencies ─────────────────────────────────────────────────────────────

/** The GraphQL calls the engine makes (api/live-location.ts in the app; a fake in tests). */
export interface LiveSharingTransport {
  publish(matchId: string, sessionId: string, ciphertext: string, expiresAt: number): Promise<unknown>;
  stop(matchId: string, sessionId: string): Promise<unknown>;
  /** Synchronous best-effort stop from `pagehide`. Returns whether a request was attempted. */
  stopOnUnload(matchId: string, sessionId: string): boolean;
  /** Follows `onLiveLocation` for a match; returns an unsubscribe function. */
  subscribe(matchId: string, onRow: (row: { matchId: string; userId: string; sessionId: string; ended: boolean }) => void): () => void;
  /** Refreshes the token copy the unload stop uses. */
  primeUnloadAuth(): Promise<void>;
  clearUnloadAuth(): void;
}

export interface LocationWatchOptions {
  highAccuracy: boolean;
}

/** Where positions come from while a share runs (`navigator.geolocation.watchPosition` in the app). */
export interface LiveLocationSource {
  /** Starts watching. `onDenied` fires when permission is refused or revoked. Returns a stop function. */
  watch(onFix: (fix: LocationFix) => void, onDenied: () => void, options: LocationWatchOptions): () => void;
}

export interface SharingClock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** The page's lifecycle (`window` in the app). */
export interface PageLifecycle {
  /** Calls `fn` when the page is being unloaded (or frozen into the back/forward cache). */
  onPageHide(fn: () => void): () => void;
}

export interface LiveSharingDeps {
  transport: LiveSharingTransport;
  location: LiveLocationSource;
  clock: SharingClock;
  page: PageLifecycle;
  log?: (message: string) => void;
}

// ── State ────────────────────────────────────────────────────────────────────

/** Seals a plaintext for this conversation exactly like a message body (wire v2, `matchId` AAD). */
export type SealForMatch = (plaintext: string) => Promise<string>;

export interface BeginShareInput {
  matchId: string;
  sessionId: string;
  startedAt: number;
  expiresAt: number;
  /** The signed-in member (owner of the share), to recognise its own `ended` events. */
  userId: string;
  peerName: string;
  seal: SealForMatch;
}

/** One share this tab runs, as the UI sees it. */
export interface LiveShareView {
  matchId: string;
  sessionId: string;
  peerName: string;
  startedAt: number;
  expiresAt: number;
  /** The last position the server accepted. */
  latest?: LocationFix;
  /** When it was accepted (local clock). */
  lastPublishedAt?: number;
}

/** A share this tab ended, so its bubble shows as ended at once (before or without the server echo). */
export interface EndedShare {
  matchId: string;
  sessionId: string;
  expiresAt: number;
  reason: LiveShareEndReason;
}

export interface LiveSharingSnapshot {
  /** Running shares, by matchId (at most one per conversation). */
  shares: Readonly<Record<string, LiveShareView>>;
  /** Recently ended shares, by sessionId. */
  ended: Readonly<Record<string, EndedShare>>;
  /** True while positions are requested at low accuracy (standing still). */
  lowPower: boolean;
}

interface ShareState extends LiveShareView {
  userId: string;
  seal: SealForMatch;
  /** When the last publish was sent (accepted or not): the 5-s window counts from here. */
  lastAttemptAt?: number;
  /** The newest fix not yet sent, waiting for the window. */
  pending?: LocationFix;
  inFlight: boolean;
  /** Failed publishes in a row (reset by a success or by a new fix). */
  failures: number;
  unsubscribe: () => void;
}

/** How many times one fix is re-sent after transport failures before waiting for the next fix. */
export const MAX_RETRIES_PER_FIX = 3;

const MAX_REMEMBERED_ENDS = 50;

export class LiveLocationSharing {
  private readonly deps: LiveSharingDeps;
  private readonly shares = new Map<string, ShareState>();
  private ended: Record<string, EndedShare> = {};
  private snapshot: LiveSharingSnapshot = { shares: {}, ended: {}, lowPower: false };
  private readonly listeners = new Set<() => void>();
  private readonly endListeners = new Set<(end: EndedShare) => void>();
  private stopWatch: (() => void) | null = null;
  private highAccuracy = true;
  private timer: unknown = null;
  private removePageHide: (() => void) | null = null;
  /** The last fix that counted as movement; later fixes are measured from it. */
  private reference: LocationFix | undefined;
  private lastMoveAt = 0;
  /** When the unload token copy was last refreshed. */
  private lastPrimeAt = 0;

  constructor(deps: LiveSharingDeps) {
    this.deps = deps;
  }

  // ── Observing ──

  /** For `useSyncExternalStore`. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LiveSharingSnapshot => this.snapshot;

  /** Called once per share that ends here, with the reason. */
  onEnd(listener: (end: EndedShare) => void): () => void {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  share(matchId: string): LiveShareView | undefined {
    return this.snapshot.shares[matchId];
  }

  isRunning(sessionId: string): boolean {
    for (const share of this.shares.values()) if (share.sessionId === sessionId) return true;
    return false;
  }

  // ── Lifecycle ──

  /**
   * The start message is on the server: run the share and publish `firstFix` at once. A previous share
   * in the same conversation is stopped first, so each member has one running share per conversation.
   */
  async begin(input: BeginShareInput, firstFix: LocationFix): Promise<void> {
    const now = this.deps.clock.now();
    if (input.expiresAt <= now) return;
    const previous = this.shares.get(input.matchId);
    if (previous && previous.sessionId !== input.sessionId) await this.stop(input.matchId);
    if (this.shares.has(input.matchId)) return;

    const unsubscribe = this.deps.transport.subscribe(input.matchId, (row) => this.handleRow(row));
    this.shares.set(input.matchId, {
      matchId: input.matchId,
      sessionId: input.sessionId,
      peerName: input.peerName,
      startedAt: input.startedAt,
      expiresAt: Math.min(input.expiresAt, input.startedAt + MAX_LIVE_SHARE_MS),
      userId: input.userId,
      seal: input.seal,
      pending: firstFix,
      inFlight: false,
      failures: 0,
      unsubscribe,
    });
    if (!this.reference) {
      this.reference = firstFix;
      this.lastMoveAt = now;
    }
    void this.deps.transport.primeUnloadAuth();
    this.lastPrimeAt = now;
    this.updateRunning();
    this.emit();
    await this.flush(input.matchId);
  }

  /** A new position: when it counts as movement it becomes every share's pending update. */
  async handleFix(fix: LocationFix): Promise<void> {
    if (this.shares.size === 0) return;
    if (!isSignificantMove(this.reference, fix)) return;
    this.reference = fix;
    this.lastMoveAt = this.deps.clock.now();
    if (!this.highAccuracy) this.setAccuracy(true);
    for (const share of this.shares.values()) {
      share.pending = fix;
      share.failures = 0;
    }
    await Promise.all([...this.shares.keys()].map((matchId) => this.flush(matchId)));
  }

  /** Ends expired shares, sends a pending update whose window opened, drops to low power when still. */
  async tick(): Promise<void> {
    const now = this.deps.clock.now();
    for (const share of [...this.shares.values()]) {
      if (now >= share.expiresAt) this.end(share.matchId, 'expired');
    }
    if (this.shares.size > 0 && this.highAccuracy && now - this.lastMoveAt >= STATIONARY_AFTER_MS) {
      this.setAccuracy(false);
    }
    // Someone standing still publishes nothing, and publishing is what refreshes the token copy the
    // pagehide stop needs. Refresh it on a timer too, so it has not expired when the tab closes.
    if (this.shares.size > 0 && now - this.lastPrimeAt >= UNLOAD_AUTH_REFRESH_MS) {
      this.lastPrimeAt = now;
      void this.deps.transport.primeUnloadAuth();
    }
    await Promise.all(
      [...this.shares.values()].filter((s) => s.pending).map((s) => this.flush(s.matchId))
    );
  }

  /** The member tapped Stop on this tab's share: end it here, then tell the server (best effort). */
  async stop(matchId: string): Promise<void> {
    const share = this.shares.get(matchId);
    if (!share) return;
    this.end(matchId, 'stopped');
    await this.stopOnServer(matchId, share.sessionId);
  }

  /**
   * Stop for one of the member's shares this tab may not run (started on another device or tab). The
   * server keys the row by the caller, so only the owner can stop it.
   */
  async stopRemote(matchId: string, sessionId: string): Promise<void> {
    if (this.shares.get(matchId)?.sessionId === sessionId) {
      await this.stop(matchId);
      return;
    }
    this.remember({ matchId, sessionId, expiresAt: this.deps.clock.now(), reason: 'stopped' });
    this.emit();
    await this.stopOnServer(matchId, sessionId);
  }

  /** An `onLiveLocation` row: this member's share ended elsewhere (another device, the backend). */
  handleRow(row: { matchId: string; userId: string; sessionId: string; ended: boolean }): void {
    const share = this.shares.get(row.matchId);
    if (!share || !row.ended || row.userId !== share.userId || row.sessionId !== share.sessionId) return;
    this.end(row.matchId, 'ended_elsewhere');
  }

  /**
   * State changed: a share whose hook is gone (released, blocked) or suspended ends. No network: the
   * backend already ended it. `hooks` null means State has not loaded, which proves nothing.
   */
  reconcile(hooks: readonly { matchId: string; suspended?: boolean }[] | null | undefined): void {
    if (!hooks) return;
    const byMatch = new Map(hooks.map((h) => [h.matchId, h]));
    for (const matchId of [...this.shares.keys()]) {
      const hook = byMatch.get(matchId);
      if (!hook) this.end(matchId, 'released');
      else if (hook.suspended) this.end(matchId, 'suspended');
    }
  }

  /**
   * Signed out (or another account signed in): end everything. The stop goes out through the
   * keepalive path first, because it carries its own copy of the token and still works when the
   * sign-out has already cleared Amplify's session; the Amplify call is the fallback.
   */
  endAll(reason: LiveShareEndReason): void {
    for (const share of [...this.shares.values()]) {
      this.end(share.matchId, reason);
      if (!this.deps.transport.stopOnUnload(share.matchId, share.sessionId)) {
        void this.stopOnServer(share.matchId, share.sessionId);
      }
    }
    this.deps.transport.clearUnloadAuth();
  }

  /**
   * The page is going away. Nothing can be awaited here, so each share gets a synchronous keepalive
   * `stopLiveLocation` (best effort) and ends locally. If the browser drops the request the share
   * still ends at `expiresAt`.
   */
  handlePageHide(): void {
    for (const share of [...this.shares.values()]) {
      const attempted = this.deps.transport.stopOnUnload(share.matchId, share.sessionId);
      if (!attempted) this.deps.log?.('live location: unload stop not attempted, the share ends at expiry');
      this.end(share.matchId, 'tab_closed');
    }
  }

  // ── Publishing ──

  private async flush(matchId: string): Promise<void> {
    const now = this.deps.clock.now();
    const share = this.shares.get(matchId);
    if (!share) return;
    if (now >= share.expiresAt) {
      this.end(matchId, 'expired');
      return;
    }
    const pending = share.pending;
    if (!pending || share.inFlight) return;
    if (share.lastAttemptAt !== undefined && now < share.lastAttemptAt + MIN_PUBLISH_INTERVAL_MS) return;
    share.pending = undefined;
    share.inFlight = true;
    share.lastAttemptAt = now;

    const outcome = await this.publish(share, pending);
    const after = this.shares.get(matchId);
    // The share may have been stopped, or replaced by a new one, while the publish was in flight.
    if (!after || after.sessionId !== share.sessionId) return;
    after.inFlight = false;
    switch (outcome.kind) {
      case 'published':
        after.latest = pending;
        after.lastPublishedAt = this.deps.clock.now();
        after.failures = 0;
        this.emit();
        break;
      case 'throttled':
        break;
      case 'failed':
        // A transient failure (network, the peer's devices not readable just now). Someone standing
        // still produces no new fix, so the same one is retried after the 5-s window, a few times,
        // unless a newer fix has replaced it meanwhile. Coalesced: still at most one pending update.
        after.failures += 1;
        if (!after.pending && after.failures <= MAX_RETRIES_PER_FIX) after.pending = pending;
        break;
      case 'ended':
        this.end(matchId, outcome.reason);
        break;
    }
  }

  private async publish(share: ShareState, fix: LocationFix): Promise<PublishOutcome> {
    let ciphertext: string;
    try {
      ciphertext = await share.seal(frameStructuredContent(buildLiveLocationUpdatePayload(share.sessionId, fix)));
    } catch {
      // The peer's devices could not be read just now, or the fix was unusable: try the next one.
      return { kind: 'failed' };
    }
    if (ciphertext.length > MAX_LIVE_CIPHERTEXT_CHARS) {
      this.deps.log?.('live location: sealed update over 16 KB, share rejected');
      return { kind: 'ended', reason: 'rejected' };
    }
    try {
      await this.deps.transport.publish(share.matchId, share.sessionId, ciphertext, share.expiresAt);
      return { kind: 'published' };
    } catch (err) {
      const outcome = publishOutcomeFromError(err);
      if (outcome.kind === 'ended' && outcome.reason === 'rejected') {
        this.deps.log?.('live location: publish rejected (BadRequest)');
      }
      return outcome;
    }
  }

  private async stopOnServer(matchId: string, sessionId: string): Promise<void> {
    try {
      await this.deps.transport.stop(matchId, sessionId);
    } catch {
      this.deps.log?.('live location: stop failed, the share ends at expiry');
    }
  }

  // ── Running state ──

  private end(matchId: string, reason: LiveShareEndReason): void {
    const share = this.shares.get(matchId);
    if (!share) return;
    this.shares.delete(matchId);
    share.unsubscribe();
    const ended: EndedShare = { matchId, sessionId: share.sessionId, expiresAt: share.expiresAt, reason };
    this.remember(ended);
    this.updateRunning();
    this.emit();
    for (const listener of this.endListeners) listener(ended);
  }

  private remember(ended: EndedShare): void {
    const next = { ...this.ended, [ended.sessionId]: ended };
    const keys = Object.keys(next);
    if (keys.length > MAX_REMEMBERED_ENDS) delete next[keys[0]];
    this.ended = next;
  }

  /** Position updates, the tick and the pagehide hook run only while at least one share does. */
  private updateRunning(): void {
    if (this.shares.size === 0) {
      this.stopWatch?.();
      this.stopWatch = null;
      if (this.timer !== null) this.deps.clock.clearInterval(this.timer);
      this.timer = null;
      this.removePageHide?.();
      this.removePageHide = null;
      this.reference = undefined;
      this.highAccuracy = true;
      return;
    }
    if (!this.stopWatch) this.startWatch();
    if (this.timer === null) this.timer = this.deps.clock.setInterval(() => void this.tick(), TICK_MS);
    if (!this.removePageHide) this.removePageHide = this.deps.page.onPageHide(() => this.handlePageHide());
  }

  private startWatch(): void {
    this.stopWatch = this.deps.location.watch(
      (fix) => void this.handleFix(fix),
      () => {
        for (const matchId of [...this.shares.keys()]) {
          const share = this.shares.get(matchId);
          this.end(matchId, 'location_denied');
          if (share) void this.stopOnServer(matchId, share.sessionId);
        }
      },
      { highAccuracy: this.highAccuracy }
    );
  }

  /** Restarts the position watch at the new accuracy (the Geolocation API cannot change it in place). */
  private setAccuracy(high: boolean): void {
    if (this.highAccuracy === high) return;
    this.highAccuracy = high;
    if (this.stopWatch) {
      this.stopWatch();
      this.stopWatch = null;
      this.startWatch();
    }
    this.emit();
  }

  private emit(): void {
    const shares: Record<string, LiveShareView> = {};
    for (const s of this.shares.values()) {
      const view: LiveShareView = {
        matchId: s.matchId,
        sessionId: s.sessionId,
        peerName: s.peerName,
        startedAt: s.startedAt,
        expiresAt: s.expiresAt,
      };
      if (s.latest) view.latest = s.latest;
      if (s.lastPublishedAt !== undefined) view.lastPublishedAt = s.lastPublishedAt;
      shares[s.matchId] = view;
    }
    this.snapshot = { shares, ended: this.ended, lowPower: !this.highAccuracy && this.shares.size > 0 };
    for (const listener of this.listeners) listener();
  }
}

/**
 * The conversation's live sessions with this tab's own ended shares applied, so a bubble shows "Ended"
 * the moment Stop is tapped (or the share ends here) instead of waiting for the server's echo.
 */
export function withLocalEnds<T extends Record<string, { ended: boolean }>>(
  sessions: T,
  ended: Readonly<Record<string, EndedShare>>,
  matchId: string,
  userId: string,
  now: number,
  merge: (sessions: T, incoming: { userId: string; sessionId: string; at: number; expiresAt: number; ended: boolean }) => T
): T {
  let out = sessions;
  for (const end of Object.values(ended)) {
    if (end.matchId !== matchId) continue;
    out = merge(out, { userId, sessionId: end.sessionId, at: now, expiresAt: end.expiresAt, ended: true });
  }
  return out;
}
