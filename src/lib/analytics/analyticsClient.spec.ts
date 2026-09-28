/**
 * Unit tests for the web analytics SDK (src/lib/analytics/analyticsClient.ts).
 *
 * Self-contained (no vitest needed): run with `npx tsx src/lib/analytics/analyticsClient.spec.ts`.
 * Kept out of `src/tests` so it does not run in the app's vitest suite.
 */
import {
  AnalyticsClient,
  sanitizeAttributes,
  DENYLISTED_ATTRIBUTE_KEYS,
  type AnalyticsTransport,
  type AnalyticsClientOptions,
  type Signal,
} from './analyticsClient.ts';

const failures: string[] = [];
function check(name: string, condition: boolean) {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

class MockTransport implements AnalyticsTransport {
  batches: Signal[][] = [];
  failNext = 0;
  async send(batch: Signal[]): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('network');
    }
    this.batches.push(batch);
  }
  get flat(): Signal[] {
    return this.batches.flat();
  }
}

let counter = 0;
const uuid = () => `id-${++counter}`;
const now = () => 1_000_000;

function newClient(t: MockTransport, opts: Partial<AnalyticsClientOptions> = {}, consented = true) {
  return new AnalyticsClient({ transport: t, uuid, now, isConsented: () => consented, maxBatchSize: 3, ...opts });
}

async function run() {
  // ── sanitizeAttributes ──────────────────────────────────────────────────────
  console.log('sanitizeAttributes (no PII / no message content):');
  const clean = sanitizeAttributes({ screen: 'discover', dwellMs: 1200, message: 'secret text', email: 'a@b.com' });
  check('keeps allowed scalar attributes', clean.screen === 'discover' && clean.dwellMs === 1200);
  check('strips message content', !('message' in clean));
  check('strips PII (email)', !('email' in clean));
  check('denylist covers message/text/body/email/phone/token/name', ['message', 'text', 'body', 'email', 'phone', 'token', 'name'].every((k) => DENYLISTED_ATTRIBUTE_KEYS.includes(k)));
  check('drops nested objects (no smuggling)', !('nested' in sanitizeAttributes({ nested: { a: 1 } } as any)));

  // ── track + flush ─────────────────────────────────────────────────────────────
  console.log('track + flush:');
  {
    counter = 0;
    const t = new MockTransport();
    const c = newClient(t);
    c.track('screen_view', { screen: 'home' });
    check('signal queued', c.pending === 1);
    await c.flush();
    check('flush sends the batch', t.flat.length === 1);
    check('signal carries a unique clientEventId', t.flat[0].clientEventId === 'id-1');
    check('signal carries client timestamp (informational)', t.flat[0].timestamp === now());
    check('type preserved', t.flat[0].type === 'screen_view');
  }

  // ── consent gate ────────────────────────────────────────────────────────────
  console.log('consent gate:');
  {
    const t = new MockTransport();
    const c = newClient(t, {}, /* consented */ false);
    c.track('screen_view', { screen: 'home' });
    check('nothing queued without consent', c.pending === 0);
    await c.flush();
    check('nothing sent without consent', t.flat.length === 0);
  }

  // ── auto-flush on batch size ──────────────────────────────────────────────────
  console.log('auto-flush on batch size:');
  {
    const t = new MockTransport();
    const c = newClient(t, { maxBatchSize: 3 });
    c.track('card_impression');
    c.track('card_impression');
    c.track('card_impression'); // hits maxBatchSize → auto flush
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    check('auto-flushes when batch fills', t.flat.length === 3);
  }

  // ── retry on failure (nothing lost) ────────────────────────────────────────────
  console.log('retry on transport failure:');
  {
    const t = new MockTransport();
    t.failNext = 1;
    const c = newClient(t, { maxBatchSize: 10 });
    c.track('prompt_view');
    c.track('prompt_view');
    await c.flush(); // fails → re-queued
    check('batch re-queued after failure', c.pending === 2 && t.flat.length === 0);
    await c.flush(); // succeeds
    check('re-queued batch delivered on retry', t.flat.length === 2);
  }

  // ── bounded queue (drop oldest) ─────────────────────────────────────────────────
  console.log('bounded queue:');
  {
    const t = new MockTransport();
    const c = new AnalyticsClient({ transport: t, uuid: () => `x-${++counter}`, now, isConsented: () => true, maxBatchSize: 1000, maxQueueSize: 5 });
    for (let i = 0; i < 20; i++) c.track('session_heartbeat');
    check('queue is capped at maxQueueSize', c.pending === 5);
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} check(s) failed: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('✅ All analyticsClient checks passed.');
}

run();
