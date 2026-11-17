/**
 * Analytics client-signal ingest (`IngestSignals`, `POST /signals`) and photo stats (`GetMediaStats`).
 *
 * Both go through the generated `onehook-api-client` SDK (`sdkClient`, analytics.smithy), so they use
 * the same base URL and Cognito authorizer as every other call. The server re-stamps identity and time
 * and marks every signal `unverified`; the client sends the caller's JWT (SDK middleware), names the
 * platform (the `X-OneHook-Platform` header, `platform` in the model) and the batch. On any failure
 * this throws {@link ApiError} so the batching client
 * ({@link file://../lib/analytics/analyticsClient.ts}) re-queues and retries.
 */
import type { RawSignal } from 'onehook-api-client';
import { ApiError } from '../lib/api-client';
import type { AnalyticsTransport, Signal } from '../lib/analytics/analyticsClient';
import { callSdk, sdkClient } from './sdk-client';

/**
 * POST a batch of behavioural signals to the ingest. Throws {@link ApiError} on transport failure
 * or a non-2xx response so the caller re-queues.
 */
export async function sendSignals(batch: Signal[]): Promise<void> {
  try {
    await sdkClient.ingestSignals({
      // Lets the server attribute the platform without trusting the body.
      platform: 'web',
      signals: batch.map((s) => ({
        clientEventId: s.clientEventId,
        type: s.type,
        timestamp: s.timestamp,
        attributes: s.attributes as RawSignal['attributes'],
      })),
    });
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === undefined) {
      throw new ApiError(err instanceof Error ? err.message : 'Network request failed', 0, 'NETWORK_ERROR', err);
    }
    throw new ApiError('analytics ingest failed', status, 'ANALYTICS_INGEST_FAILED', err);
  }
}

/** The {@link AnalyticsTransport} the app's analytics client uses. */
export const signalsTransport: AnalyticsTransport = {
  send: (batch) => sendSignals(batch),
};

/** Owner-facing stats for one of the caller's photos (see GET /signals/media-stats). */
export interface PhotoStats {
  mediaId: string;
  /** Distinct people who viewed it (each person counts once; your own views never count). */
  uniqueViewers: number;
  viewersMoreThanOnce: number;
  viewersMoreThan10: number;
  viewersMoreThan100: number;
  /** Distinct people who opened it full screen. */
  fullscreenViewers: number;
  totalViews: number;
  totalFullscreenOpens: number;
  updatedAt: number | null;
}

/**
 * Stats for the CALLER's own photos. No user id is sent: the server derives the owner from the
 * Cognito JWT, so a client can never read someone else's stats. Returns mediaId → stats.
 */
export async function getMyPhotoStats(): Promise<Record<string, PhotoStats>> {
  const out = await callSdk(() => sdkClient.getMediaStats({}));
  const photos = (out.photos ?? []) as unknown as PhotoStats[];
  return Object.fromEntries(photos.map((p) => [p.mediaId, p]));
}
