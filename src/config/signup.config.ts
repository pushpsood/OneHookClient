/**
 * Where an account can be CREATED, as distinct from where it can be used.
 *
 * Sign-up is native-only; sign-in stays available everywhere including the web.
 *
 * This is a security decision, not a growth one. The first device creates the account-history key, so
 * requiring that device to be an app guarantees the key is in **platform escrow** (iCloud Keychain /
 * Android Block Store) from the moment the account exists. That is what makes it safe to ship without
 * asking users to store a recovery code: every account starts with two independent holders — escrow and
 * a passkey PRF wrap — before it has any history to lose.
 *
 * A web-created account would start with exactly ONE holder on a platform that has no escrow, which is
 * precisely the single-point-of-failure this whole design removes.
 *
 * Accepted cost: trials require an app install, and releases depend on app review.
 *
 * See OneHookBackend/docs/account-key-recovery.md §3.
 */
export const WEB_SIGNUP_ENABLED = false;

/** Where to send someone who tries to sign up on the web. */
export const APP_STORE_LINKS = {
  ios: 'https://apps.apple.com/app/onehook',
  android: 'https://play.google.com/store/apps/details?id=club.onehook.android',
} as const;

/** Best-effort guess so the page can lead with the right store, without hiding the other. */
export function guessPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}
