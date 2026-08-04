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

  // --- User lookups ---
  getUser: async (userId: string) => {
    return sdkClient.getUser({ userId });
  },

  getUserByEmail: async (email: string) => {
    return sdkClient.getUserByEmail({ email });
  },
};
if (typeof window !== 'undefined') { (window as any).IdentityApi = IdentityApi; }
