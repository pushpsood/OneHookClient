/**
 * App-level analytics singleton — the one place the UI reaches for behavioural instrumentation.
 *
 * Wraps the portable, batched {@link AnalyticsClient} with:
 *  - **Gating**: nothing is queued or sent unless analytics is enabled for the stage
 *    (`config.enableAnalytics` / `VITE_ENABLE_ANALYTICS`) AND the user has not opted out. Consent
 *    defaults to opt-in only where the stage flag is on, is persisted in `localStorage`, and
 *    revoking it stops emission immediately.
 *  - **Transport**: the {@link signalsTransport}, which posts to `/signals` on the unified
 *    `onehook-api-client` domain with the caller's Cognito JWT (see `src/api/analytics.ts`).
 *  - **Batching**: inherited from {@link AnalyticsClient} (size- and interval-based, re-queue on
 *    failure, bounded queue). {@link startAnalytics} also emits a periodic `session_heartbeat`.
 *
 * Everything is a no-op when gated off, so instrumentation call sites never need to check state.
 */
import {
  AnalyticsClient,
  type AnalyticsTransport,
  type SignalType,
} from './analyticsClient';
import { signalsTransport } from '../../api/analytics';
import { config } from '../../utils/env.config';

const CONSENT_STORAGE_KEY = 'onehook.analytics.consent';
const SESSION_HEARTBEAT_MS = 60_000;

let consentOverride: boolean | null = null;

/** Read persisted consent; `null` when the user has made no explicit choice. */
function readStoredConsent(): boolean | null {
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* localStorage unavailable (SSR / privacy mode) — treat as no explicit choice. */
  }
  return null;
}

/**
 * Effective consent: OFF unless the stage enables analytics; then honours an explicit opt-out.
 * Where the stage flag is on and the user has made no choice, defaults to opt-in.
 */
export function isAnalyticsConsented(): boolean {
  if (!config.enableAnalytics) return false;
  const explicit = consentOverride ?? readStoredConsent();
  return explicit ?? true;
}

/** Record an explicit consent choice. Revoking stops emission immediately. */
export function setAnalyticsConsent(consented: boolean): void {
  consentOverride = consented;
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, consented ? '1' : '0');
  } catch {
    /* best effort */
  }
  if (!consented) void stopAnalytics();
}

// ── Singleton wiring ───────────────────────────────────────────────────────────

let instance: AnalyticsClient | null = null;
let heartbeat: ReturnType<typeof setInterval> | undefined;

/** The shared client, constructed lazily and gated by {@link isAnalyticsConsented}. */
export function getAnalytics(): AnalyticsClient {
  if (!instance) {
    instance = new AnalyticsClient({
      transport: signalsTransport,
      isConsented: isAnalyticsConsented,
    });
  }
  return instance;
}

/**
 * Begin periodic flushing and session heartbeats. Safe to call more than once and a no-op when
 * gated off. Call once the user is authenticated (e.g. on the main app shell mount).
 */
export function startAnalytics(): void {
  if (!isAnalyticsConsented()) return;
  const client = getAnalytics();
  client.start();
  if (!heartbeat) {
    heartbeat = setInterval(() => client.track('session_heartbeat'), SESSION_HEARTBEAT_MS);
    (heartbeat as unknown as { unref?: () => void }).unref?.();
  }
}

/** Stop heartbeats and flush a final batch. Call on logout / app teardown. */
export async function stopAnalytics(): Promise<void> {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
  await instance?.stop();
}

// ── Typed convenience helpers (the call sites the app uses) ──────────────────────

/** A screen/tab was shown. `screen` is a stable, non-PII identifier (e.g. "DISCOVERY"). */
export function trackScreenView(screen: string): void {
  getAnalytics().track('screen_view', { screen });
}

/** A discovery card was shown to the user. */
export function trackCardImpression(candidateId: string, index: number): void {
  getAnalytics().track('card_impression', { candidateId, index });
}

/** A discovery card swipe/decision UI action (`left` = pass, `right` = like, `up` = super). */
export function trackCardSwipe(direction: 'left' | 'right' | 'up', candidateId?: string): void {
  getAnalytics().track('card_swipe_ui', { direction, candidateId });
}

/** A profile section (photos/prompts/bio/interests/voice) was viewed. `dwellMs` optional. */
export function trackSectionView(
  sectionId: string,
  opts?: { viewedUserId?: string; dwellMs?: number; context?: string }
): void {
  getAnalytics().track('section_view', { sectionId, ...opts });
}

/** A photo/video/voice element was viewed (attraction-depth signal). */
export function trackMediaView(
  mediaId: string,
  mediaType: 'image' | 'video' | 'voice',
  opts?: { dwellMs?: number; index?: number; viewedUserId?: string; context?: string }
): void {
  getAnalytics().track('media_view', { mediaId, mediaType, ...opts });
}

/** The comment-to-like composer was opened on a specific profile element. */
export function trackLikeComposerOpen(likeTargetType?: string, likeTargetRef?: string): void {
  getAnalytics().track('like_composer_open', { likeTargetType, likeTargetRef });
}

/** The composer was closed WITHOUT sending — intent-without-follow-through (hesitation) signal. */
export function trackLikeCommentAbandoned(
  likeTargetType: string | undefined,
  composeDurationMs: number,
  hadDraft: boolean
): void {
  getAnalytics().track('like_comment_abandoned', { likeTargetType, composeDurationMs, hadDraft });
}

/** Escape hatch for any other allowed signal type. */
export function track(type: SignalType, attributes?: Record<string, unknown>): void {
  getAnalytics().track(type, attributes);
}

// ── Test seam ────────────────────────────────────────────────────────────────

/**
 * Build an isolated client with an injected transport and gating — used by unit tests so they can
 * exercise batching/gating without the real network transport or stage config. Not for app use.
 */
export function __createIsolatedAnalytics(
  transport: AnalyticsTransport,
  opts: { isConsented: () => boolean; flushIntervalMs?: number; maxBatchSize?: number }
): AnalyticsClient {
  return new AnalyticsClient({
    transport,
    isConsented: opts.isConsented,
    flushIntervalMs: opts.flushIntervalMs,
    maxBatchSize: opts.maxBatchSize,
  });
}
