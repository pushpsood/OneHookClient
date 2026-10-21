/**
 * Call-eligibility gate for the "calling is locked until you've both messaged" state.
 *
 * The backend exposes `getCallEligibility(matchId)` (see `api/calls.ts` → {@link CallEligibility})
 * and STILL enforces the same rule inside `startCall` (rejecting with `errorType: CallNotAllowed`,
 * mapped to friendly copy in `call-errors.ts`). This module is the advisory client mirror: it fetches
 * eligibility when a conversation opens, re-checks it (throttled) as the conversation progresses, and
 * derives the labels the locked call buttons show.
 *
 * It is deliberately framework-free and fully injectable — no React, no AppSync — so the throttle,
 * fail-open and stop-once-unlocked behaviour is unit-testable under Node (same approach as
 * `call-session.ts`). The React wiring lives in `hooks/use-calls.ts`.
 */
import type { CallEligibility } from '../api/calls';

/** The server copy for the `MESSAGE_FIRST` gate. Used only when the server did not send its own. */
export const CALL_LOCK_FALLBACK_MESSAGE = 'Calling unlocks once you have both sent a message.';

/** Normalised eligibility snapshot the UI renders from. */
export interface CallEligibilityState {
  allowed: boolean;
  reason: string | null;
  message: string | null;
}

/**
 * Fail-open default: UNTIL a definitive `allowed: false` arrives (and whenever a check errors) the
 * buttons stay enabled. A network problem must never block calling — the server is the backstop.
 */
export const DEFAULT_ELIGIBILITY: CallEligibilityState = {
  allowed: true,
  reason: null,
  message: null,
};

/** The user-facing lock copy for a state: the server's message, else the product fallback. */
export function callLockMessage(state: CallEligibilityState): string {
  return state.message?.trim() || CALL_LOCK_FALLBACK_MESSAGE;
}

/**
 * Accessible label for a call button. When locked it conveys WHY, e.g.
 * "Voice call, locked. Calling unlocks once you have both sent a message".
 */
export function callButtonLabel(
  kind: 'audio' | 'video',
  peerName: string,
  locked: boolean,
  lockMessage: string
): string {
  if (!locked) {
    return kind === 'audio'
      ? `Start an audio call with ${peerName}`
      : `Start a video call with ${peerName}`;
  }
  const noun = kind === 'audio' ? 'Voice call' : 'Video call';
  return `${noun}, locked. ${lockMessage}`;
}

/**
 * Decide what a tap on a call button does. A locked tap is STILL a deliberate press (the telemetry
 * fires independently via the delegated tracker), so here we only route behaviour: locked → show the
 * explanation and do NOT start a call; unlocked → start the call.
 */
export function handleCallTap(opts: {
  locked: boolean;
  start: () => void;
  explain: () => void;
}): void {
  if (opts.locked) {
    opts.explain();
    return;
  }
  opts.start();
}

export interface CallEligibilityTrackerDeps {
  matchId: string;
  /** Fetch eligibility for the match. Returning `null` is treated as "allowed" (fail open). */
  getEligibility: (matchId: string) => Promise<CallEligibility | null>;
  /** Called with every new normalised state (initial fetch, each re-check, and fail-open fallbacks). */
  onChange: (state: CallEligibilityState) => void;
  /** Monotonic clock for throttle decisions. Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Minimum spacing between requests for one conversation. Defaults to 3s. */
  throttleMs?: number;
}

/**
 * Drives eligibility for ONE conversation: an immediate initial fetch, then throttled re-checks that
 * coalesce bursts into at most one request per `throttleMs`, and stop entirely once calling is
 * unlocked. Every path fails open — a thrown request or a null result yields `allowed: true`.
 */
export class CallEligibilityTracker {
  private readonly matchId: string;
  private readonly getEligibility: (matchId: string) => Promise<CallEligibility | null>;
  private readonly onChange: (state: CallEligibilityState) => void;
  private readonly now: () => number;
  private readonly throttleMs: number;

  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private trailingTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set once `allowed: true` is observed — no further checks are needed or made. */
  private unlocked = false;
  private disposed = false;

  constructor(deps: CallEligibilityTrackerDeps) {
    this.matchId = deps.matchId;
    this.getEligibility = deps.getEligibility;
    this.onChange = deps.onChange;
    this.now = deps.now ?? (() => Date.now());
    this.throttleMs = deps.throttleMs ?? 3000;
  }

  /** Initial fetch when the conversation opens. Not throttled. */
  start(): void {
    if (this.disposed) return;
    void this.request();
  }

  /**
   * Request a re-check (e.g. after the local user sends, or a peer message arrives). No-op once
   * unlocked. Within the throttle window the call is coalesced into a single trailing request.
   */
  recheck(): void {
    if (this.disposed || this.unlocked) return;
    const elapsed = this.now() - this.lastRequestAt;
    if (elapsed >= this.throttleMs) {
      void this.request();
      return;
    }
    if (this.trailingTimer === undefined) {
      this.trailingTimer = setTimeout(() => {
        this.trailingTimer = undefined;
        if (!this.disposed && !this.unlocked) void this.request();
      }, this.throttleMs - elapsed);
      // Don't keep a test/process alive just for a pending re-check.
      (this.trailingTimer as unknown as { unref?: () => void }).unref?.();
    }
  }

  /** Stop all activity (conversation closed / unmounted). */
  dispose(): void {
    this.disposed = true;
    if (this.trailingTimer !== undefined) {
      clearTimeout(this.trailingTimer);
      this.trailingTimer = undefined;
    }
  }

  private async request(): Promise<void> {
    this.lastRequestAt = this.now();
    try {
      const result = await this.getEligibility(this.matchId);
      if (this.disposed) return;
      if (result == null) {
        // No row yet → nothing to enforce client-side; stay/open up (server still guards startCall).
        this.emit(DEFAULT_ELIGIBILITY);
        return;
      }
      this.emit({
        allowed: result.allowed,
        reason: result.reason ?? null,
        message: result.message ?? null,
      });
    } catch {
      // FAIL OPEN: never block calling on a network/server error — startCall is the real guard.
      if (this.disposed) return;
      this.emit(DEFAULT_ELIGIBILITY);
    }
  }

  private emit(state: CallEligibilityState): void {
    if (state.allowed) {
      this.unlocked = true;
      if (this.trailingTimer !== undefined) {
        clearTimeout(this.trailingTimer);
        this.trailingTimer = undefined;
      }
    }
    this.onChange(state);
  }
}
