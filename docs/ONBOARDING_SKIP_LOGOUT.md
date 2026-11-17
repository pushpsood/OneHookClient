# Onboarding: "Skip for now" (sign out, resume later)

A member can leave the web onboarding wizard at any step with the "Skip for now" button in the
wizard header. It signs them out completely and returns them to the landing page. Onboarding is
still required: the next sign-in brings them back to the wizard.

This document covers the web client only. The native apps live in the separate OneHookPlatform
repository and are not described here. Sign-up is app-only (`WEB_SIGNUP_ENABLED = false` in
`src/config/signup.config.ts`), so the web wizard only runs for accounts created in the app that
have not finished onboarding.

## Files

| File | What it holds |
|---|---|
| `src/components/onboarding/OnboardingWizard.tsx` | `handleSkipAndLogout` (lines 469-482) and the header button (lines 531-541) |
| `src/lib/cognito-auth.ts` | `CognitoAuthService.logout` (lines 253-261) |
| `src/lib/chat-encryption.ts` | `resetSharedEncryptionState` (line 334) and `secureHistoryKeyForSignOut` (lines 352-368) |
| `src/store/app-store.ts` | the store `logout()` action (lines 74-87) |
| `src/App.tsx` | `ProtectedRoute`, `OnboardedRoute` (line 72) and `OnboardingGuard` (line 100) |
| `src/hooks/use-registration-prerequisites.ts`, `src/lib/registration-prerequisites.ts` | the escrow check `OnboardingGuard` runs |
| `src/tests/sign-out-key-hygiene.test.ts` | sign-out key-hygiene and wiring tests |

## The wizard

The steps come from `ONBOARDING_STEPS` in `src/lib/account-setup.ts`: `basics` (name and date of
birth), `photo`, `username`, `password`, `social` (link Google) and `recovery` (passkey).
`onboardingSteps(hasPassword)` drops the password step when the account already has a password. The
header shows "Step N of M", the step title and a progress bar.

There are three different skip controls. Only the header button signs out.

| Control | Where | Effect | Telemetry |
|---|---|---|---|
| "Skip for now" (header) | every step | signs out (below) | `UiElement.ONBOARDING_SKIP_SIGN_OUT` |
| "Skip" | password and social steps | moves to the next step | `ONBOARDING_STEP_SKIP` with `password` / `social` |
| "Skip for now" (bottom of the recovery step) | recovery step | finishes onboarding without setting up recovery (`POST /state/complete-onboarding`) | `ONBOARDING_STEP_SKIP` with `recovery` |

## What the header button does

The button sits at the top right of the wizard card, with a `LogOut` icon. The "Skip for now" label
shows from the `sm` breakpoint up; on smaller screens only the icon shows. Its `title` is "Sign out
and continue later".

`handleSkipAndLogout`:

1. Sets `loggingOut`. The wizard then renders a full-screen `LoadingSpinner` in place of the card.
2. Calls `getCognitoAuth().logout()`, which:
   1. reads the user's `sub` from the cached Amplify session (no network call while tokens are
      valid);
   2. runs `secureHistoryKeyForSignOut(userId)`. This confirms that a DEVICE wrap of the account
      history key exists for this browser, publishing one if it is missing, and then deletes the
      history private key (the `CryptoKey` and its PKCS#8 bytes) from IndexedDB. If the wrap cannot
      be confirmed (offline, expired session, a key that cannot be re-wrapped) the key is kept,
      because it may be the only copy. It gives up after 4 seconds and never throws. The
      non-extractable device key stays, so the next sign-in on this browser re-opens history through
      the device wrap without a prompt;
   3. calls `resetSharedEncryptionState()`, so no in-memory identity is reused by the next session;
   4. calls Amplify `signOut()`.
3. Calls the store `logout()`, which removes the `id_token`, `refresh_token` and `accessToken`
   `localStorage` keys, clears the view passes (`viewPasses.clear()`), and resets `currentUser`,
   `userState`, `isAuthenticated`, `candidates`, `currentCandidate` and `error`.
4. Shows the info toast "You can continue your profile anytime. See you soon!"
5. Navigates to `/` with `replace`.

If `getCognitoAuth().logout()` throws (in practice, Amplify `signOut()` failing), the store is not
cleared, the error toast "Could not sign out. Please try again." appears, and the wizard comes back.
By then the history key may already have been removed from IndexedDB; the still-signed-in session
re-opens history through the device wrap the next time it is needed.

## What is kept

The skip does not change server-side state. The State service keeps the account in `ONBOARDING`
until `StateApi.completeOnboarding()` (`POST /state/complete-onboarding`, retried on 409 after 0.8,
2 and 4 seconds) moves it to `AVAILABLE`.

What the member entered survives only if a step already saved it:

| Data | Saved when | Read back on return by |
|---|---|---|
| Display name, date of birth, avatar | "Continue" on the photo step (`ProfileApi.upsertChat`, `PUT /profile/chat`) | `ProfileApi.getMine()`. A stored, non-provisional date of birth comes back confirmed and locked |
| Username | "Continue" on the username step (`IdentityApi.updateUsername`) | `IdentityApi.getUser()` |
| Password | "Continue" on the password step (`IdentityApi.setPassword`) | `getUser().hasPassword`, which removes the password step |
| Google link | "Link Google" (`linkGoogleAccount`) | `getUser().googleId`, shown as "Google · Linked" |
| Account recovery passkey | "Set up recovery" (`setUpAccountRecovery`) | not read back; a successful setup finishes onboarding immediately |

Not kept:

- The current step. The wizard always reopens on `basics`, prefilled, and the member clicks through
  the saved steps. Every step's call is idempotent.
- Name and date of birth typed on `basics` but not yet saved by the photo step.
- A photo uploaded on the photo step before "Continue". `ProfileApi.uploadMedia(file, 'CHAT')` stores
  the media, but its key reaches the profile only through `PUT /profile/chat`.

## The next sign-in

1. `/login` signs the member in and navigates to `/auth/setup` (`AuthSetupWizard`), which continues
   to `/app`.
2. `/app` is wrapped in `ProtectedRoute` and `OnboardedRoute`. `OnboardedRoute` fetches the state
   with `useUserState()` (`GET /state/{userId}`), shows a spinner while it loads, and redirects to
   `/onboarding` when there is no state record or the state is `ONBOARDING`. It fails closed: an
   unknown state never opens the app.
3. `/onboarding` is wrapped in `ProtectedRoute` and `OnboardingGuard`. The guard sends anyone past
   `ONBOARDING` to `/app`. Otherwise it waits for `useRegistrationPrerequisites()`. That check
   requires an `ESCROW` wrap of the account history key, which only the native apps can create; a
   passkey (PRF) wrap is recommended but not required. If the check fails, the guard shows
   `FinishSetupInAppNotice` instead of the wizard.
4. The wizard mounts, prefills from `ProfileApi.getMine()` and `IdentityApi.getUser()`, and starts
   on `basics`.

## Other web sign-out paths

Every sign-out goes through `CognitoAuthService.logout()`, so all of them get the same key hygiene.
They differ in what happens around it:

| Where | Store reset | On a Cognito error | Then |
|---|---|---|---|
| Onboarding "Skip for now" | `logout()` | stops; error toast; store kept | toast, `navigate('/', { replace: true })` |
| App sign-out (`src/app/AppContent.tsx`, `performLogout`, after a confirmation dialog) | `logout()` | logged and ignored | toast "You're signed out.", `navigate('/', { replace: true })` |
| App profile-load error screen (`AppContent.tsx`) | `logout()` | logged and ignored | `navigate('/login')` |
| "Sign out to set a password" (`src/components/profile/SetPasswordCard.tsx`) | `useAppStore.getState().logout()` | stops; error toast; store kept | toast, `navigate('/')` |
| Landing nav "Logout" (`src/components/Landing.tsx`) | `logout()` | ignored | stays on `/` |
| Profile deletion (`src/components/profile/AccountSettingsCard.tsx`) | none; the full page reload clears memory | ignored | `window.location.href = '/'` after 2 seconds |
| Back to the identifier step in `Login` (`resetToIdentifier`) | none | ignored | stays on `/login` |

The set-password sign-out used to set only `isAuthenticated = false`, so the next account signed in
from the same tab started with the previous member's profile, state and view passes. It now calls
the full store `logout()`.

## Tests

`src/tests/sign-out-key-hygiene.test.ts` covers:

- sign-out drops the history private key when a DEVICE wrap exists and keeps the device key;
- it publishes a missing DEVICE wrap first, then drops the key;
- it keeps the key when the wrap cannot be published or history state cannot be read, and returns
  within the timeout;
- it leaves other accounts on the same browser alone;
- wiring: `CognitoAuthService.logout` calls `secureHistoryKeyForSignOut` before `signOut()`, and
  `SetPasswordCard` calls `useAppStore.getState().logout()` and not `setAuthenticated(false)`.

No automated test covers the onboarding header button itself. Manual checks:

- [ ] The header button shows on every step: label from `sm` up, icon only below.
- [ ] Clicking it shows the spinner, then the landing page with the info toast.
- [ ] Afterwards the landing nav shows "Sign in", not "Dashboard".
- [ ] Signing in again leads through `/auth/setup` to `/onboarding`, starting on step 1.
- [ ] After leaving past the photo step, name, date of birth (locked) and avatar are prefilled.
- [ ] After setting a password, the password step no longer appears.
- [ ] The recovery step's own "Skip for now" finishes onboarding and opens `/app`, without signing
      out.
- [ ] Back in the app, chat history opens without a prompt on the same browser.
