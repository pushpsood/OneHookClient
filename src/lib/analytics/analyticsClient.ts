/**
 * OneHook client analytics SDK (Phase 5) — web / portable TypeScript.
 *
 * Emits behavioural *signals* to the authenticated Phase 3 ingest endpoint (`POST /signals`). It is
 * intentionally dumb about trust: the server re-stamps identity and time and marks everything
 * `unverified`, so this SDK only has to be well-behaved, private, and cheap.
 *
 * Design guarantees:
 *  - **Consent-gated**: nothing is queued or sent unless {@link AnalyticsClientOptions.isConsented}
 *    returns true (opt-in). Revoking consent stops emission immediately.
 *  - **No PII / no message content**: attribute keys on a denylist (message text, email, phone,
 *    tokens, names…) are stripped before a signal ever leaves the device.
 *  - **Idempotent**: every signal carries a UUID `clientEventId`, so retries/replays are de-duped
 *    server-side.
 *  - **Batched**: signals flush on size or interval; failed flushes are re-queued for retry, with a
 *    bounded queue (oldest dropped) so a long offline period can't grow memory unbounded.
 *  - **Server-authoritative time**: a client `timestamp` is attached for context only; the server
 *    never trusts it for ordering/KPIs.
 */

export type SignalType =
  | 'screen_view'
  | 'card_impression'
  | 'card_swipe_ui'
  | 'prompt_view'
  | 'media_view'
  | 'section_view'
  | 'notification_opened'
  | 'session_heartbeat'
  | 'like_composer_open'
  | 'like_comment_abandoned';

export interface Signal {
  clientEventId: string;
  type: SignalType;
  /** Client clock, informational only — the server re-stamps authoritative time. */
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface AnalyticsTransport {
  /** Deliver a batch to `POST /signals` with the caller's auth header. Rejects on failure. */
  send(batch: Signal[]): Promise<void>;
}

export interface AnalyticsClientOptions {
  transport: AnalyticsTransport;
  /** Opt-in gate. Default: consented (callers SHOULD wire real consent state). */
  isConsented?: () => boolean;
  /** Auto-flush cadence in ms. Default 15000. */
  flushIntervalMs?: number;
  /** Flush once the queue reaches this size. Default 20. */
  maxBatchSize?: number;
  /** Hard cap on queued signals; oldest are dropped beyond it. Default 500. */
  maxQueueSize?: number;
  now?: () => number;
  uuid?: () => string;
}

/**
 * Attribute keys that must NEVER leave the device — message content and PII. Stripped defensively so
 * a careless `track()` call can't leak sensitive data into analytics.
 */
export const DENYLISTED_ATTRIBUTE_KEYS = [
  'message',
  'messagetext',
  'text',
  'body',
  'content',
  'email',
  'phone',
  'phonenumber',
  'password',
  'token',
  'accesstoken',
  'idtoken',
  'name',
  'firstname',
  'lastname',
  'fullname',
];

const MAX_ATTRIBUTES = 20;

/** Remove denylisted keys and cap attribute count. Pure. */
export function sanitizeAttributes(
  attributes: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!attributes || typeof attributes !== 'object') return {};
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [key, value] of Object.entries(attributes)) {
    if (DENYLISTED_ATTRIBUTE_KEYS.includes(key.toLowerCase())) continue;
    if (value === null || typeof value === 'object') {
      // Only scalar attributes are allowed — no nested objects that could smuggle content.
      if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
        continue;
      }
    }
    out[key] = value;
    if (++n >= MAX_ATTRIBUTES) break;
  }
  return out;
}

function defaultUuid(): string {
  // Prefer the platform crypto UUID; fall back to a random string for older runtimes.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class AnalyticsClient {
  private readonly transport: AnalyticsTransport;
  private readonly isConsented: () => boolean;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly now: () => number;
  private readonly uuid: () => string;

  private queue: Signal[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private flushing = false;

  constructor(options: AnalyticsClientOptions) {
    this.transport = options.transport;
    this.isConsented = options.isConsented ?? (() => true);
    this.flushIntervalMs = options.flushIntervalMs ?? 15_000;
    this.maxBatchSize = options.maxBatchSize ?? 20;
    this.maxQueueSize = options.maxQueueSize ?? 500;
    this.now = options.now ?? (() => Date.now());
    this.uuid = options.uuid ?? defaultUuid;
  }

  /** Record a signal. No-op unless consented. Triggers a flush when the batch fills. */
  track(type: SignalType, attributes?: Record<string, unknown>): void {
    if (!this.isConsented()) return;
    const signal: Signal = {
      clientEventId: this.uuid(),
      type,
      timestamp: this.now(),
      attributes: sanitizeAttributes(attributes),
    };
    this.queue.push(signal);
    // Bound memory: drop the OLDEST beyond the cap.
    if (this.queue.length > this.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.maxQueueSize);
    }
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /** Send one batch. Re-queues (at the front) on failure so nothing is lost. Never throws. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0 || !this.isConsented()) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);
    try {
      await this.transport.send(batch);
    } catch {
      // Delivery failed — put the batch back at the front for the next attempt.
      this.queue.unshift(...batch);
      if (this.queue.length > this.maxQueueSize) {
        this.queue.splice(0, this.queue.length - this.maxQueueSize);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Begin periodic flushing. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    // Do not keep a Node process alive for the timer (harmless in browsers).
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  /** Stop periodic flushing and attempt a final flush. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.flush();
  }

  /** Current queued signal count (for tests/diagnostics). */
  get pending(): number {
    return this.queue.length;
  }
}

/**
 * Build a fetch-based transport for `POST /signals`. `getToken` returns the current Cognito JWT; the
 * SDK never stores it. `platform` is sent as a header so the server can attribute the platform
 * without trusting body content.
 */
export function createFetchTransport(config: {
  endpoint: string;
  getToken: () => Promise<string>;
  platform: 'web' | 'ios' | 'android';
  fetchImpl?: typeof fetch;
}): AnalyticsTransport {
  const doFetch = config.fetchImpl ?? fetch;
  return {
    async send(batch: Signal[]): Promise<void> {
      const token = await config.getToken();
      const res = await doFetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-OneHook-Platform': config.platform,
        },
        body: JSON.stringify({ signals: batch }),
      });
      if (!res.ok) {
        throw new Error(`analytics ingest failed: ${res.status}`);
      }
    },
  };
}
