# Frontend Architecture

How the OneHook web client talks to the backend, holds state, handles errors, and is built and
deployed. Configuration, routes, sign-in, end-to-end encryption, Mr OneHook, telemetry and the AWS
pipeline are documented in the repository [README](../README.md); this page links to those sections
rather than repeating them. Sign-in details are in [LOGIN_SETUP.md](./LOGIN_SETUP.md).

There is no mock-data mode. Every runtime path calls a deployed backend (by default Gamma), and the
[engineering policy](../README.md#engineering-policy-no-test-code-in-production-strict) forbids mock
servers, fixtures and `useMockApi`-style branches in `src/`.

## Source layout

| Path | Contents |
|---|---|
| `src/App.tsx` | Amplify/Cognito initialisation, the route table and route guards ([Routes](../README.md#routes)) |
| `src/app/` | The signed-in member shell: `AppContent.tsx`, tab bar, sidebar, top bar, call provider, logout dialog |
| `src/features/` | Member screens: `discovery/`, `chat/`, `matching/`, `profile/`, `settings/`, `moderation/report/` |
| `src/components/` | Auth screens (`auth/`), marketing and legal pages, onboarding, profile cards, calls, chatbot, shared UI (`common/`) |
| `src/api/` | Backend service wrappers (see below) |
| `src/hooks/` | Data and behaviour hooks (`use-api.ts` and others) |
| `src/store/app-store.ts` | The Zustand store |
| `src/lib/` | Auth (`cognito-auth.ts`, `google-identity.ts`), E2EE, calls, analytics, error helpers, view passes |
| `src/config/`, `src/utils/env.config.ts` | Public deployment config and env overrides ([Runtime Configuration](../README.md#runtime-configuration)) |
| `src/tests/` | Vitest suites (not bundled) |
| `infra/` | CDK site stacks (`stacks/`) and the delivery pipeline (`pipeline/`) |

## Backend integration

The backend is OneHookBackend (sibling repository). Discovery ranking and scoring run there on AWS;
the web client only reads the ranked results from `GET /matching/discover`. The interfaces the client
uses are listed under [Backend interfaces](../README.md#backend-interfaces).

### REST: generated SDK

Most REST calls go through the Smithy-generated `onehook-api-client` SDK, instantiated once in
`src/api/sdk-client.ts`:

- **Endpoint.** On `localhost`/`127.0.0.1` the client targets the page origin so the Vite dev proxy
  forwards the request; otherwise it uses `apiBaseUrl` (Gamma: `https://api.gamma.onehook.club`).
- **Auth.** An `authMiddleware` reads the Amplify session (`fetchAuthSession`) and sets
  `Authorization: Bearer <ID token>` (falling back to the access token) and `X-User-Id: <sub>`.
  With no session it sends the request without these headers and the API rejects it.
- **No SigV4.** The model declares `@sigv4`, so the client is given a placeholder region and
  credentials, and `httpSigningMiddleware` is removed so the Bearer header is not overwritten.
- `amz-sdk-request` and `amz-sdk-invocation-id` headers are stripped before sending.
- Retries are whatever the generated client's default retry middleware does; `sdk-client.ts` does not
  configure them.

Service wrappers built on the SDK: `IdentityApi` (`identity.ts`), `ProfileApi` (`profile.ts`),
`StateApi` (`state.ts`), `MatchingApi` (`matching.ts`), `PreferencesApi` (`preferences.ts`), `ChatApi`
(device registry, history key, attachment URLs; `chat.ts`), the analytics ingest and photo stats
(`analytics.ts`), and `DistanceApi`, `SuggestionApi`, `TraditionApi`, `ChatSettingsApi`, `SwipeApi`,
`RosesApi`, `ReceivedLikesApi` and `MatchingTabApi` (`rest.ts`).

### Other generated clients

`src/api/external-sdk-clients.ts` builds the clients of the two APIs that other repos own:
`mrOneHookClient` (`onehook-mr-onehook-client`, OneHookUXEnhancement, at `chatbotUrl`) and
`createModerationEvidenceClient()` (`createPortalClient` from `saha-equation-admin-portal-client`,
OneHookAdminPortal, bound to OneHook's tenant from `portalModerationBaseUrl`). Both send the Cognito ID
token as a Bearer token, use `maxAttempts: 1` and drop the `amz-sdk-*` headers.

There are no hand-written REST helpers. `src/tests/api-route-contract.test.ts` fails the build on any
raw request to a OneHook API; the only raw requests left go to presigned S3 URLs.
`src/lib/api-client.ts` contains only the shared `ApiError` class (`message`, `status`, `code`,
`details`); `callSdk()` in `sdk-client.ts` converts SDK failures into it (status `0` and code
`NETWORK_ERROR` for transport failures).


### GraphQL (AppSync)

Chat messages, reactions, typing and presence, call signalling and in-app notifications use the
Amplify GraphQL client with `userPool` auth (`src/api/chat.ts`, `calls.ts`, `notifications.ts`,
`key-recovery.ts`). `src/api/appsync-connection.ts` listens to Amplify Hub connection-state events
and lets callers refetch once when a disrupted subscription reconnects, because Amplify reconnects
but does not replay missed events. Message encryption is described in
[End-to-End Encrypted Chat](../README.md#end-to-end-encrypted-chat-web).

### View passes

Another member's profile or media can be read only with a short-lived view pass sent as
`X-View-Pass` (`src/lib/view-pass.ts`). Chat passes come from `GET /state/{userId}` and incoming hook
requests; matching passes come from discover pages, `GET /matching/likes` or
`POST /matching/view-passes`. On a 404 the caller refreshes the pass once and retries.

## State management

`src/store/app-store.ts` is a single Zustand store:

| Field | Meaning |
|---|---|
| `currentUser` | The member's own profile (`GET /profile`) mapped to `UserProfile` |
| `userState` | The State service snapshot (`GET /state/{userId}`): connection state, hooks, tier, matching mode |
| `isAuthenticated` | Set from the Amplify session at startup and by the sign-in screens |
| `isLoading`, `error` | Generic flags with setters and `clearError()` |
| `candidates`, `currentCandidate` | The discovery deck |
| `requestsVersion` | Bumped by `bumpRequests()` so hook-request views refetch |

`logout()` clears the view-pass cache and resets the user, state, candidates and error fields. It does
not end the Cognito session; callers run `getCognitoAuth().logout()` first. It also removes the
`localStorage` keys `id_token`, `refresh_token` and `accessToken`, which nothing in `src/` writes any
more. `isPaidTier(state)` derives paid status from `userState.subscriptionTier` and returns `false`
until the snapshot loads (see
[How the subscription tier is resolved](../README.md#how-the-subscription-tier-is-resolved-implemented)).

## Hooks

`src/hooks/use-api.ts`:

| Hook | Purpose |
|---|---|
| `useAsync(fn, deps)` | Generic `{ data, loading, error, refetch }` wrapper |
| `useProfile()` | Loads `GET /profile` and publishes it as `currentUser` |
| `useUserState()` | Loads `GET /state/{userId}` and publishes it as `userState` |
| `useCandidates(coords, { enabled, hooks, onRefused })` | Discover deck with category selection; hydrates each card with `GET /profile/{id}/matching`; runs only while `enabled` |
| `useSwipe()` | `{ pass, like, loading, error }`; a like always carries a comment and a liked profile element |
| `useReceivedLikes(enabled)` | "Likes you" from `GET /matching/likes` |
| `useChatMessages(matchId, recipientId?)` | Encrypted chat thread over AppSync, including attachments |
| `usePreferences(userId, enabled)` | Matching preferences (`/matching/{userId}/preferences`); loads only while `enabled` |
| `usePartnerProfiles(peerIds)` | Chat profiles of hook partners or request senders, read with the State chat pass |
| `useHookRequests(enabled)` | Incoming and outgoing hook requests |
| `useCompleteOnboarding()` | Finishes onboarding with the State service |

`refreshUserStateInStore()` and `setMatchingTabHiddenInStore()` update the store outside React. A
403 `MATCHING_OFF` or `DISCOVERY_PAUSED` from discover or swipe triggers a state re-read. Nothing
that calls `/matching/*` runs for a chat-only member (`src/lib/app-mode.ts`).

Other hooks: `useAppNotifications`, `useCallEligibility`, `useHistoryUnlock`, `useHistoryRecovery`,
`useRecoveryResponder`, `useRegistrationPrerequisites`, `useUserLocation`, `useViewPassRefreshers`.

## Error handling and feedback

- **Reading errors.** `src/lib/api-errors.ts` reads `ApiError` and SDK service exceptions the same
  way: `errorStatus`, `errorCode` (the body's `code`), `errorMessage` (the body's `error`, skipping
  the SDK's `UnknownError` placeholder), `errorGaps` and `isNotFound`. Mr OneHook errors are
  classified separately in `src/lib/mr-onehook-contract.ts`.
- **Error boundary.** `src/components/common/ErrorBoundary.tsx` wraps the whole app in `App.tsx`. It
  logs to the console, shows "Something Went Wrong" with reset and go-home actions, and shows the
  error and component stack when `process.env.NODE_ENV` is not `production`. No error-tracking
  service is connected; the hook for one is a commented-out placeholder.
- **Toasts.** `ToastProvider` / `useToast()` in `src/components/common/Toast.tsx` show `success`,
  `error` or `info` toasts. Each closes after 5 seconds or on its close button; several can be shown
  at once.
- **Loading.** `LoadingSpinner` (`src/components/common/LoadingSpinner.tsx`) takes `size`
  (`sm`, `md`, `lg`) and `fullScreen`. Route guards show the full-screen spinner while auth or the
  State snapshot is loading.

## Authentication

Sign-in, session storage and sign-out are covered in [LOGIN_SETUP.md](./LOGIN_SETUP.md) and
[Authentication and Sessions](../README.md#authentication-and-sessions). In short: Amplify holds the
Cognito session and refreshes tokens inside `fetchAuthSession`; each API helper reads the token from
there per request.

## Local development and configuration

`npm run dev` serves on port 3000 against the checked-in Gamma configuration; no `.env` is needed.
See [Local Development Setup](../README.md#local-development-setup) for the dev proxy and
[Runtime Configuration](../README.md#runtime-configuration) for the `VITE_*` overrides.

## Testing

`npm test` runs Vitest over `src/tests`; `npm run lint` is `tsc --noEmit`; `npm run validate` runs
both. Tests must be hermetic and must not depend on a local `.env`. `npm run test:e2e` exists but
Playwright is not installed or configured.

## Build and deployment

`npm run build` (or `build:prod`) runs the telemetry contract gate, then `vite build --mode
production`. After the client build, the `prerender-pages` plugin in `vite.config.ts` writes a
static HTML file per SEO route, `404.html` and `sitemap.xml`.

The normal release path is AWS CodePipeline; GitHub Actions does not deploy the site:

```text
Source (main) → Verify → BuildProduction (lint, test, build, synth cdk.out.prod)
             → ApproveProduction → DeployProduction (cdk deploy --app cdk.out.prod) → SmokeProduction
```

The production artifact uses the Gamma backend entry until a `prod` entry is added to
`src/config/deployment.config.ts`. Pipeline bootstrap, approval policy, CodeConnections
authorisation and the break-glass `npm run deploy:prod` are documented under
[Deployment](../README.md#deployment) and [Infrastructure](../README.md#infrastructure).

## Known limitations

- `VITE_API_TIMEOUT_MS`, `VITE_ENABLE_DEBUG` and `VITE_LOG_LEVEL` are parsed and validated in
  `src/utils/env.config.ts`, but no request or logging code reads `requestTimeoutMs`, `enableDebug` or
  `logLevel`.
