import { sdkClient } from './sdk-client';

export type LivenessStatus =
  | 'NONE'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'LIVENESS_FAILED'
  | 'FACE_MATCH_FAILED';

/**
 * Face Liveness verification (client side).
 *
 * The client creates the streaming session and lets the FaceLivenessDetector stream video to
 * Rekognition. Analysis is handled ASYNCHRONOUSLY by the backend, which records an authoritative
 * status (NONE | PENDING | APPROVED | REJECTED) and sets the profile's `verified` flag on success.
 * The client reads that status (rather than guessing from `verified`) so it can show an accurate,
 * reload-safe state. Routed through the Smithy-generated SDK — the single source of truth.
 */
export const LivenessApi = {
  /** Create a Rekognition streaming liveness session. */
  createSession: async (): Promise<{ sessionId: string }> => {
    const res: any = await (sdkClient as any).createLivenessSession({});
    return { sessionId: res.sessionId };
  },

  /** Read the authoritative liveness verification status for the caller. */
  getStatus: async (): Promise<{ status: LivenessStatus }> => {
    const res: any = await (sdkClient as any).getLivenessStatus({});
    return { status: (res?.status as LivenessStatus) ?? 'NONE' };
  },
};
