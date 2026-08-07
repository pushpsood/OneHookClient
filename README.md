# OneHook Client

React frontend application for the OneHook platform. Built with Vite, React 19, Tailwind CSS 4, and deployed via AWS CDK (S3 + CloudFront).

## Tech Stack

- **React 19** — UI framework
- **Vite 6** — Build tool & dev server
- **Tailwind CSS 4** — Utility-first styling
- **Zustand** — State management
- **Motion** — Animations
- **Lucide React** — Icons
- **React Router 7** — Client-side routing
- **Vitest** — Testing

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- **The generated API SDK.** `@onehook/api-client` is a `file:` link into the sibling
  `OneHookBackend` repo's generated Smithy output. It is a hard requirement — there is deliberately
  **no stub or mock fallback**, so a missing SDK fails the build loudly instead of silently shipping
  fake API behaviour:

  ```bash
  cd ../OneHookBackend/packages/api-models && mvn -q exec:java   # generate
  cd ../../../OneHookClient && npm install                       # re-link
  ```

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (port 3000)
npm run dev

# Run tests
npm test

# Type-check
npm run lint

# Build for production
npm run build
```

## Local Development Setup

**Local development scaffolding is each developer's own responsibility and is not committed to this
repository.** There is no mock server, no mock scenarios, and no fixture data in the tree. Point the
app at a real backend by creating your own `.env` (git-ignored — only `.env.example` is tracked):

```bash
cp .env.example .env   # then fill in the values for the backend you're developing against
```

Run against a deployed environment, or stand up the backend locally (see `OneHookBackend`'s
`scripts/local-dev.sh` for LocalStack) — whichever you prefer. Because the choice is personal, keep
it in your own untracked files; never add it to the repo.

## Environment Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Key variables:
- `VITE_API_BASE_URL` — Backend API Gateway URL (from OneHookBackend deployment)
- `VITE_COGNITO_USER_POOL_ID` — Cognito User Pool ID (from OneHookBackend deployment)
- `VITE_COGNITO_CLIENT_ID` — Cognito App Client ID (from OneHookBackend deployment)

### Architecture Notes: Cognito Authentication

This application uses standard `.env` variables (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) for AWS Cognito integration, injected by Vite at build time. 

#### Why are these values hardcoded at build time?
- **Not Sensitive:** User Pool IDs and Client IDs are public identifiers used for routing, not secret keys.
- **Simplicity:** This allows frontend libraries like AWS Amplify to work seamlessly in the browser out-of-the-box.
- **Low Churn:** Cognito User Pools are typically created once per environment (Dev/Staging/Prod) and rarely change. If a pool is recreated, a simple frontend redeployment is sufficient to point the app to the new pool.

#### Decoupling vs. Simplicity (BFF Pattern)
While it is possible to completely decouple the frontend from Cognito by using a Backend-For-Frontend (BFF) proxy (where the frontend only talks to a custom backend, and the backend talks to Cognito), this introduces significant complexity. This BFF approach is generally only recommended when:
1. Strict security audits prohibit storing JWTs in `localStorage` (requiring HTTP-only cookies).
2. The application requires dynamic multi-tenancy (each client has their own User Pool).
3. There are imminent plans to migrate away from AWS Cognito to another Identity Provider.

For this project's current needs, the `.env` approach remains the most efficient and standard practice.

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
| Committing personal `.env` / LocalStack wiring | Local setup is per-developer; committed copies drift and leak environment details |

What this requires instead:

- **Fail loudly.** Missing prerequisites (e.g. the generated SDK) must break the build with an
  actionable message — never degrade to a stub.
- **Real backends for real behaviour.** Develop against a deployed environment or your own local
  stack; keep that wiring in untracked files.
- **Tests stay, mocks go.** Unit/integration tests under `src/tests` are *not* shipped (Vitest files
  are never bundled) and remain first-class. What is banned is test-support code living in the
  application's runtime path.
- **Tests must be hermetic.** A committed test must not depend on a developer's local `.env`; stub
  every variable it reads. (A previously committed env test silently passed only on machines with no
  local `.env` — exactly the failure mode this rule prevents.)

Anything test-related that must exist locally belongs in your own untracked working files.

### Deployments are gated on tests

`.github/workflows/deploy-frontend.yml` runs a **`verify` job (`npm run lint` + `npm test`) that the
`deploy` job depends on** (`needs: verify`). Nothing is deployed unless type-checking and the test
suite pass on the exact commit being deployed, and because the gate is a separate job, a failing
build never reaches the AWS credential step — a red commit cannot assume the deploy role.

This is deliberately duplicated from `ci.yml` rather than relying on it: `push` and `pull_request`
are **independent triggers**, so PR checks alone do not gate a direct push to `main` or a manual
`workflow_dispatch` run.

> **Remaining manual step (GitHub setting, not in this repo):** mark `lint-and-test` a **required
> status check** for `main` under *Settings → Branches → Branch protection*, so a red PR cannot be
> merged in the first place. The in-workflow gate above stops a bad deploy; branch protection stops
> a bad merge.

## Rendering Model & Tier Personalization (SSR tradeoffs)

Today this app is a **client-rendered SPA**: Vite builds static assets, S3 serves them, CloudFront
caches them. There is no server-side rendering tier and no edge compute in the request path.

### How the subscription tier is resolved (implemented)

The tier is **server-authoritative**. It is read from the State service (`GET /state/{userId}`),
which owns the connection state machine and the entitlement, and published to the Zustand store as
`userState`; the UI derives `isPremium` from it.

It is deliberately **not** read from the profile: the Profile service intentionally omits
`subscriptionTier` from its read model, so reading it off a profile silently yields `undefined` —
which previously made *every* user render as `PREMIUM` and hid the upgrade CTA from free users.

`isPremium` **fails closed**: until the snapshot loads the UI shows `BASIC`, so it never briefly
promises premium.

> **The UI is not a security boundary.** A user can edit their own browser and reveal a premium
> control; clicking it still fails, because entitlement is enforced independently server-side (State
> enforces capacity in a DynamoDB condition expression, Chat rejects premium mutations for `FREE`
> callers, Profile derives the tier from the verified JWT claim and ignores any tier in a request
> body). Tier in the client is a **rendering input only**.

### Options considered for server-side personalization

| | What it does | Cost | First paint |
|---|---|---|---|
| **A — Edge tier-routing** | Lambda@Edge verifies the JWT and serves one of ~3 pre-rendered per-tier HTML variants; CDN cache key includes a coarse tier cookie | ~3–5 days | Already correct |
| **B — SSR/BFF on Lambda** | Real per-user server rendering behind CloudFront; httpOnly session cookie; OAuth code exchange | ~1.5–3 weeks | Already correct, per-user |
| **C — Server-authoritative bootstrap** ✅ | Keep the SPA; render from the tier the server reports | ~1 day | Generic, then corrects |

**We chose C.** Rationale: the goal was correctness of the rendered value, and enforcement was
already server-side — so A and B would have added infrastructure without adding security. A/B only
become worthwhile for first-paint/SEO reasons (no flicker, correct HTML for crawlers).

### Prerequisites if A or B is ever adopted

Real blockers found while scoping; they apply regardless of which option:

1. **No Cognito hosted-UI domain exists**, and the app client's callback URL is still the CDK
   placeholder (`https://example.com`). The OAuth *code* flow this client already configures cannot
   work in deployed environments until a `UserPoolDomain` and real callback/logout URLs are added —
   social sign-in is affected today.
2. **Tokens are invisible to the server.** Amplify keeps them in browser storage, so an origin never
   receives them. Server-side tier reading needs an httpOnly session cookie (a BFF), not
   JS-readable cookie storage.
3. **CloudFront would leak personalized HTML.** The cache policy ignores cookies with a 1-day TTL, so
   personalized HTML would be served across users. Any per-tier rendering must add the tier to the
   cache key (coarse buckets) or mark authenticated HTML `private, no-store`.
4. **Drop the `implicit` OAuth flow** (currently enabled by CDK default) and keep `code` only.
5. **Staleness**: the JWT claim is only as fresh as the token (~1h). After a purchase, force a token
   refresh and re-read `GET /state/{userId}` — `POST /state/upgrade` already returns the freshly
   reconciled state for this purpose.

## Deployment

This project uses **GitHub Actions** for automated CI/CD. When you push to the `main` branch, it automatically deploys to AWS (Mumbai `ap-south-1` region) using AWS CDK.

### Initial AWS Setup (OIDC)

For GitHub Actions to securely deploy to AWS without using long-lived static access keys, we use **OpenID Connect (OIDC)**. 

If you are setting this up for the first time, run the provided script on your local machine (ensure you have AWS CLI installed and configured):

```bash
chmod +x setup-aws-oidc.sh
./setup-aws-oidc.sh
```

This script creates an OIDC Identity Provider and an IAM Role (`GitHubActionsDeployRole`) with least-privilege permissions, ensuring that only this specific GitHub repository can assume the role to deploy the CDK stacks.

### GitHub Secrets

To enable the automated deployment, add the following to your GitHub Repository **Settings -> Secrets and variables -> Actions**:

- `AWS_ROLE_ARN`: The ARN output by the `setup-aws-oidc.sh` script (e.g., `arn:aws:iam::123456789012:role/GitHubActionsDeployRole`)
- `FRONTEND_DOMAIN`: The custom domain for your frontend (e.g., `onehook.club`)

### Domain and DNS Setup

If you are using a custom domain (like GoDaddy), you must point your DNS to AWS Route 53 to utilize the automated SSL generation:

1. **Create a Hosted Zone** in AWS Route 53 for your domain (e.g., `onehook.club`).
2. Copy your existing DNS records (MX for Apple Mail, TXT, CNAMEs) into your new Route 53 Hosted Zone.
3. Update the **Nameservers** in your domain registrar (e.g., GoDaddy) to the 4 AWS Nameservers provided by Route 53.

During deployment, the CDK script will automatically request a wildcard SSL certificate (`*.onehook.club`) in `us-east-1` (required by CloudFront), validate it via your Route 53 zone, and attach it to your CloudFront distribution securely.

## Infrastructure

The frontend is deployed as a static site via:
- **S3 (ap-south-1)** — Hosts the built assets
- **CloudFront (Global)** — CDN with HTTPS, caching, and security headers
- **Route53** — Automatically manages DNS alias records for CloudFront
- **AWS Certificate Manager (us-east-1)** — Automatically provisions and validates SSL certificates

Infrastructure is defined in `infra/stacks/frontend-app.ts` using AWS CDK.

## Related Repositories

- **OneHookBackend** — Backend microservices (provides API + Cognito)
- **OneHookPlatform** — iOS and Android mobile applications

## Azure OIDC Setup (For Azure Deployments)

If you are migrating this frontend to Azure (e.g., Azure Static Web Apps) or need to deploy resources to Azure via GitHub Actions, you can establish a secretless trust using Azure Managed Identities and OpenID Connect (OIDC).

To set this up, a script has been provided: `setup-azure-oidc.sh` (specifically for Azure).

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
- Creates an **Azure AD Application (Service Principal)** named `OneHookClientGitHubActions`.
- Grants it **Contributor** access to your Azure Subscription.
- Creates a **Federated Identity Credential** for the `pushpsood/OneHookClient` repository on the `main` branch.
- Automatically saves `AZURE_CLIENT_ID_CLIENT`, `AZURE_TENANT_ID_CLIENT`, and `AZURE_SUBSCRIPTION_ID_CLIENT` to your GitHub repository secrets (the `_CLIENT` suffix ensures they do not conflict with backend Azure credentials).
