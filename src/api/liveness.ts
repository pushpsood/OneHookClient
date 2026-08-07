import { api } from '../lib/api-client';
import { getCognitoAuth } from '../lib/cognito-auth';

/**
 * Face Liveness verification (client side).
 *
 * The client only creates the streaming session and lets the FaceLivenessDetector
 * stream video to Rekognition. Once the video is submitted, ANALYSIS IS HANDLED
 * ASYNCHRONOUSLY BY THE BACKEND — the client does not poll for a result. The
 * outcome surfaces later as the profile's `verified` flag (via GetProfile).
 *
 *   POST /profile/liveness/session  -> { sessionId }   (Cognito JWT attached)
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const tokens = await getCognitoAuth().getStoredTokens();
    if (tokens?.idToken) return { Authorization: `Bearer ${tokens.idToken}` };
  } catch {
    /* auth not initialized — apiRequest will fall back to any stored token */
  }
  return {};
}

export const LivenessApi = {
  /** Create a Rekognition streaming liveness session. */
  createSession: async (): Promise<{ sessionId: string }> => {
    const headers = await authHeaders();
    return api.post<{ sessionId: string }>('/profile/liveness/session', undefined, { headers });
  },
};
