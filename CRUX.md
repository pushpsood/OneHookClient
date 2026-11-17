# OneHook: Product and Technical Overview (Crux)

This document summarizes what OneHook is, the problems it solves, how the product works, and how the
repositories fit together. It is also the product context for Mr OneHook: the `push-context.yml`
workflow uploads it to Azure Blob Storage (container `codecontext`, gamma resource group
`onehook-chatbot-rg`), and the Mr OneHook backend adds it to the prompt of both the public product chat
and the member chat. Keep it accurate and free of secrets or internal security findings.

Detailed, maintained documentation lives in each repository's README (see section 7).

---

## 1. What is OneHook?

OneHook is a high-intent dating and connection platform built around the tagline **"One connection.
Zero distractions."** It is meant for people tired of endless swiping, ghosting and low-intent matches.

### Product philosophy

- **Intentional matching over infinite choice.** Each member can hold only a small number of
  connections ("hooks") at a time, so they engage with fewer, better matches.
- **Focused conversation over noise.** There are no feeds, stories or reels. The experience centres on
  private, end-to-end encrypted 1:1 chat and calls.
- **Matching is optional.** A member can use OneHook for chat only and turn matching on when they want
  to be discovered.

## 2. Customer problems OneHook solves

| Problem with mainstream dating apps | How OneHook addresses it |
|---|---|
| Endless swiping, decision fatigue | A hook limit per tier (1 for Must and Super, 3 for Infinity); discovery pauses when a member is at capacity |
| Ghosting and low-intent matches | A hook is a deliberate, limited commitment; members can be nudged when a conversation cools |
| Superficial conversations | No social feeds; the product is built around 1:1 chat, voice notes and voice/video calls |
| Privacy concerns | Messages, attachments and call signaling are end-to-end encrypted; the backend never sees content |
| Fake or unsafe profiles | Phone OTP verification, Face Liveness checks, automated media and text moderation, blocks and reports |
| Shallow matchmaking | A multi-signal ranking engine plus AI-assisted suggestions (Mr OneHook) |

## 3. How the product works

### Accounts and sign-in

Members sign up in the mobile apps with a phone number and OTP (invites are supported) and can add a
username, email, password, passkeys and Apple or Google sign-in. The web app supports signing in, but
new accounts are created in the apps.

### Membership tiers

| Tier | Price | Hooks at a time | Notes |
|---|---|---|---|
| Must | Free | 1 | Mixed discovery deck; Mr OneHook limited to 10 messages per day |
| Super | Paid | 1 | Choose a discovery category, save OneHook suggestions, saved Mr OneHook chats |
| Infinity | Paid | 3 | Everything in Super, plus more connections and the option to hide past hooks from discovery |

### Hooks

Two members are hooked when they like each other in discovery (a mutual match) or when one sends a hook
request (for example by username) and the other accepts. Releasing a hook ("unhook") ends the
connection and deletes that conversation's messages, media and call history. Blocking someone also
releases any hook between the two members. If a member moves to a tier with fewer hook slots, they choose
which hooks to keep within 7 days; the others are released.

### Discovery (matching on)

Matching is opt-in. When a member turns it on with a complete matching profile, they appear in
discovery and get a discovery deck. Each card says who found it:

- **OneHook Intelligence**: the candidate matches the member's details and preferences.
- **Mr OneHook**: the candidate comes from a suggestion the member asked Mr OneHook for, or from an
  inclination OneHook inferred from the member's recent likes.

Free members get one mixed deck (about 70% OneHook Intelligence, 30% Mr OneHook). Super and Infinity
members can narrow it to one category. Ranking combines desirability, reciprocity, proximity and
profile-embedding similarity, with a stable-matching (Gale-Shapley) step, plus engagement scores from
the intelligence engines. Turning matching off erases the member's matching data; their hooks and chats
stay.

### Chat and calls

Chat is end-to-end encrypted across all of a member's devices, including a recoverable message
history. It supports text, images, voice notes, stickers, GIFs and files, replies, reactions, typing
indicators, last seen, read receipts, disappearing messages and screenshot alerts. Members can make 1:1
voice and video calls; media and signaling are encrypted end to end.

### Mr OneHook

Mr OneHook is OneHook's AI assistant (Azure OpenAI). On the website it answers product questions. In
the apps, a signed-in member can ask about OneHook, about one of their connections, or for help writing
a reply. Chat messages are only ever shared with Mr OneHook as excerpts the member reviews and confirms
first; the excerpts are used for that one answer and are not stored. Super and Infinity members can
choose to save their Mr OneHook conversations (their own questions and Mr OneHook's answers). In a
product chat, Mr OneHook can also record a "find me ..." suggestion that feeds the member's discovery
deck.

### Safety

Profile photos, text and audio are moderated automatically, with an admin moderation queue behind it.
Members can block and report each other. Account deletion erases the member's data in every service.

## 4. Repositories

OneHook is six independently built and deployed repositories. They share no code; they talk over
HTTPS APIs, WebSockets and events. Generated artifacts (the API route manifest, the telemetry catalog
and the membership catalog) are copied from the backend into the client repositories by sync scripts.

| Repository | Purpose | Hosting | Main technologies |
|---|---|---|---|
| **OneHookBackend** | Every core service, including intelligence | AWS (`ap-south-1`) | Java 21 (Lambda, Spring Boot on ECS Fargate), TypeScript and Python 3.12 Lambdas, DynamoDB, RDS PostgreSQL (PostGIS, pgvector), AppSync, EventBridge, AWS CDK |
| **OneHookClient** | Web app and website `onehook.club` | AWS (S3 + CloudFront) | React 19, Vite 6, Tailwind CSS 4, Zustand 5, AWS Amplify |
| **OneHookPlatform** | Native apps | App Store, Google Play | Swift 6, mostly UIKit (iOS 17+); Kotlin (Android, minSdk 26) |
| **OneHookUXEnhancement** | Mr OneHook backend | Azure App Service | Node.js, Azure OpenAI (`gpt-4o`), Azure Blob and Table Storage, Terraform |
| **OneHookAdminPortal** | Admin portal `admin.onehook.club`: moderation, admissions, scoring policy | AWS | TypeScript, React 19, AWS CDK |

The former GCP repository `OnehookIntelligence` is archived. Its engines (scoring, intent, behavioral
and temporal) now run on AWS inside OneHookBackend (`packages/intelligence`).

## 5. Architecture

### Backend services (OneHookBackend)

| Service | Responsibility |
|---|---|
| Identity | Registration, phone/email OTP, Apple/Google sign-in, passkeys, usernames, invites, account state, account deletion |
| Profile | Chat and matching profiles, media, moderation, Face Liveness |
| State | Hooks and their lifecycle, hook requests, blocks, reports, tier capacity, matching on/off |
| Matching | Discovery decks, swipes, mutual matches, profile embeddings (Amazon Bedrock Titan), OneHook suggestions |
| Chat | Encrypted messaging (AppSync GraphQL over WebSockets), device keys, attachments, notifications, calls |
| Analytics | Client telemetry ingest, data lake, social graph, reconciliation, dashboards |
| Intelligence | Engagement scoring, intent and behavioral analysis; pushes scores to Matching |

### Request and event flow

1. **Clients to backend.** REST calls go to one CloudFront ingress (`api.onehook.club`, or
   `api.gamma.onehook.club` for gamma) that routes by path to each service's API Gateway; every member
   request carries a Cognito ID token. Chat uses AppSync GraphQL and WebSockets at `graphql.api...`.
2. **Between services.** Services publish domain events (for example `ProfileUpdated`, `MutualMatch`,
   `HookCreated`, `MessageSent`, `UserDeleted`) on one EventBridge bus per stage, and consumers react
   asynchronously. Several services use a transactional outbox so an event is published only if its
   database write committed.
3. **Intelligence.** A forwarder takes engagement events (swipes, matches, conversation activity and
   client telemetry) off the bus and feeds the Python engines. They publish `IntelligenceScoresUpdated`
   back on the bus, and Matching keeps a local copy of the scores for ranking. Nothing calls the
   engines on a request path. This all runs inside AWS; there is no cross-cloud hop.
4. **Mr OneHook.** The apps and website call the Azure service directly. For member chats it reaches
   OneHook data through a federated AWS role limited to a few read-only routes (match context,
   matching status) and one route to record suggestions, plus an account-deletion queue.

### Environments

The backend has two stages, **gamma** (testing) and **prod**, each in its own AWS account with its own
data. Today the website and local development use the gamma backend.

## 6. Privacy and security posture

- **End-to-end encryption.** Message content, reactions, attachments and call signaling are encrypted
  on the device. The backend stores ciphertext and the minimum metadata needed to deliver it.
- **Identity.** Amazon Cognito is the identity provider. APIs verify the member's token, and the
  member's tier is read from the verified token, not from the request.
- **Least privilege.** Service-to-service and admin calls use AWS IAM (SigV4). Every application role
  is capped by a permissions boundary, and the deployment pipeline holds no long-lived credentials.
- **Data minimization.** Unhooking deletes a conversation's messages, media and call history. Account
  deletion triggers erasure in every service, including the data lake, the intelligence engines and
  Mr OneHook. Turning matching off erases matching data.
- **Edge protection.** AWS WAF protects the public authentication and chat routes in production, and
  APIs are rate limited.

## 7. Engineering practices

- **Infrastructure as code.** AWS CDK for the backend, web client and admin portal; Terraform for the
  Azure service.
- **Contracts as code.** Every HTTP route is a Smithy operation; the route manifest, the TypeScript SDK
  (`onehook-api-client`), the Java models and contract tests are generated or checked from it. Events and
  client telemetry have their own catalogs with tests.
- **Delivery.** The backend deploys through AWS CodePipeline: build and test, deploy to gamma, then a
  separately built prod release after manual approval. The web client deploys through its own
  CodePipeline with a production approval. The Mr OneHook backend deploys with GitHub Actions to gamma,
  then prod after approval. Pull requests run CI in GitHub Actions.

For details, read the README of each repository: OneHookBackend (with one README per package),
OneHookClient, OneHookPlatform (`ios/` and `android/`), OneHookUXEnhancement and OneHookAdminPortal.
