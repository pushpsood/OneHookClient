import { IdentityApi } from '../api/identity';
import { requestGoogleIdToken } from './google-identity';
import { googleClientId } from '../utils/env.config';

/**
 * Links Google to the signed-in member: a Google ID token from the in-page sheet, then
 * `POST /identity/user/social/link`. Used by account settings and by onboarding. Rejects with
 * "Google sign-in was cancelled." when the member closes the sheet (see `isProviderCancel`).
 */
export async function linkGoogleAccount(): Promise<void> {
  const token = await requestGoogleIdToken(googleClientId);
  await IdentityApi.linkSocial('GOOGLE', token);
}
