import { sdkClient } from './sdk-client';
import type { CompleteLivenessSessionResponse } from 'onehook-api-client';

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
 * The client creates the streaming session, lets the FaceLivenessDetector stream video to
 * Rekognition, and calls `completeSession(sessionId)` once streaming finishes so the backend
 * runs the asynchronous analysis (Rekognition + face match) and updates status / `verified`.
 */
export const LivenessApi = {
  /** Create a Rekognition streaming liveness session. */
  createSession: async (): Promise<{ sessionId: string }> => {
    const res = await sdkClient.createLivenessSession({});
    return { sessionId: res.sessionId };
  },

  /** Signal that streaming is done so the backend evaluates the session asynchronously. */
  completeSession: async (sessionId: string): Promise<CompleteLivenessSessionResponse> => {
    return sdkClient.completeLivenessSession({ sessionId });
  },

  /** Read the authoritative liveness verification status for the caller. */
  getStatus: async (): Promise<{ status: LivenessStatus }> => {
    const res = await sdkClient.getLivenessStatus({});
    return { status: (res.status as LivenessStatus | undefined) ?? 'NONE' };
  },
};
