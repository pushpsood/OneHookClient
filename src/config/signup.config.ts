import { APP_STORE_LINKS } from './app-store-links';

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

/** Store listings are set in ./app-store-links (shared with the CDK smart-link redirect). */
export { APP_STORE_LINKS };

/**
 * The platform-aware install smart link (see infra/stacks/frontend-stack.ts). Used for the QR code,
 * posters and texts — anywhere the opening device is unknown.
 */
export const APP_DOWNLOAD_URL = 'https://app.onehook.club';

/** The homepage "Get the app" section: store badges, plus a QR code on desktop. */
export const GET_APP_SECTION_PATH = '/#get-app';

/**
 * Where an on-site "Get the app" button should go.
 *
 * Only a phone whose store listing is live goes straight to the store (one tap to install). Desktops
 * cannot install the app, and a phone whose listing is not live yet would hit a dead end, so both land
 * on the homepage get-app section instead.
 */
export function getAppHref(platform: 'ios' | 'android' | 'other' = guessPlatform()): string {
  const store =
    platform === 'ios' ? APP_STORE_LINKS.ios : platform === 'android' ? APP_STORE_LINKS.android : null;
  return store ? APP_DOWNLOAD_URL : GET_APP_SECTION_PATH;
}

/** Best-effort guess so the page can lead with the right store, without hiding the other. */
export function guessPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}
