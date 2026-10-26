/**
 * Member auth token for portal evidence calls.
 *
 * The portal gateway verifies the member's Cognito USER POOL ID token (per the features/moderation
 * client contract: the ID token — not the access token — is the correct bearer). Read the same way
 * sdk-client.ts / rest.ts do: ID token first, access token as a fallback. Returns null when
 * unauthenticated so the request is still attempted (and rejected) rather than throwing here.
 */
export async function getMemberIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}
