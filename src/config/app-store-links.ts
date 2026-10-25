/**
 * Public store listings — the ONE place to set them.
 *
 * Read by both the web app (store badges, "Get the app" buttons, in-app notices) and the CDK stack
 * (the app.onehook.club smart-link redirect), so this file must stay dependency-free: no React, no
 * browser APIs, no imports.
 *
 * `null` means "not published yet": the site shows "coming soon" instead of linking to a store 404,
 * and the smart link sends that platform to web sign-in. Going live is a one-line change here, then
 * a normal pipeline release (the redirect is part of the frontend stack).
 *
 *  - iOS must use the numeric listing URL: `https://apps.apple.com/app/id<NUMERIC_ID>`.
 *  - Android: `https://play.google.com/store/apps/details?id=club.onehook.android`.
 */
export const APP_STORE_LINKS: { readonly ios: string | null; readonly android: string | null } = {
  ios: null,
  android: null,
};
