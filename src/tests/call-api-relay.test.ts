import { describe, expect, it, vi } from 'vitest';

/**
 * AppSync delivers to `onCallEvent` subscribers ONLY the fields the triggering mutation selected. The
 * relayCallSignal selection therefore has to name every CallEvent field the peer reads; when it left
 * out `ciphertext`, every SIGNAL from web reached the other device with ciphertext null and all of
 * web's ICE candidates were dropped (no media on any call involving a browser).
 */

const graphql = vi.fn(async (_args: { query: string; variables: Record<string, unknown> }) => ({
  data: { relayCallSignal: { callId: 'c1' } },
}));

vi.mock('../api/chat', () => ({
  appSyncClient: () => ({ graphql }),
}));

describe('CallApi.relayCallSignal', () => {
  it('selects every CallEvent field the peer subscription reads, including ciphertext', async () => {
    const { CallApi } = await import('../api/calls');

    await CallApi.relayCallSignal({
      matchId: 'm1',
      callId: 'c1',
      toUserId: 'u2',
      toDeviceId: 'd2',
      fromDeviceId: 'd1',
      ciphertext: 'sealed',
    });

    const { query } = graphql.mock.calls[0][0];
    const selection = query.slice(query.lastIndexOf('{'), query.indexOf('}'));
    for (const field of ['userId', 'callId', 'matchId', 'kind', 'media', 'fromDeviceId', 'toDeviceId', 'ciphertext', 'endReason', 'at']) {
      expect(selection).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });
});
