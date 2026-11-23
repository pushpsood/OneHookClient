# OneHook Client

React web application for the OneHook platform (`onehook.club`). Built with Vite, React 19 and
Tailwind CSS 4, and deployed with AWS CDK (S3 + CloudFront) through an AWS CodePipeline.

## Tech Stack

Versions are the ranges declared in `package.json`.

- **React 19** (`react`, `react-dom`): UI framework
- **Vite 6**: build tool and dev server
- **TypeScript 5.8**: `npm run lint` is `tsc --noEmit`
- **Tailwind CSS 4** (`@tailwindcss/vite`): utility-first styling
- **Zustand 5**: state management (`src/store/app-store.ts`)
- **Motion 12**: animations
- **Lucide React**: icons
- **React Router 7** (`react-router-dom`): client-side routing
- **AWS Amplify 6** (`aws-amplify`, `@aws-amplify/ui-react`, `@aws-amplify/ui-react-liveness`):
  Cognito auth, AppSync GraphQL client and Face Liveness UI
- **`onehook-api-client`**: Smithy-generated REST SDK for the OneHook backend, installed from the
  npm registry (`^2.0.0`, pinned in `package-lock.json`)
- **`onehook-mr-onehook-client`**: Smithy-generated SDK for Mr OneHook product & connection chat and AI session persistence (`^2.0.0`)
- **`saha-equation-admin-portal-client`**: Smithy-generated SDK for admin portal feature gateways (moderation evidence and admissions) (`^2.0.0`)
- **Vitest 4**: testing (`fake-indexeddb` for the E2EE key-store tests)
- **AWS CDK 2** (`aws-cdk-lib`, `aws-cdk`): site and pipeline infrastructure under `infra/`

## Prerequisites

- Node.js >= 20.0.0 and npm >= 10.0.0 (`package.json` `engines`). GitHub CI and CodeBuild run Node 22.

## Quick Start

```bash
# Install dependencies (also activates the telemetry pre-push hook, see "Telemetry contract")
npm install

# Start dev server (port 3000)
npm run dev

# Run tests
npm test

# Type-check
npm run lint

# Build for production (runs the telemetry contract gate first)
npm run build
```

### npm scripts

| Script | What it does |
|---|---|
| `dev` | `vite --port=3000 --mode development`; `predev` prints the telemetry contract banner |
| `build` / `build:prod` | `vite build --mode production`; the `prebuild*` hooks run the telemetry contract gate |
| `build:dev` | `vite build --mode development` (same gate) |
| `preview` | `vite preview` |
| `test` | `vitest run src/tests` |
| `test:unit` / `test:integration` | single files `src/tests/unit.test.ts` / `src/tests/integration.test.ts` |
| `test:watch` / `test:coverage` | Vitest watch / coverage over `src/tests` |
| `lint` | `tsc --noEmit` |
| `lint:fix` / `format` | type-check and/or Prettier write |
| `validate` | `npm run lint && npm test` |
| `telemetry:contract` | `node scripts/telemetry-contract.mjs` |
| `synth:prod` | `cdk synth --context env=prod` (site stacks) |
| `synth:pipeline` / `diff:pipeline` / `deploy:pipeline` | pipeline stack (`infra/pipeline/pipeline-app.ts`) |
| `cdk:deploy` / `deploy:prod` | build, then deploy the site stacks directly (break-glass only) |

`test:e2e` runs `playwright test`, but Playwright is not a dependency and there is no Playwright
config in the repository.

## Local Development Setup

The application defaults to the real Gamma backend through the public, checked-in configuration in
`src/config/deployment.config.ts`. No `.env` is required for normal development:

```bash
npm run dev
```

On `localhost` the REST SDK sends requests to the dev-server origin (`src/api/sdk-client.ts`), and
the Vite dev server proxies `/identity`, `/profile`, `/state`, `/matching`, `/chat` and `/signals` to
`https://api.gamma.onehook.club` (`src/config/dev-proxy.ts`, used by `vite.config.ts`).
`src/tests/dev-proxy.test.ts` fails when a Cognito or public route in the generated route manifest is
not covered. The proxy target is hard-coded, so
`VITE_API_BASE_URL` does not change where REST calls go on `localhost`. AppSync GraphQL, Cognito and
the Mr OneHook chatbot are called directly at their configured URLs. `vite.config.ts` also defines
proxy rules for a LocalStack backend under `/api/localstack/*` (and `/graphql` when a LocalStack
AppSync API named `OneHook-Chat-local-ChatApi` is found); the default configuration does not use them.

If you need to point your local browser at different real infrastructure, copy `.env.example` to the
git-ignored `.env` and set only the overrides you need. Local scaffolding remains each developer's
responsibility: there is no mock server, mock scenario, or fixture data in the runtime tree.

## Runtime Configuration

Public browser configuration is source-controlled in `src/config/deployment.config.ts`. The
production-site artifact and local development both select its `gamma` entry, which contains the
unified REST URL, AppSync GraphQL URL, Mr OneHook chatbot URL, Cognito public identifiers, Google
OAuth web client ID, admin-portal moderation base URL, feature defaults, timeout, and log level. Vite
bundles these values into browser JavaScript, so this file must never contain a secret.

No GitHub `VITE_*` variables or local `.env` are required. The production CodeBuild project sets
only non-secret variables: `VITE_APP_ENV=production`, the backend selector `VITE_BACKEND_STAGE=gamma`,
`CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION` and `SOURCE_COMMIT`. An unknown backend selector fails the
build. Developers may copy `.env.example` to ignored `.env` and override individual values for local
work. Explicit boolean, timeout, and log-level overrides are validated, while blank values use
source defaults. The unused `VITE_WS_URL` setting has been removed.

Overrides read by `src/utils/env.config.ts`:

| Variable | Default |
|---|---|
| `VITE_APP_ENV` | Vite `MODE`, then hostname detection |
| `VITE_BACKEND_STAGE` | `gamma` (the only entry) |
| `VITE_API_BASE_URL` | stage `apiBaseUrl`; empty in development |
| `VITE_GRAPHQL_URL`, `VITE_CHATBOT_URL`, `VITE_PORTAL_MODERATION_BASE_URL` | stage values |
| `VITE_COGNITO_REGION`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_IDENTITY_POOL_ID`, `VITE_COGNITO_DOMAIN` | stage values |
| `VITE_COGNITO_ENDPOINT` | `https://cognito-idp.<region>.amazonaws.com` |
| `VITE_COGNITO_REDIRECT_SIGN_IN`, `VITE_COGNITO_REDIRECT_SIGN_OUT` | browser origin |
| `VITE_GOOGLE_CLIENT_ID` | stage value; must match the backend `GOOGLE_CLIENT_ID` |
| `VITE_ENABLE_ANALYTICS`, `VITE_ENABLE_DEBUG` | `false` |
| `VITE_API_TIMEOUT_MS` | `30000` |
| `VITE_LOG_LEVEL` | `error` |

Gamma Cognito is in `ap-south-1`. Its IDP endpoint is derived from that region. User Pool, app-client
and Identity Pool IDs are public routing identifiers rather than credentials. Redirects default to
the browser origin, but Amplify Hosted UI OAuth is enabled only when domain, sign-in redirect, and
sign-out redirect are all non-empty; direct Cognito authentication remains available without it.
The Gamma entry has an empty `cognitoDomain`, so Hosted UI OAuth is currently off.

When the production backend has been deployed and validated, add a source-controlled `prod` entry,
then change only the production build's `VITE_BACKEND_STAGE` selector. Do not switch production URLs
independently in pipeline settings.

## Application Overview

### Routes

Defined in `src/App.tsx`.

| Path | Page | Guard |
|---|---|---|
| `/` | Landing | public |
| `/messenger`, `/science`, `/pricing`, `/careers`, `/contact`, `/privacy`, `/terms` | marketing and legal pages | public |
| `/login` | sign in | signed-out only (`GuestOnlyRoute`) |
| `/redeem` | invite redemption; shows the "sign up in the app" notice because web sign-up is off | signed-out only |
| `/auth/setup` | post-sign-in email verification and passkey setup (`AuthSetupWizard`) | signed in |
| `/onboarding` | profile onboarding (`OnboardingWizard`) | signed in, still `ONBOARDING`, and registration prerequisites met |
| `/app` | the member app (`src/app/AppContent.tsx`) | signed in and past onboarding (`OnboardedRoute`, fails closed) |
| `*` | not-found page | public |

Inside `/app` the tabs depend on the matching mode (`src/lib/app-mode.ts`). With matching on:
Discover, Likes, Chat, Profile and Settings. A chat-only member gets the Matching intro (unless hidden
in Settings), Chat, Profile and Settings, and nothing that calls `/matching/*` is mounted.

### Backend interfaces

- **Every OneHook API call goes through the `onehook-api-client` package; nothing builds a URL or a
  request by hand.** `npm test` fails otherwise (`src/tests/api-route-contract.test.ts`): a raw
  `fetch`/XHR to a OneHook API fails whatever its path, and each SDK call must be an operation of the
  service its client serves (checked against each owner's route manifest: the synced backend one, and
  `onehook-mr-onehook-client/manifest` / `saha-equation-admin-portal-client/manifest`). The only raw requests
  are to presigned S3 URLs an API returned, each listed with a reason. A missing operation is added to
  its owner's Smithy model and published, never written in the client.
- **REST**: the generated `OneHook` client in `src/api/sdk-client.ts` against the single REST domain,
  with the Cognito ID token (falling back to the access token) as a Bearer header. SigV4 signing is
  removed. Service wrappers live in `src/api/`; `callSdk` turns SDK errors into the shared `ApiError`.
- **AppSync GraphQL**: chat messages, voice/video call signalling and in-app notifications use the
  Amplify GraphQL client with `userPool` auth (`src/api/chat.ts`, `src/api/calls.ts`,
  `src/api/notifications.ts`).
- **Mr OneHook chatbot**: `mrOneHookClient` from `onehook-mr-onehook-client` (published by
  OneHookUXEnhancement) at `chatbotUrl` (Azure App Service, see "Mr OneHook member chat"), in
  `src/api/external-sdk-clients.ts`.
- **Admin portal moderation gateway**: report evidence presign/complete through
  `saha-equation-admin-portal-client` (published by OneHookAdminPortal for every tenant).
  `createModerationEvidenceClient` binds OneHook's tenant (`{service, stage}` from
  `portalModerationBaseUrl`) and sends the member ID token (`src/features/moderation/report/`).
- **Cognito Identity Pool**: temporary credentials for Rekognition Face Liveness streaming
  (`src/api/liveness.ts`, `src/components/profile/LivenessVerification.tsx`).

## Authentication and Sessions

`src/lib/cognito-auth.ts` configures Amplify and wraps every sign-in method:

- **Phone or email one-time code**: Cognito custom auth (`CUSTOM_WITHOUT_SRP`) with
  `clientMetadata.authStrategy` set to `email` or `phone`, finished with `confirmSignIn`.
- **Password**: `USER_AUTH` with `PASSWORD_SRP`. Phone, email or username (`preferred_username`
  alias) can sign in with a password; a username has no code flow.
- **Set or reset a password**: Cognito `resetPassword` / `confirmResetPassword`.
- **Google**: Google Identity Services returns an ID token in-page, `POST /identity/auth/social`
  resolves the linked account, then a Cognito custom-auth `PROVIDE_SOCIAL_TOKEN` challenge is
  answered with the same token. No Hosted UI is involved.
- **Apple**: `signInWithRedirect({ provider: 'Apple' })`, which needs Hosted UI OAuth (currently
  not configured, see "Prerequisites if A or B is ever adopted").
- **Passkeys**: registered with `associateWebAuthnCredential` from `/auth/setup` or the profile
  account settings (`AccountSettingsCard`).

**Sign-up is app-only.** `WEB_SIGNUP_ENABLED` is `false` in `src/config/signup.config.ts`: the first
device must put the account history key into platform escrow (iCloud Keychain or Android Block
Store), which the web cannot do. `/onboarding` verifies this with `useRegistrationPrerequisites`
(an `ESCROW` wrap is required; a passkey PRF wrap is recommended) and otherwise shows
`FinishSetupInAppNotice`.

**Sign-out** (`CognitoAuthService.logout`) first secures and removes this browser's history key (see
below), resets the shared encryption state, then calls Amplify `signOut`. The "sign out to set a
password" action in `src/components/profile/SetPasswordCard.tsx` calls the full store `logout()`, so
the next account signed in from that tab does not inherit the previous member's profile, state or
view passes.

## End-to-End Encrypted Chat (web)

Implemented in `src/lib/chat-encryption.ts` (wire format in `src/lib/chat-wire-v2.ts`). Wire v1 has
been removed; a v1 envelope fails with an "old encryption format" error.

- Each browser has a non-extractable P-256 ECDH device key stored in IndexedDB (`onehook-e2ee`,
  store `identity-keys`) and registered with `POST /chat/devices`. A message is encrypted once with
  AES-256-GCM (AAD bound to the `matchId`) and its content key is wrapped for every registered device
  of both members plus each member's account-history key.
- **One device per login.** All `ChatEncryptionManager` instances for a user share one identity load
  per page, and identity creation runs under a Web Lock (`onehook-e2ee-identity:<userId>`), so
  concurrent components and tabs no longer each register a device.
- **History unlock ladder** (`src/hooks/use-history-unlock.ts`): a device wrap sealed to this device
  (silent), then a passkey PRF wrap (biometric prompt, only when one exists and PRF is supported).
  QR transfer between devices (`KeyRecoveryResponder`, `HistoryRecoveryModal`, `QrCameraScanner`)
  is the manual fallback. Platform escrow is written only by the native apps.
- **Sign-out key hygiene** (`secureHistoryKeyForSignOut`): confirms or publishes a device wrap for
  this browser, then deletes the history private key (CryptoKey and PKCS#8 bytes) from IndexedDB.
  If the wrap cannot be confirmed the key is kept, because it may be the only copy. The step is
  bounded to 4 seconds and never throws. The device key stays, so the next sign-in re-opens history
  silently. Covered by `src/tests/sign-out-key-hygiene.test.ts`.
- Settings and the account recovery dialog list registered devices and allow revoking one
  (`DeviceManagementCard`, `DELETE /chat/devices/{deviceId}`).
- **Structured messages (0x03 frame format)**: End-to-end encrypted rich payloads encapsulated in
  structured frames (`src/lib/chat-structured.ts`, rendered by `StructuredMessageBubble.tsx`):
  - **Location sharing**: Send current location once, or broadcast live location for 15 minutes, 1 hour,
    or 8 hours (`src/components/chat/LocationShareSheet.tsx`, `src/lib/live-location-sharing.ts`,
    `src/lib/browser-location.ts`). Includes interactive leaflet/tile map previews, real-time beacon
    updates to AppSync GraphQL, unload keepalive beacon (`fetch` keepalive on tab close), and external
    links to Apple Maps or Google Maps with turn-by-turn directions.
  - **Contact card sharing**: Send and receive contact cards (`src/components/chat/ContactShareSheet.tsx`,
    `src/lib/contact-share.ts`) containing display names, phone numbers, email addresses, and postal
    addresses. Receivers can inspect contacts, download generated `.vcf` vCard files locally, or initiate
    direct calls/emails.
- **Voice/video calls**:
  - WebRTC SDP and ICE signaling payloads are sealed with the same v2 envelope, to the peer's devices
    only (`src/lib/call-signal.ts`).
  - Video calls display the local camera preview from call start in a Picture-in-Picture window that
    swaps with the large remote window on tap, snaps to any corner (clearing in-call controls), with
    translucent controls that auto-hide on inactivity.
- There is no forward secrecy and no safety-number verification of peer keys; history recovery shows
  a 6-digit code to compare across devices.

## Mr OneHook member chat

The signed-in chat surface uses `POST ${chatbotUrl}/api/member/product-connection-chat` with the
Cognito **ID token** (the member route verifies `aud` and reads the member's `roles`/tier from claims
the access token does not carry). `chatbotUrl` is `https://chatbot.gamma.onehook.club`, an Azure App
Service from OneHookUXEnhancement. Members can choose product-only mode or one active match. Match
messages remain end-to-end encrypted and are searched only after local decryption; when the service
returns `needsMoreContext`, the browser selects bounded readable excerpts, displays the exact excerpt
review panel, and sends them only after confirmation. Excerpts carry only `speaker`, `sentAt`, and
`text` and are never persisted in the local Mr OneHook transcript.

**Plans.** Mr OneHook has two plans, separate from the membership tiers: Free (Must and Super: 10
messages per UTC day, 1 saved chat, no files) and Pro (a Mr OneHook Pro subscription, or a membership
tier that includes it, the top tier: unlimited messages, 3 saved chats, files). The client reads the
plan from `GET .../api/member/mr-onehook-pro` (`src/store/mr-onehook-pro-store.ts`) and from `plan` in
every reply; a 404 `ENDPOINT_NOT_FOUND` there means Pro is off and every Pro entry point hides.

**Saved chats.** Every member keeps the transcript in `localStorage` per user and scope and requests
server-side persistence (`GET`/`DELETE .../sessions[/:id]`), while the server remains authoritative. At
the plan's cap a new chat replaces the least recently active one on the server; the reply lists it in
`evictedSessionIds`, its tab goes and a short notice says "Your oldest chat was replaced". A 409
`CHAT_SESSION_LIMIT_REACHED` is only a race and is retried once. Stale, expired, denied, or unavailable
sessions are forgotten and the same question is retried without persistence.

**Mr OneHook Pro screen** (`src/components/chat/MrOneHookProSheet.tsx`, opened from the Mr OneHook chat
and Settings): offers and purchase (a fresh UUID `Idempotency-Key` per tap; 503
`PAYMENTS_NOT_CONFIGURED` shows "Coming soon"), the subscription (period end, next charge, auto-renew,
paused for the membership, refunds), "Keep Mr OneHook Pro after <date>" while State's
`membershipEndsAt` is set, a kept plan (`SCHEDULED`, withdrawable), "Activating your membership" while
State's `pendingSubscriptionTier` is set (State is polled briefly), notices and the file allowance. The
screen copy is derived purely in `src/lib/mr-onehook-pro.ts`.

**Files (Pro).** The signed-in chat's paperclip takes up to 3 files of at most 5 MB each (checked before
upload). Each file is uploaded with `UploadChatAttachment`, polled with `GetChatAttachment` (every 1.5 s,
all files sharing one gate that keeps within its 60-per-minute budget) until `READY`/`FAILED`, then sent
as `attachmentIds` (`src/lib/mr-onehook-attachments.ts`). Free members can select files, but the send
button reads "Get Mr OneHook Pro". 429 `ATTACHMENT_PROCESSING_UNAVAILABLE` reads "Files can't be
processed right now because of heavy usage. You can keep chatting." Files of a saved turn show as
chips; uploaded ones open through `GetChatAttachmentContent`, match-chat ones are labelled "From your
chat". HEIC is uploaded as is (the web has no HEIC converter). In a match chat, "Ask Mr OneHook about
files" lets the member select images and files of that conversation; on Pro the device's decrypted
bytes (`AttachmentObjectUrlCache.resolveBlob`) are uploaded with `X-Attachment-Match-Id` /
`X-Attachment-Sender` and that match's Mr OneHook chat opens with them attached. A 403
`MESSAGE_CONTEXT_NOT_ALLOWED` explains that the match does not allow its history to be used.
The public landing widget (`src/components/Chatbot/ChatbotWidget.tsx`, shown on `/`, `/pricing` and
`/science`) remains separate on `POST ${chatbotUrl}/api/public/product-chat` without an authorization
header.

**Availability.** There is no group or permission gate; every member can chat. The client
classifies terminal availability with `classifyMemberChatAvailability`
(`src/lib/mr-onehook-contract.ts`): `LIMIT_REACHED` (402 `MESSAGE_LIMIT_REACHED`), `NOT_AUTHENTICATED`
(401 `AUTH_REQUIRED`/`INVALID_ACCESS_TOKEN`) and `NOT_CONFIGURED` (404 `ENDPOINT_NOT_FOUND`/503
`CONTEXT_NOT_CONFIGURED`). The structured error code wins; the HTTP status (402, 401 or 404) is used
only when no code is present. The UI shows a clear message and disables the composer rather than
showing a retryable error. A recognised-but-unrelated code (e.g. a session or per-request validation
code, including any 403) is handled on its own path and never gates the feature.

## Telemetry Contract

`TELEMETRY_CONTRACT.txt` (synced from OneHookBackend, catalog version `1.28.0`) is a hard rule: every
user interaction emits one `ui_interaction` with a backend-generated `UiElement` id via `trackProps` /
`trackUi` (`src/lib/analytics/`). The generated catalog `src/lib/analytics/generated/telemetryCatalog.ts`
must not be edited by hand. It covers chat reactions, message multi-select for Mr OneHook, structured
location sharing (current and live duration options), and contact cards.

`scripts/telemetry-contract.mjs` prints the contract, checks the catalog's sha256 integrity stamp,
and runs the `telemetry-coverage`, `telemetry-guard`, `telemetry-sdk` and `telemetry-standard`
tests. It runs before every build (`prebuild*`), in GitHub CI, in the CodePipeline `Verify` stage,
and in the `.githooks/pre-push` hook, which `scripts/install-git-hooks.mjs` activates
(`core.hooksPath=.githooks`) on `npm install` and on build.

Events are batched to `POST /signals` with the caller's Cognito JWT. Emission is gated by
`enableAnalytics` and the user's stored consent; the Gamma entry sets `enableAnalytics: false`, so the
current artifact sends nothing until that flag is turned on.

## Engineering Policy: No Test Code in Production (strict)

**Test, mock, and local-development code must never reach a production artifact, and must not be
committed to this repository.** This is a hard requirement, not a preference.

What this forbids:

| Forbidden | Why |
|---|---|
| Mock servers, mock scenarios, fixture data in the shipped tree | They become an alternate, untested code path that can activate in prod via a stray env var |
| `if (useMockApi) { ... }` style branches inside `src/` | The fake path ships in the bundle; one misconfigured variable silently serves fake data |
| Stub/fallback modules substituted at build time | A failed SDK/codegen step then produces a build that *looks* healthy but isn't |
| `import.meta.env.DEV` short-circuits that fake success | Especially dangerous in auth: swallowing a Cognito error and returning "signed in" hides real failures |
| Committing personal `.env` wiring | Local setup is per-developer; committed copies drift and leak environment details |

What this requires instead:

- **Fail loudly.** Missing prerequisites (e.g. the generated SDK) must break the build with an
  actionable message, never degrade to a stub.
- **Real backends for real behaviour.** Develop against a deployed environment; keep that wiring in untracked files.
- **Tests stay, mocks go.** Unit/integration tests under `src/tests` are *not* shipped (Vitest files
  are never bundled) and remain first-class. What is banned is test-support code living in the
  application's runtime path.
- **Tests must be hermetic.** A committed test must not depend on a developer's local `.env`; stub
  every variable it reads. (A previously committed env test silently passed only on machines with no
  local `.env`, which is exactly the failure mode this rule prevents.)

Anything test-related that must exist locally belongs in your own untracked working files.

### Deployments are gated on tests

`.github/workflows/ci.yml` remains a pull-request-only GitHub check (pull requests to `main` and
`develop`) that runs `npm run lint`, `npm run telemetry:contract` and `npm test`. Deployment is
independently gated inside the AWS pipeline because pull-request and `main` push events are
separate: the CodePipeline `Verify` stage runs `npm run lint`, `npm test` and
`npm run telemetry:contract` against the exact CodeConnections source revision before any
deployment-capable CodeBuild project runs.

On every push to `main`, `BuildProduction` repeats type checking and tests, builds the production
bundle (which runs the telemetry gate again), verifies its bundled endpoints (Gamma REST and GraphQL
URLs present, `https://api.onehook.club` absent), and synthesizes a complete CDK cloud assembly.
Only that immutable pipeline artifact reaches AWS manual approval. The post-approval project deploys
the stored assembly with `--app cdk.out.prod`; it never runs Vite or CDK synthesis again.

A failed check, build, synth, or deployment therefore cannot reach production approval.

> **Repository setting:** keep `lint-and-test` as a required GitHub status check for `main`, so a
> failing pull request cannot merge. CodePipeline then independently verifies the merged commit
> before deployment.

## Rendering Model & Tier Personalization (SSR tradeoffs)

Today this app is a **client-rendered SPA** with **build-time pre-rendering**: Vite builds static
assets, S3 serves them, CloudFront caches them. There is no server-side rendering tier and no
Lambda@Edge. The only edge compute is CloudFront Functions on viewer request (see "Infrastructure").

After the client build, the `prerender-pages` plugin in `vite.config.ts` writes
`dist/<route>/index.html` for every route in `src/config/seo-routes.ts`, plus `dist/404.html` and
`sitemap.xml`. Each file carries the route's own title, description, robots, canonical, Open Graph /
Twitter tags and JSON-LD. Public pages (`src/prerender-entry.tsx`) also get their body rendered with
React at build time. `/app`, `/onboarding` and `/auth/setup` are `noindex` and left out of the
sitemap. In the browser, `createRoot` replaces the pre-rendered markup.

### How the subscription tier is resolved (implemented)

The tier is **server-authoritative**. It is read from the State service (`GET /state/{userId}`),
which owns the connection state machine and the entitlement, and published to the Zustand store as
`userState`; the UI derives paid status with the `isPaidTier` selector (`src/store/app-store.ts`),
which uses `isPaidSubscriptionTier` from the backend-owned membership catalogue in
`onehook-api-client/membership` (tiers `MUST`, `SUPER`, `INFINITY`).

It is deliberately **not** read from the profile: the Profile service intentionally omits
`subscriptionTier` from its read model, so reading it off a profile silently yields `undefined`,
which previously made *every* user render as a paid tier and hid the upgrade CTA from free users.

`isPaidTier` **fails closed**: until the snapshot loads it returns `false`, so the UI shows the free
`MUST` tier and never briefly promises a paid one.

> **The UI is not a security boundary.** A user can edit their own browser and reveal a premium
> control; clicking it still fails, because entitlement is enforced independently server-side (State
> enforces capacity in a DynamoDB condition expression, Chat rejects premium mutations for `MUST`
> callers, Profile derives the tier from the verified JWT claim and ignores any tier in a request
> body). Tier in the client is a **rendering input only**.

### Options considered for server-side personalization

| | What it does | Cost | First paint |
|---|---|---|---|
| **A — Edge tier-routing** | Lambda@Edge verifies the JWT and serves one of ~3 pre-rendered per-tier HTML variants; CDN cache key includes a coarse tier cookie | ~3–5 days | Already correct |
| **B — SSR/BFF on Lambda** | Real per-user server rendering behind CloudFront; httpOnly session cookie; OAuth code exchange | ~1.5–3 weeks | Already correct, per-user |
| **C — Server-authoritative bootstrap** ✅ | Keep the SPA; render from the tier the server reports | ~1 day | Generic, then corrects |

**We chose C.** Rationale: the goal was correctness of the rendered value, and enforcement was
already server-side, so A and B would have added infrastructure without adding security. A/B only
become worthwhile for first-paint/SEO reasons (no flicker, correct HTML for crawlers).

### Prerequisites if A or B is ever adopted

Real blockers found while scoping; they apply regardless of which option:

1. **No Cognito hosted-UI domain exists**, and the backend app client defines no OAuth settings, so
   its callback URL is the CDK default placeholder (`https://example.com`). The OAuth *code* flow
   this client configures when a domain is set cannot work in deployed environments until a
   `UserPoolDomain` and real callback/logout URLs are added. Apple sign-in (`signInWithRedirect`) is
   affected today; Google sign-in uses Google Identity Services plus Cognito custom auth and is not.
2. **Tokens are invisible to the server.** Amplify keeps them in browser storage, so an origin never
   receives them. Server-side tier reading needs an httpOnly session cookie (a BFF), not
   JS-readable cookie storage.
3. **CloudFront would leak personalized HTML.** The cache policy ignores cookies with a 1-day TTL, so
   personalized HTML would be served across users. Any per-tier rendering must add the tier to the
   cache key (coarse buckets) or mark authenticated HTML `private, no-store`.
4. **Drop the `implicit` OAuth flow** (currently enabled by CDK default) and keep `code` only.
5. **Staleness**: the JWT claim is only as fresh as the token (ID and access tokens are valid for 60
   minutes). After a purchase, force a token refresh and re-read `GET /state/{userId}`.
   `POST /state/upgrade` already returns the freshly reconciled state for this purpose; the current
   upgrade handler in `src/app/AppContent.tsx` calls it, refreshes the session and refetches state
   and profile.

## Deployment

A push to protected `main` is delivered directly to AWS through the CDK-managed GitHub
CodeConnection. A CodePipeline V2 execution then deploys the production site into frontend account
`851725215059`; GitHub Actions and GitHub OIDC are not in the deployment path. The pipeline uses
`SUPERSEDED` execution mode: a newer push replaces an older execution still waiting (for example at
manual approval), so only the latest tested assembly is deployed. The frontend lives in Mumbai
(`ap-south-1`). The backend accounts own **only** the API zones (`api.gamma.onehook.club` in gamma
account `627367419734`, `api.onehook.club` in prod account `934140897625`); this pipeline never deploys
backend resources.

There is a single deployed site, production `onehook.club`. Both it and local development point
their browser traffic at the Gamma backend for now (see "Runtime Configuration"). There is no
separate `gamma.onehook.club` frontend website.

| Stage | AWS account | Site | Runtime backend used by current artifact | Hosted zone | CloudFront certificate |
|---|---|---|---|---|---|
| **production** | `851725215059` (owns the `onehook.club` zone) | `onehook.club` (+ `www`, which redirects to the apex) | **temporarily the Gamma REST/GraphQL backend** (`api.gamma.onehook.club` / `graphql.api.gamma.onehook.club`); switch to `api.onehook.club` / `graphql.api.onehook.club` only after backend production promotion | existing `onehook.club` zone | dedicated `OneHook-Certificate-prod` stack in `us-east-1` (ownership preserved) |

The pipeline is strictly sequential (`Source`, `Verify`, `BuildProduction`, `ApproveProduction`,
`DeployProduction`, `SmokeProduction`):

```text
Source (exact main commit)
→ Verify
→ Build/test/check + synthesize production cloud assembly
→ AWS manual approval
→ Deploy the exact approved assembly without rebuilding or re-synthesizing
→ Smoke-test production (https://onehook.club/ must return HTTP 200 within 10 attempts)
```

`DeployProduction` deploys three stacks from the stored assembly: `OneHook-Certificate-prod`,
`OneHook-Frontend-prod` and `OneHook-ChatbotDns-prod`.

CodePipeline stores source and build outputs in its encrypted, private, versioned S3 artifact
bucket. `BuildProduction` has only pipeline-required artifact-bucket and build-log access; it has no
infrastructure API or role-assumption permission. The stable public `onehook.club` hosted-zone ID is
source-controlled, so synthesis is deterministic and lookup-free.
`DeployProduction` receives only the immutable assembly artifact and can assume only the four exact
deploy and file-publishing bootstrap roles in `ap-south-1` and `us-east-1`. No project can assume
lookup or image-publishing roles, wildcard `cdk-*` roles, or roles in backend account
`627367419734`.

For now, the production artifact deliberately selects the checked-in Gamma backend entry. Production
backend promotion is a separate backend-repository operation; once it has been tested and deployed,
add a `prod` entry to `src/config/deployment.config.ts` and change only the production build's
`VITE_BACKEND_STAGE` selector. The frontend stack creates **A and AAAA** aliases in account
`851725215059`, and the app rejects a deploy attempted with credentials from any other account.

### AWS pipeline infrastructure

The delivery plane is defined in `infra/pipeline/frontend-pipeline-stack.ts` and its source-controlled
buildspecs in `infra/pipeline/buildspecs/` (`verify.yml`, `production-build.yml`,
`production-deploy.yml`, `smoke.yml`). It provisions:

- A GitHub `AWS::CodeConnections::Connection`; IAM permits `UseConnection` only on its exact ARN,
  the source action fixes `pushpsood/OneHookClient` branch `main`, and the GitHub App installation
  is granted access only to that repository.
- A CodePipeline V2 pipeline named `OneHook-Frontend` in `SUPERSEDED` execution mode.
- Separate CodeBuild projects and service roles for verification, smoke tests, production
  build/synth and production deployment.
- A private, encrypted, versioned S3 artifact bucket with lifecycle cleanup (objects expire after 30
  days, noncurrent versions after 7).
- CloudWatch build logs retained for one month.
- An SNS production-approval topic.
- An unattached managed policy granting only the exact production `PutApprovalResult` action; attach
  it to the designated AWS IAM Identity Center permission set or approver role.

The pipeline is not self-mutating. Pipeline-infrastructure changes are intentionally reviewed and
bootstrapped with frontend-account administrator credentials:

```bash
AWS_PROFILE=pushp-sde-aws npm run synth:pipeline
AWS_PROFILE=pushp-sde-aws npm run diff:pipeline
AWS_PROFILE=pushp-sde-aws npm run deploy:pipeline
```

If this CDK CLI reports that no credentials are configured even though the SSO profile is valid,
export that profile's temporary credentials into the current shell without writing them to disk,
then rerun the commands:

```bash
eval "$(aws configure export-credentials --profile pushp-sde-aws --format env)"
npm run diff:pipeline
npm run deploy:pipeline
```

Deploying this stack is a high-impact infrastructure change and must be explicitly approved after
reviewing `diff:pipeline`. The stack has termination protection enabled.

### One-time CodeConnections authorization

A connection created by CloudFormation always starts in `PENDING`; there is no API-only way to
complete GitHub OAuth. After the initial pipeline-stack deployment:

1. Open AWS Console in frontend account `851725215059`, region `ap-south-1`.
2. Go to **Developer Tools → Settings → Connections**.
3. Select `OneHookClient-GitHub` and choose **Update pending connection**.
4. Install/select the AWS Connector for GitHub App with access to only
   `pushpsood/OneHookClient`, then complete **Connect**.
5. Verify the status is `AVAILABLE` before pushing the cutover commit.

The connection fetches the exact commit directly. GitHub does not send AWS credentials and no
GitHub Actions OIDC role is involved.

### Production approval authority

The pipeline outputs `ProductionApprovalPolicyArn`. Attach that managed policy only to the
designated AWS approver identity. It grants `codepipeline:PutApprovalResult` only for
`OneHook-Frontend/ApproveProduction/ApproveTestedArtifact`. Subscribe the desired release
notification destination to the output `ApprovalTopicArn`; an email subscription requires explicit
recipient confirmation.

### Safe cutover from GitHub Actions

There is no GitHub deployment workflow, deployment environment, `AWS_ROLE_ARN` secret or GitHub
`VITE_*` configuration in the new path. `.github/workflows/ci.yml` remains PR-only.

Do not delete the existing live GitHub OIDC roles until this migration succeeds end to end. Cut over
in this order:

1. Deploy the pipeline stack manually and authorize its PENDING connection.
2. Attach the generated production-approval policy to the designated AWS approver.
3. Push the frontend cutover commit and observe CodePipeline build the production assembly.
4. Approve and verify the exact production assembly and production smoke test.
5. Only then remove GitHub environment secrets and the old
   `GitHubActionsDeployRole-gamma`, `GitHubActionsDeployRole-production`, and broad
   `GitHubActionsDeployRole` in a separately reviewed cleanup.

`setup-aws-oidc.sh` is retained temporarily as a guarded rollback utility and refuses to run unless
`ALLOW_LEGACY_GITHUB_OIDC=1` is explicitly set.

### Domain and DNS Setup

The frontend account `851725215059` hosts the Route53 zone for the site domain: the existing
`onehook.club` zone. The backend account keeps only the `api.gamma.onehook.club` /
`api.onehook.club` API zones. If you are migrating a domain, point the registrar's nameservers at
the corresponding Route53 hosted zone. During deployment CDK provisions the CloudFront certificate
in `us-east-1` for production (dedicated `OneHook-Certificate-prod` stack, covering `onehook.club`
and `*.onehook.club`, DNS-validated in the `onehook.club` zone).

## Infrastructure

The production site is deployed as a static site via:
- **S3 (ap-south-1)**: hosts the built assets; private, encrypted, versioned and retained on stack
  deletion; read by CloudFront through an Origin Access Identity
- **CloudFront (Global)**: CDN with HTTPS (TLS 1.2 minimum), caching, security headers (HSTS,
  `X-Frame-Options: DENY`, nosniff, referrer policy, `Permissions-Policy`) and access logging. A
  viewer-request CloudFront Function redirects `www` to the apex with a 301 and maps
  `/<route>` to `/<route>/index.html`. Missing objects (S3 404 or 403) return `/404.html` with a
  real 404 status.
- **`app.onehook.club` smart link**: a second CloudFront distribution whose viewer-request function
  302-redirects to the App Store or Play Store by User-Agent. Both store links are `null` today
  (`src/config/app-store-links.ts`), so every device goes to `https://onehook.club/login`.
- **Route53**: A + AAAA alias records for CloudFront, in the frontend account's `onehook.club`
  zone (apex, `www` and `app`)
- **AWS Certificate Manager (us-east-1)**: CloudFront TLS cert; a dedicated `OneHook-Certificate-prod`
  stack (ownership preserved)
- **Mr OneHook chatbot DNS** (`OneHook-ChatbotDns-prod`, `infra/stacks/chatbot-dns-stack.ts`): CNAME
  and `asuid` TXT records for `chatbot.gamma.onehook.club` and `chatbot.onehook.club`, pointing at
  the Azure App Service hosts

Stage infrastructure is defined in `infra/stacks/frontend-app.ts`, `infra/stacks/frontend-stack.ts`,
`infra/stacks/chatbot-dns-stack.ts` and `infra/stacks/constants.ts`; delivery infrastructure is
defined separately in `infra/pipeline/pipeline-app.ts` and `infra/pipeline/frontend-pipeline-stack.ts`.
Synthesize the production stage with `npm run synth:prod` and the pipeline with
`AWS_PROFILE=pushp-sde-aws npm run synth:pipeline`. The direct `npm run deploy:prod` script remains
available for break-glass recovery, not the normal release path.

## Related Repositories

- **OneHookBackend**: backend microservices (REST API, AppSync, Cognito, intelligence, telemetry
  catalog) and the source of `onehook-api-client`
- **OneHookPlatform**: iOS and Android mobile applications (where sign-up happens)
- **OneHookUXEnhancement**: the Mr OneHook chatbot API on Azure App Service
- **OneHookAdminPortal**: admin portal, including the public member moderation gateway used for report evidence

## Azure OIDC Setup (GitHub Actions to Azure)

`.github/workflows/push-context.yml` uploads `CRUX.md` to the `codecontext` container of the first
storage account in resource group `onehook-chatbot-rg` on pushes to `main` that change `CRUX.md` (or
the workflow), or on manual dispatch. It signs in to Azure with OIDC using the
`AZURE_CLIENT_ID_CLIENT`, `AZURE_TENANT_ID_CLIENT` and `AZURE_SUBSCRIPTION_ID_CLIENT` secrets, which
`setup-azure-oidc.sh` creates. This is the only GitHub workflow that talks to a cloud provider; it
does not deploy the website.

### Prerequisites
1. **Azure CLI**: `az login`
2. **GitHub CLI**: `gh auth login`

### Setup Instructions
1. Make the setup script executable:
   ```bash
   chmod +x setup-azure-oidc.sh
   ```
2. Run the script:
   ```bash
   ./setup-azure-oidc.sh
   ```

### What does this script do?
- Creates an **Azure AD Application** named `OneHookClientGitHubActions` and its service principal.
- Grants it **Contributor** and **Storage Blob Data Contributor** at the scope of your current Azure subscription.
- Creates a **Federated Identity Credential** for the `pushpsood/OneHookClient` repository on the `main` branch (subject includes the numeric owner and repo IDs).
- Saves `AZURE_CLIENT_ID_CLIENT`, `AZURE_TENANT_ID_CLIENT`, and `AZURE_SUBSCRIPTION_ID_CLIENT` to your GitHub repository secrets (the `_CLIENT` suffix ensures they do not conflict with backend Azure credentials).
