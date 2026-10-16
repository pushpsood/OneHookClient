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
import {
  Screen,
  type CardVariant,
  type HookedStateAction,
  type LikeTargetType,
  type MediaType,
  type NotificationChannel,
  type NotificationType,
  type ProfileSection,
  type SafetyAction,
  type SwipeDirection,
  type UiElementId,
  type ViewableScreen,
} from './generated/telemetryCatalog';
import { installUiTracking, resolveUiInteraction, type UiTrackOptions } from './uiTracking';

export * from './generated/telemetryCatalog';
export { trackProps, type UiTrackOptions } from './uiTracking';

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
let uninstallUiTracking: (() => void) | undefined;

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
  // One delegated listener emits ui_interaction for every element carrying trackProps(...).
  uninstallUiTracking ??= installUiTracking((i) => client.track('ui_interaction', { ...i }));
}

/** Stop heartbeats and flush a final batch. Call on logout / app teardown. */
export async function stopAnalytics(): Promise<void> {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
  uninstallUiTracking?.();
  uninstallUiTracking = undefined;
  await instance?.stop();
}

// ── Typed convenience helpers (the call sites the app uses) ──────────────────────

/** A screen was shown. Only catalog screens are accepted (same ids on iOS / Android). */
export function trackScreenView(screen: ViewableScreen): void {
  getAnalytics().track('screen_view', { screen });
}

/** Main-shell tab (web routing state) -> canonical catalog screen. */
export const APP_TAB_SCREEN = {
  DISCOVERY: Screen.DISCOVER,
  MATCHES: Screen.CHAT,
  LIKES: Screen.LIKES_YOU,
  PROFILE: Screen.PROFILE,
  SETTINGS: Screen.SETTINGS,
} as const satisfies Record<string, ViewableScreen>;

/** Signed-out routes mapped to their catalog screen (for SHARED-element `context`). */
const PATH_HOST_SCREEN: Record<string, ViewableScreen> = {
  '/': Screen.LANDING,
  '/login': Screen.LOGIN,
  '/redeem': Screen.REDEEM_INVITE,
  '/privacy': Screen.LANDING,
  '/terms': Screen.LANDING,
  '/pricing': Screen.LANDING,
  '/contact': Screen.LANDING,
  '/careers': Screen.LANDING,
  '/science': Screen.LANDING,
  '/auth/setup': Screen.LOGIN,
  '/onboarding': Screen.ONBOARDING,
};

/**
 * Best-effort host screen for globally-mounted SHARED components (toasts, the crash boundary) that
 * have no router context. Precise hosts (phone field in login, voice recorder in onboarding) should
 * pass their known `context` explicitly instead. An unknown value is dropped server-side.
 */
export function hostScreen(): ViewableScreen {
  if (typeof window === 'undefined') return Screen.LANDING;
  const path = window.location.pathname;
  if (PATH_HOST_SCREEN[path]) return PATH_HOST_SCREEN[path];
  return path.startsWith('/app') ? Screen.DISCOVER : Screen.LANDING;
}

/**
 * A registered UI element was interacted with — the standard way to track any click/tap. Prefer the
 * declarative `trackProps(...)` on DOM elements; use this for non-click handlers. Invalid uses
 * (wrong action / missing or unknown value) are dropped with a dev warning.
 */
export function trackUi(elementId: UiElementId, opts?: UiTrackOptions): void {
  const interaction = resolveUiInteraction(elementId, opts);
  if (interaction) getAnalytics().track('ui_interaction', { ...interaction });
}

/** A discovery card was shown to the user. `dwellMs` (time on screen) enables GCP dwell velocity. */
export function trackCardImpression(candidateId: string, index: number, dwellMs?: number): void {
  getAnalytics().track('card_impression', {
    candidateId,
    index,
    ...(dwellMs !== undefined && dwellMs > 0 ? { dwellMs: Math.round(dwellMs) } : {}),
  });
}

/** A discovery card swipe/decision UI action (`left` = pass, `right` = like, `up` = super). */
export function trackCardSwipe(direction: SwipeDirection, candidateId?: string): void {
  getAnalytics().track('card_swipe_ui', { direction, candidateId });
}

/** A profile section (photos/prompts/bio/interests/voice) was viewed. `dwellMs` optional. */
export function trackSectionView(
  sectionId: ProfileSection,
  opts?: { viewedUserId?: string; dwellMs?: number; context?: ViewableScreen; cardVariant?: CardVariant }
): void {
  getAnalytics().track('section_view', { sectionId, ...opts });
}

/** A photo/video/voice element was viewed (attraction-depth signal). */
export function trackMediaView(
  mediaId: string,
  mediaType: MediaType,
  opts?: {
    dwellMs?: number;
    index?: number;
    viewedUserId?: string;
    context?: ViewableScreen;
    cardVariant?: CardVariant;
    playedToCompletion?: boolean;
  }
): void {
  getAnalytics().track('media_view', { mediaId, mediaType, ...opts });
}

/** A photo was opened full screen (owner-facing "opened full screen" stat). */
export function trackMediaFullscreenOpen(
  mediaId: string,
  opts?: { index?: number; viewedUserId?: string; context?: ViewableScreen }
): void {
  getAnalytics().track('media_fullscreen_open', { mediaId, mediaType: 'image', ...opts });
}

/** The comment-to-like composer was opened on a specific profile element. */
export function trackLikeComposerOpen(likeTargetType?: LikeTargetType, likeTargetRef?: string): void {
  getAnalytics().track('like_composer_open', { likeTargetType, likeTargetRef });
}

/** The composer was closed WITHOUT sending — intent-without-follow-through (hesitation) signal. */
export function trackLikeCommentAbandoned(
  likeTargetType: LikeTargetType | undefined,
  composeDurationMs: number,
  hadDraft: boolean
): void {
  getAnalytics().track('like_comment_abandoned', { likeTargetType, composeDurationMs, hadDraft });
}

/** Escape hatch for any other allowed signal type. */
export function track(type: SignalType, attributes?: Record<string, unknown>): void {
  getAnalytics().track(type, attributes);
}

// ── Tier 2: conversation-centric + engagement signals ────────────────────────

/** A specific prompt was viewed (conversation-seed signal). */
export function trackPromptView(promptId: string, opts?: { viewedUserId?: string; cardVariant?: CardVariant }): void {
  getAnalytics().track('prompt_view', { promptId, ...opts });
}

/** A push/in-app notification was opened (re-engagement). `notifType` e.g. new_match|new_message|new_like. */
export function trackNotificationOpened(
  notifType: NotificationType,
  opts?: { matchId?: string; openLatencyMs?: number; channel?: NotificationChannel }
): void {
  getAnalytics().track('notification_opened', { notifType, ...opts });
}

/** A match's conversation was opened (investment / return signal). Metadata only — no content. */
export function trackConversationOpened(
  matchId: string,
  opts?: { unreadCount?: number; msSinceLastMessage?: number }
): void {
  getAnalytics().track('conversation_opened', { matchId, ...opts });
}

/** The message composer was closed WITHOUT sending — the fading/hesitation signal. Metadata only. */
export function trackComposeAbandoned(matchId: string, composeDurationMs: number, hadDraft: boolean): void {
  getAnalytics().track('compose_abandoned', { matchId, composeDurationMs, hadDraft });
}

/** A candidate's/match's profile was re-opened (sustained-interest signal). */
export function trackProfileRevisit(viewedUserId: string, context?: ViewableScreen): void {
  getAnalytics().track('profile_revisit', { viewedUserId, context });
}

// ── Tier 3: differentiator / engagement / safety signals ─────────────────────

/** Reaction to the "one connection at a time" exclusivity overlay. `action` e.g. shown|go_to_chat|dismiss. */
export function trackHookedStateView(action?: HookedStateAction): void {
  getAnalytics().track('hooked_state_view', { action });
}

/** Engagement with the received-likes ("Likes You") surface. */
export function trackLikesYouView(opts?: { count?: number; index?: number }): void {
  getAnalytics().track('likes_you_view', { ...opts });
}

/** Unmatch/block/report UI was opened (intent; the action itself is server-authoritative). */
export function trackSafetyUiOpen(action: SafetyAction, abandoned?: boolean): void {
  getAnalytics().track('safety_ui_open', { action, abandoned });
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
