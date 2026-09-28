/**
 * Integration tests for the app analytics wiring (src/lib/analytics/analytics.ts).
 *
 * The portable client itself is covered by src/lib/analytics/analyticsClient.spec.ts. Here we verify
 * the app-level guarantees: stage/consent gating and the batched transport handshake, using an
 * injected mock transport so no network or real config is required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Signal, AnalyticsTransport } from '../lib/analytics/analyticsClient';
import {
  __createIsolatedAnalytics,
  isAnalyticsConsented,
  setAnalyticsConsent,
} from '../lib/analytics/analytics';

function mockTransport(): { transport: AnalyticsTransport; sent: Signal[][] } {
  const sent: Signal[][] = [];
  return {
    sent,
    transport: {
      send: async (batch: Signal[]) => {
        sent.push(batch);
      },
    },
  };
}

describe('analytics gating', () => {
  it('is disabled by default on the current stage (enableAnalytics=false)', () => {
    // The bundled gamma config ships enableAnalytics=false, so nothing emits regardless of consent.
    expect(isAnalyticsConsented()).toBe(false);
  });

  it('consent cannot enable analytics when the stage flag is off', () => {
    setAnalyticsConsent(true);
    expect(isAnalyticsConsented()).toBe(false);
    setAnalyticsConsent(false);
    expect(isAnalyticsConsented()).toBe(false);
  });

  it('an un-consented client never queues or sends', async () => {
    const { transport, sent } = mockTransport();
    const client = __createIsolatedAnalytics(transport, { isConsented: () => false });
    client.track('screen_view', { screen: 'DISCOVERY' });
    client.track('card_impression', { candidateId: 'u1', index: 0 });
    expect(client.pending).toBe(0);
    await client.flush();
    expect(sent).toHaveLength(0);
  });
});

describe('analytics batching', () => {
  it('flushes queued signals to the transport with sanitized attributes', async () => {
    const { transport, sent } = mockTransport();
    const client = __createIsolatedAnalytics(transport, { isConsented: () => true, maxBatchSize: 20 });

    client.track('screen_view', { screen: 'DISCOVERY' });
    // PII / message content must be stripped before it ever reaches the transport.
    client.track('card_swipe_ui', { direction: 'right', candidateId: 'u2', message: 'secret text' });
    expect(client.pending).toBe(2);

    await client.flush();
    expect(sent).toHaveLength(1);
    const batch = sent[0];
    expect(batch.map((s) => s.type)).toEqual(['screen_view', 'card_swipe_ui']);
    expect(batch[1].attributes).toMatchObject({ direction: 'right', candidateId: 'u2' });
    expect(batch[1].attributes).not.toHaveProperty('message');
    expect(typeof batch[0].clientEventId).toBe('string');
    expect(client.pending).toBe(0);
  });

  it('auto-flushes when the batch size is reached', async () => {
    const { transport, sent } = mockTransport();
    const client = __createIsolatedAnalytics(transport, { isConsented: () => true, maxBatchSize: 2 });
    client.track('screen_view', { screen: 'A' });
    client.track('screen_view', { screen: 'B' }); // reaches maxBatchSize → triggers a flush
    await Promise.resolve();
    await client.flush();
    expect(sent.flat().length).toBe(2);
  });

  it('re-queues a failed batch so nothing is lost', async () => {
    const sent: Signal[][] = [];
    let failNext = true;
    const transport: AnalyticsTransport = {
      send: async (batch) => {
        if (failNext) {
          failNext = false;
          throw new Error('network down');
        }
        sent.push(batch);
      },
    };
    const client = __createIsolatedAnalytics(transport, { isConsented: () => true, maxBatchSize: 20 });
    client.track('session_heartbeat');
    await client.flush(); // fails → re-queued
    expect(client.pending).toBe(1);
    await client.flush(); // succeeds
    expect(sent.flat().length).toBe(1);
    expect(client.pending).toBe(0);
  });
});
