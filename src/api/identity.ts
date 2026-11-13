import { sdkClient } from './sdk-client';

/**
 * Identity service wrapper.
 *
 * Design philosophy (see OneHookBackend/packages/identity): registration is
 * invite-gated and phone-first. A new member validates an invite, requests an
 * SMS OTP, then registers with {phoneNumber, otp, inviteCode} — this returns a
 * user in the ONBOARDING state. Returning users LOG IN directly against Cognito
 * (see lib/cognito-auth), not through these REST endpoints. Social identities
 * (Apple/Google) are only for accounts that were already linked; brand-new
 * users must register by phone first and then link a social provider.
 */
export const IdentityApi = {
  // --- Invites ---
  generateInvite: async (referrerId: string, maxUses?: number) => {
    return sdkClient.generateInvite({ referrerId, maxUses });
  },

  validateInvite: async (inviteCode: string) => {
    return sdkClient.validateInvite({ inviteCode });
  },

  // --- Phone registration (invite-gated, public routes) ---
  requestPhoneOtp: async (phoneNumber: string) => {
    return sdkClient.requestPhoneOtp({ phoneNumber });
  },

  registerPhone: async (
    phoneNumber: string,
    otp: string,
    inviteCode: string,
    displayName?: string
  ) => {
    return sdkClient.registerPhone({ phoneNumber, otp, inviteCode, displayName });
  },

  // --- Social auth (login for already-linked accounts) ---
  authSocial: async (provider: 'APPLE' | 'GOOGLE', token: string) => {
    return sdkClient.authSocial({ provider, token });
  },

  linkSocial: async (provider: 'APPLE' | 'GOOGLE', identityToken: string) => {
    return sdkClient.linkSocial({ provider, identityToken });
  },

  unlinkSocial: async (provider: 'APPLE' | 'GOOGLE') => {
    return sdkClient.unlinkSocial({ provider });
  },

  // --- Email linking (2-step OTP) ---
  requestEmailOtp: async (email: string, password?: string) => {
    return sdkClient.requestEmailOtp({ email, password });
  },

  linkEmail: async (email: string, otp: string) => {
    return sdkClient.linkEmail({ email, otp });
  },

  // --- Phone number update (2-step OTP) ---
  requestPhoneUpdateOtp: async (phoneNumber: string) => {
    return sdkClient.requestPhoneUpdateOtp({ phoneNumber });
  },

  updatePhoneNumber: async (phoneNumber: string, otp: string) => {
    return sdkClient.updatePhoneNumber({ phoneNumber, otp });
  },

  // --- Username and password (signed-in member) ---
  /**
   * `GET /identity/user/username/availability/{username}`. The SDK path-escapes the label. Answers
   * AVAILABLE, TAKEN, INVALID (with a `reason`) or CURRENT (already the caller's own); 429 after 120
   * checks an hour.
   */
  checkUsernameAvailability: async (username: string) => {
    return sdkClient.checkUsernameAvailability({ username });
  },

  /** `PUT /identity/user/username`. 400 when the handle is invalid, reserved, unchanged or taken. */
  updateUsername: async (username: string) => {
    return sdkClient.updateUsername({ username });
  },

  /**
   * `PUT /identity/user/password`: the member's FIRST password, no old one needed. 400 when it fails the
   * pool policy; 409 PASSWORD_ALREADY_SET once one was chosen.
   */
  setPassword: async (password: string) => {
    return sdkClient.setPassword({ password });
  },

  // --- User lookups ---
  getUser: async (userId: string) => {
    return sdkClient.getUser({ userId });
  },

  getUserByEmail: async (email: string) => {
    return sdkClient.getUserByEmail({ email });
  },
};
if (typeof window !== 'undefined') { (window as any).IdentityApi = IdentityApi; }
