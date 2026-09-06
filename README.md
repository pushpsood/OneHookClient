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

The application defaults to the real Gamma backend through the public, checked-in configuration in
`src/config/deployment.config.ts`. No `.env` is required for normal development:

```bash
npm run dev
```

If you need to point your local browser at different real infrastructure, copy `.env.example` to the
git-ignored `.env` and set only the overrides you need. Local scaffolding remains each developer's
responsibility: there is no mock server, mock scenario, or fixture data in the runtime tree.

## Runtime Configuration

Public browser configuration is source-controlled in `src/config/deployment.config.ts`. The
production-site artifact and local development both select its `gamma` entry, which contains the
unified REST URL, AppSync GraphQL URL, Cognito public identifiers, chatbot URL, feature defaults,
timeout, and log level. Vite bundles these values into browser JavaScript, so this file must never
contain a secret.

No GitHub `VITE_*` variables or local `.env` are required. The production CodeBuild project sets
only the non-secret selector `VITE_BACKEND_STAGE=gamma`; an unknown selector fails the build.
Developers may copy `.env.example` to ignored `.env` and override individual values for local
work. Explicit boolean, timeout, and log-level overrides are validated, while blank values use
source defaults. The unused `VITE_WS_URL` setting has been removed.

Gamma Cognito is in `ap-south-1`. Its IDP endpoint is derived from that region. User Pool, app-client
and Identity Pool IDs are public routing identifiers rather than credentials. Redirects default to
the browser origin, but Amplify Hosted UI OAuth is enabled only when domain, sign-in redirect, and
sign-out redirect are all non-empty; direct Cognito authentication remains available without it.

When the production backend has been deployed and validated, add a source-controlled `prod` entry,
then change only the production build's `VITE_BACKEND_STAGE` selector. Do not switch production URLs
independently in pipeline settings.

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
  actionable message — never degrade to a stub.
- **Real backends for real behaviour.** Develop against a deployed environment; keep that wiring in untracked files.
- **Tests stay, mocks go.** Unit/integration tests under `src/tests` are *not* shipped (Vitest files
  are never bundled) and remain first-class. What is banned is test-support code living in the
  application's runtime path.
- **Tests must be hermetic.** A committed test must not depend on a developer's local `.env`; stub
  every variable it reads. (A previously committed env test silently passed only on machines with no
  local `.env` — exactly the failure mode this rule prevents.)

Anything test-related that must exist locally belongs in your own untracked working files.

### Deployments are gated on tests

`.github/workflows/ci.yml` remains a pull-request-only GitHub check. Deployment is independently
gated inside the AWS pipeline because pull-request and `main` push events are separate: the
CodePipeline `Verify` stage runs `npm run lint` and `npm test` against the exact CodeConnections
source revision before any deployment-capable CodeBuild project runs.

On every push to `main`, `BuildProduction` repeats type checking and tests, builds the production
bundle, verifies its bundled endpoints, and synthesizes a complete CDK cloud assembly. Only that
immutable pipeline artifact reaches AWS manual approval. The post-approval project deploys the
stored assembly with `--app cdk.out.prod`; it never runs Vite or CDK synthesis again.

A failed check, build, synth, or deployment therefore cannot reach production approval.

> **Repository setting:** keep `lint-and-test` as a required GitHub status check for `main`, so a
> failing pull request cannot merge. CodePipeline then independently verifies the merged commit
> before deployment.

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

A push to protected `main` is delivered directly to AWS through the CDK-managed GitHub
CodeConnection. A queued CodePipeline V2 execution then deploys the production site into frontend
account `851725215059`; GitHub Actions and GitHub OIDC are not in the deployment path. The frontend
lives in Mumbai (`ap-south-1`). Backend account `627367419734` owns **only** the API zones
(`api.gamma.onehook.club`, `api.onehook.club`); the pipeline never deploys backend resources.

There is a single deployed site — production `onehook.club`. Both it and local development point
their browser traffic at the Gamma backend for now (see "Runtime Configuration"). There is no
separate `gamma.onehook.club` frontend website.

| Stage | AWS account | Site | Runtime backend used by current artifact | Hosted zone | CloudFront certificate |
|---|---|---|---|---|---|
| **production** | `851725215059` (owns the `onehook.club` zone) | `onehook.club` (+ `www`) | **temporarily the Gamma REST/GraphQL backend** (`api.gamma.onehook.club` / `graphql.api.gamma.onehook.club`); switch to `api.onehook.club` / `graphql.api.onehook.club` only after backend production promotion | existing `onehook.club` zone | dedicated `OneHook-Certificate-prod` stack in `us-east-1` (ownership preserved) |

The pipeline is strictly sequential:

```text
Source (exact main commit)
→ Verify
→ Build/test/check + synthesize production cloud assembly
→ AWS manual approval
→ Deploy the exact approved assembly without rebuilding or re-synthesizing
→ Smoke-test production
```

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
buildspecs. It provisions:

- A GitHub `AWS::CodeConnections::Connection`; IAM permits `UseConnection` only on its exact ARN,
  the source action fixes `pushpsood/OneHookClient` branch `main`, and the GitHub App installation
  is granted access only to that repository.
- A queued CodePipeline V2 pipeline named `OneHook-Frontend`.
- Separate CodeBuild projects and service roles for verification, smoke tests, production
  build/synth and production deployment.
- A private, encrypted, versioned S3 artifact bucket with lifecycle cleanup.
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
in `us-east-1` for production (dedicated `OneHook-Certificate-prod` stack, DNS-validated in the
`onehook.club` zone).

## Infrastructure

The production site is deployed as a static site via:
- **S3 (ap-south-1)** — Hosts the built assets
- **CloudFront (Global)** — CDN with HTTPS, caching, and security headers
- **Route53** — A + AAAA alias records for CloudFront, in the frontend account's `onehook.club`
  zone (apex + `www`)
- **AWS Certificate Manager (us-east-1)** — CloudFront TLS cert; a dedicated `OneHook-Certificate-prod`
  stack (ownership preserved)

Stage infrastructure is defined in `infra/stacks/frontend-app.ts` and
`infra/stacks/frontend-stack.ts`; delivery infrastructure is defined separately in
`infra/pipeline/pipeline-app.ts` and `infra/pipeline/frontend-pipeline-stack.ts`. Synthesize the
production stage with `npm run synth:prod` and the pipeline with
`AWS_PROFILE=pushp-sde-aws npm run synth:pipeline`. The direct `npm run deploy:prod` script remains
available for break-glass recovery, not the normal release path.

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
