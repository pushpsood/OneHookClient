# Sign-In and Invite Redemption

How members sign in to the OneHook web client, what happens after sign-in, how sessions are stored
and ended, and why the web cannot create accounts. The summary in
[Authentication and Sessions](../README.md#authentication-and-sessions) is the short version; this
page adds the screen-level flow and troubleshooting.

## Files

| File | Role |
|---|---|
| `src/lib/cognito-auth.ts` | `CognitoAuthService`: configures Amplify and wraps every Cognito call |
| `src/lib/google-identity.ts` | Loads Google Identity Services and returns a Google ID token |
| `src/lib/social-link.ts` | Links Google to a signed-in account (`POST /identity/user/social/link`) |
| `src/components/auth/Login.tsx` | `/login`: identifier, one-time code, password, set/reset password, Google, Apple |
| `src/components/auth/AuthSetupWizard.tsx` | `/auth/setup`: optional email verification, then optional passkey |
| `src/components/auth/RedeemInvite.tsx` | `/redeem`: shows `SignupInAppNotice` while web sign-up is off |
| `src/components/auth/FinishSetupInAppNotice.tsx` | Shown at `/onboarding` when native sign-up guarantees are missing |
| `src/config/signup.config.ts` | `WEB_SIGNUP_ENABLED = false` and the app-store links |
| `src/App.tsx` | Calls `initializeCognitoAuth`, checks the session at startup, defines the route guards |
| `src/config/deployment.config.ts`, `src/utils/env.config.ts` | Cognito identifiers, Google client ID and their `VITE_*` overrides |

## Cognito configuration

The user pool ID, app-client ID, Identity Pool ID, region and Google web client ID are public values
checked into the `gamma` entry of `src/config/deployment.config.ts`. Read them there; they change when
the backend pool is recreated. No `.env` is needed. The `VITE_COGNITO_*` and `VITE_GOOGLE_CLIENT_ID`
overrides are listed in [Runtime Configuration](../README.md#runtime-configuration).

`App.tsx` initialises `CognitoAuthService` only when both the user pool ID and client ID are set.
The service calls `Amplify.configure` with:

- `loginWith: { phone: true, email: true }`;
- Hosted UI OAuth (code flow) only when `cognitoDomain`, the sign-in redirect and the sign-out
  redirect are all non-empty. The Gamma entry has an empty `cognitoDomain`, so OAuth is not
  configured (covered by `src/tests/cognito-auth-config.test.ts`);
- the Identity Pool with guest access off, used for Face Liveness credentials;
- the AppSync GraphQL endpoint with `userPool` auth.

The pool itself is defined in OneHookBackend `infra/stacks/shared-stack.ts`: self sign-up disabled;
sign-in aliases for email, phone and `preferred_username` (the Cognito username is an opaque
generated handle); password policy of at least 12 characters with a symbol; app-client flows
`USER_AUTH`, `USER_PASSWORD_AUTH`, `USER_SRP_AUTH` and custom auth; WebAuthn relying party
`onehook.club`. Token lifetimes are in OneHookBackend `infra/config/auth.ts`: 60-minute ID and access
tokens and a 30-day refresh token. The pool definition does not configure MFA.

## Sign-in at `/login`

`/login` is wrapped in `GuestOnlyRoute`, so a signed-in visitor is sent to `/app`.

### Identifier

The member picks **Phone**, **Email** or **Username**:

- **Phone**: `PhoneNumberInput` with a country selector; the value sent to Cognito is E.164.
- **Email**: the trimmed address.
- **Username**: trimmed and lower-cased (`normalizeUsername`). A username has nowhere to send a code,
  so this mode always uses a password.

### One-time code (default for phone and email)

1. `requestOtp(identifier)` calls `signIn` with `authFlowType: 'CUSTOM_WITHOUT_SRP'` and
   `clientMetadata.authStrategy` set to `email` (identifier contains `@`) or `phone`.
2. The screen switches to the code step. Resend is disabled for 60 seconds after each send.
3. `confirmLogin(code)` calls `confirmSignIn`. On `isSignedIn` or `DONE` the member is signed in.

"Use a different account" calls `logout()` to drop the half-finished sign-in and resets the form.

### Password

"Sign in with password instead" switches phone and email to `loginWithPassword`, which calls
`signIn` with `authFlowType: 'USER_AUTH'` and `preferredChallenge: 'PASSWORD_SRP'`. If Cognito
returns a `CONFIRM_SIGN_IN_WITH_*` step, the code step is shown.

### Set or reset a password

"Forgot your password, or need to set one?" calls `resetPassword` for the current identifier, then
shows a code, new-password and confirm form that calls `confirmResetPassword`. This also lets a
passwordless account set its first password. On success the form returns to the identifier step in
password mode.

### Google

`signInWithGoogle()` does not use the Hosted UI:

1. Google Identity Services returns a Google ID token in the page.
2. `POST /identity/auth/social` (`IdentityApi.authSocial('GOOGLE', token)`) verifies the token and
   returns the linked OneHook `userId`. With no linked account it throws "No OneHook account is linked
   to this Google account...".
3. `signIn({ username: userId, authFlowType: 'CUSTOM_WITHOUT_SRP' })` starts custom auth, and the
   `PROVIDE_SOCIAL_TOKEN` challenge is answered with `{ provider: 'google', token }`.

Google sign-in works only for accounts that already linked Google (from onboarding or account
settings). `VITE_GOOGLE_CLIENT_ID` must match the backend `GOOGLE_CLIENT_ID`, because the backend
pins the token audience. Covered by `src/tests/google-signin.test.ts`.

### Apple

`federatedSignInApple()` calls `signInWithRedirect({ provider: 'Apple' })`, which requires Hosted UI
OAuth. With the current configuration Amplify rejects the call (OAuth is not configured) and the
screen shows the error. OneHookBackend `infra/config/auth.ts` also still uses a placeholder Apple
Services ID. See [Prerequisites if A or B is ever adopted](../README.md#prerequisites-if-a-or-b-is-ever-adopted).

Passkeys can be registered on the web (see below), but `/login` has no passkey sign-in option.

## After sign-in

Every successful sign-in sets `isAuthenticated` in the store and navigates to `/auth/setup`:

1. **Email** (`AuthSetupWizard`): `updateUserAttribute` for `email`, then `confirmUserAttribute`
   with the emailed code. Skippable.
2. **Passkey**: `associateWebAuthnCredential`. Skippable. Then `/app`.

Route guards then decide where the member lands:

- `OnboardedRoute` on `/app` sends the member to `/onboarding` when the State snapshot is missing or
  `ONBOARDING`.
- `OnboardingGuard` on `/onboarding` sends a member who is past onboarding to `/app`. Otherwise it
  checks `useRegistrationPrerequisites` against `GET /chat/history`: the active history-key epoch
  must have a platform-escrow (`ESCROW`) wrap. If it does not, it shows `FinishSetupInAppNotice`
  ("Finish in the App") instead of the wizard. A passkey PRF wrap is recommended but not required.
- The onboarding "Skip for now" action signs out; see [ONBOARDING_SKIP_LOGOUT.md](./ONBOARDING_SKIP_LOGOUT.md).

## Sign-up and invite redemption

Accounts are created only in the native apps (OneHookPlatform). `WEB_SIGNUP_ENABLED` is `false`
because the first device must put the account history key into platform escrow, which a browser
cannot do (rationale in `src/config/signup.config.ts` and OneHookBackend
`docs/account-key-recovery.md`). `/redeem` therefore renders `SignupInAppNotice`: app-store links
(or "coming soon" while a listing is unpublished) and a link back to sign-in. The login page's
"Redeem Invite Code" button leads there. Covered by `src/tests/signup-surface.test.ts`.

`RedeemInvite.tsx` still contains the invite flow the native clients use, unreachable on the web
while the flag is off:

1. `GET /identity/invite/validate/{inviteCode}`
2. `POST /identity/auth/register/phone/request-otp`
3. `POST /identity/auth/register/phone` with phone, code and invite code, then navigate to `/login`.

## Sessions and tokens

The app does not store tokens itself. Amplify keeps the Cognito session in its default browser
storage (`localStorage`, keys prefixed `CognitoIdentityServiceProvider.<clientId>`), and
`fetchAuthSession()` refreshes expired tokens with the refresh token. Each API helper reads the
current ID token (falling back to the access token) from `fetchAuthSession()` per request and sends
it as a Bearer header (see [FRONTEND_PRODUCTION.md](./FRONTEND_PRODUCTION.md#backend-integration)).

At startup `App.tsx` calls `getCurrentUser()` (`fetchAuthSession` plus `fetchUserAttributes`) and
sets `isAuthenticated` from the result. There is no global 401 handler: if the session cannot be
refreshed, requests go out without a token and fail, and the member is sent to `/login` only when
`isAuthenticated` is false on a protected route.

## Sign-out

`CognitoAuthService.logout()` secures and removes this browser's history key, resets the shared
encryption state, then calls Amplify `signOut` (details under
[Authentication and Sessions](../README.md#authentication-and-sessions)). Callers then run the store's
`logout()` to clear profile, state and view passes. The main sign-out (`performLogout` in
`src/app/AppContent.tsx`) asks for confirmation first and then navigates to `/`. Other sign-out
points: the landing page, `SetPasswordCard`, the profile-load error screen and profile deletion in
`AccountSettingsCard`.

## Account settings related to sign-in

- `AccountSettingsCard`: link an email (`/identity/user/email/link/request-otp`, then
  `/identity/user/email/link`), link Google, add a passkey (also added as a history-unlock method when
  the browser supports passkey PRF). The "Link Apple" button only shows an "available soon" toast.
- Onboarding: choose a username (`PUT /identity/user/username`) and an optional first password
  (`PUT /identity/user/password`).
- `SetPasswordCard` (Settings): signs the member out so they can use "Forgot your password" on
  `/login`.

## Testing locally

```bash
npm run dev
```

Open `http://localhost:3000/login`. Sign-in uses the Gamma user pool from the checked-in
configuration, so you need a Gamma account created through the native app's invite-gated
registration. Use synthetic test identities only. Creating users directly in the Cognito pool
bypasses Identity registration and the native key setup, and is not covered here.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Cognito auth service not initialized" | The user pool ID or client ID is empty, so `App.tsx` skipped `initializeCognitoAuth`. Check `deployment.config.ts` and any `.env` overrides. |
| "No OneHook account is linked to this Google account" | The Google identity is not linked. Sign in another way and link Google from account settings. |
| Google sign-in rejected by the backend | `VITE_GOOGLE_CLIENT_ID` does not match the backend `GOOGLE_CLIENT_ID`. |
| Apple sign-in fails immediately | Hosted UI OAuth is not configured (empty `cognitoDomain`). |
| New password rejected after reset | The pool requires 12+ characters with a symbol; the form only checks for 8. |
| Username mode has no "Send Code" | Expected: usernames sign in with a password only. |
| Signed in but sent to `/onboarding` | The State snapshot is missing or `ONBOARDING`. |
| `/onboarding` shows "Finish in the App" | The account's active history-key epoch has no platform-escrow wrap (or no epoch exists); finish sign-up in the native app. |

## See also

- [README: Authentication and Sessions](../README.md#authentication-and-sessions)
- [README: End-to-End Encrypted Chat](../README.md#end-to-end-encrypted-chat-web) (history key and sign-out hygiene)
- [FRONTEND_PRODUCTION.md](./FRONTEND_PRODUCTION.md)
- OneHookBackend `packages/identity/README.md` and `docs/account-key-recovery.md`
