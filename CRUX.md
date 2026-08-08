# OneHook — Complete Product & Technical Overview (Crux)

This document provides a comprehensive overview of the OneHook platform's product philosophy, architecture, data flow, security posture, and engineering roadmap. It serves as the single source of truth for understanding how the different packages interact and the product problems they solve.

---

## 1. What is OneHook?

OneHook is a premium, high-intent dating and connection platform built around the tagline **"One connection. Zero distractions."** It is positioned as an antidote to mainstream swipe-based dating apps — designed for people tired of endless swiping, ghosting, and low-intent matches.

### Core Product Philosophy
- **Intentional matching over infinite choice** — the app pushes users toward fewer, higher-quality connections rather than an endless feed of options.
- **Focused conversation over noise** — minimal feeds/stories/reels; the experience centers on private, structured chat rather than social-media-style browsing.
- **One connection at a time (or very few)** — this constraint is meant to force deeper engagement instead of shallow, parallel conversations.

## 2. Customer Problems OneHook Solves

| Problem with mainstream dating apps | How OneHook addresses it |
|---|---|
| Endless swiping fatigue, decision paralysis | Limits users to few/high-intent matches at a time |
| Ghosting and low-intent matches | Structured, intent-driven matching reduces noise |
| Superficial, low-quality conversations | Minimal distractions (no feeds/reels), focus on 1:1 private chat |
| Privacy/security concerns in dating apps | End-to-end encrypted chat using a Signal-protocol-style pre-key exchange model |
| Fake profiles / unverified users | Phone number verification and OTP-based identity checks baked into onboarding |
| Poor-quality matchmaking logic | Production-grade, multi-feature scoring/ranking engine (not a simplistic swipe algorithm) |

---

## 3. System Overview & Repositories

OneHook is a distributed, multi-cloud ecosystem composed of five independently managed and deployed repositories. There is **no code coupling** between these repositories; they communicate strictly over network boundaries via APIs, WebSockets, and asynchronous events.

| Repository | Purpose | Cloud/Infra | Primary Tech Stack |
|---|---|---|---|
| **OneHookBackend** | Core business logic, databases, auth, and microservices | AWS | Java 21, Spring Boot, Lambdas, DynamoDB, RDS PostgreSQL (PostGIS+pgvector) |
| **OneHookClient** | Web-based user interface | AWS (S3+CloudFront) | React 19, Vite, Tailwind CSS 4, Zustand |
| **OneHookPlatform** | Native mobile applications | App Stores | Swift (iOS), Kotlin (Android) |
| **OneHookUxEnhancement** | AI-driven features, smart suggestions | Azure | Node.js, Azure OpenAI, Redis Cache, Blob Storage |
| **OnehookIntelligence** | ML/Analytics for matching, behavioral scoring, semantic engine | GCP | Java 21, Cloud Run, Firestore, Pub/Sub |

---

## 4. System Architecture (Backend Deep Dive)

OneHook's core backend is a **serverless monorepo** built on Java (AWS Lambda), DynamoDB, AppSync/GraphQL, and AWS CDK for infrastructure-as-code. It is organized into five core microservices, each following a consistent layered pattern: **Controller → Handler → Service → Repository**, with its own CDK infra stack and dedicated test suite.

### 4.1 Identity Service
- Handles authentication using AWS Cognito and custom Lambda triggers.
- Supports social login (Apple/Google Sign-In) with JWT/JWK signature, issuer, and audience validation via a `JwtVerifier` utility.
- Implements phone number verification with OTP for onboarding and identity assurance.
- *(Note: Historically had two parallel JWT verification implementations to consolidate).*

### 4.2 Chat Service
- Real-time messaging built on AppSync/GraphQL and DynamoDB, exposed via Lambda handlers and REST/GraphQL endpoints.
- Designed for **end-to-end encryption**, using a Signal-protocol-style pre-key bundle/pre-key record exchange system.
- Uses a strategy-pattern handler design with sealed request types and contract tests that cross-validate GraphQL schema, Smithy models, Java code, and CDK infra definitions for consistency.

### 4.3 Matching Service
- Implements a **Gale-Shapley-based ranking/matchmaking engine** — a stable-matching algorithm adapted with a feature-based scoring pipeline.
- Scoring features include desirability, reciprocity, and proximity, combined into a weighted ranking pipeline (`ScoringFeature` implementations).
- Has a `FilterRuleSetRepositoryImpl` intended for a real, tunable rule store (e.g., admin UI/DB-driven), rather than hardcoded rules.
- Designed with experimentation in mind — algorithm labels and rule-set IDs are meant to be surfaced into analytics for A/B testing of weight/blend experiments.

### 4.4 Profile Service
- Manages user profile data and validation (including string-length limits shared with matching-side validators).
- Works alongside identity/matching services to supply the attributes used in scoring and ranking.

### 4.5 State Service
- Coordinates cross-service state (e.g., match lifecycle, connection state transitions) as part of the broader event-driven architecture using AWS EventBridge.

---

## 5. Data Flow Architecture

1. **Edge to Core**:
   - Clients send REST API and WebSocket requests to the AWS API Gateway (protected by AWS WAF and Cognito for JWT validation).
2. **Synchronous Flow**:
   - API Gateway routes requests to Lambda functions (Identity, Profile, State, Chat) or to the ECS Fargate cluster via an internal ALB for the Matching Service.
   - Profile media is uploaded directly or handled via S3.
3. **Asynchronous Event-Driven Flow (AWS)**:
   - Services emit domain events (e.g., `ProfileUpdated`) to an AWS EventBridge Bus.
   - SQS Queues consume these events and feed them to other internal consumers in an ordered manner. DynamoDB Streams-based replay is partially utilized for reliability.
4. **Cross-Cloud Intelligence (AWS ↔ GCP)**:
   - Engagement events happening in AWS are forwarded (normalized) to GCP's `OnehookIntelligence` service via Cloud Run endpoints (`POST /engagement`).
   - The AWS Matching Service queries GCP (`GET /scores/{userId}` or `GET /intent/{userId}`) to construct optimized, intent-aware matching decks.
5. **AI UX Enhancements (AWS/Clients ↔ Azure)**:
   - Clients or backend processes interact with `OneHookUxEnhancement`'s Node.js App Service on Azure to request AI-generated content or features. Rate limiting is enforced via Azure Redis.

---

## 6. Matchmaking Algorithm — Is It Industry-Grade?

OneHook's matching system is **much closer to a production-grade matchmaking system than a simple swipe-based clone**. Supporting signals include:

- A feature-based scoring and ranking pipeline (desirability, reciprocity, proximity, etc.) via composable `ScoringFeature` implementations.
- Use of the Gale-Shapley stable-matching algorithm as the theoretical backbone, adapted with real-world scoring weights.
- Dedicated test coverage (e.g., `GaleShapleyRankingEngineTest`) validating matching logic correctness.
- Architectural readiness for experimentation via algorithm labels and rule-set IDs designed to plug into analytics/experimentation systems.

---

## 7. Privacy & Security Posture

Multiple architectural reviews of the OneHook codebase surfaced and progressively resolved the following:

### Authorization & Vulnerabilities
- **Authorization gaps (IDOR)**: Missing ownership checks on REST handlers in the chat service (e.g., `GetChatHistoryHandler`, `DeleteMatchMessagesHandler`, `GetPreKeyBundleHandler`) were prioritized and fixed given the E2EE/PII sensitivity of the chat service. Following fixes, the chat service was assessed as reasonably ready for production traffic.
- **Data Deletion Bug**: A DynamoDB batch-delete pagination bug (`DynamoMessageRepository.deleteMessagesForMatch`) that could silently violate the "message deleted" guarantee was identified and fixed.

### Authentication Hardening
- **AWS Cognito** provides the central identity provider. All client interactions with the core backend require valid JWTs.
- **JWT/OTP hardening**: Verification logic for social sign-in was reviewed for missing audience (`aud`)/`azp` checks. OTPs need TTL/expiration checks and rate-limiting for resend requests.

### Data Segregation
- **Personally Identifiable Information (PII)**: Core PII, user state, and chats are stored securely in AWS DynamoDB and S3 (for media).
- **ML / Analytics Data**: `OnehookIntelligence` stores only derived behavioral data, engagement signals, and precomputed scores in GCP Firestore. It maintains its own isolated state with tight GCP IAM Auth.
- **AI Context**: Azure Blob Storage (`OneHookUxEnhancement`) temporarily caches necessary context for OpenAI completion requests, ensuring data does not leak across sessions.

### Network Protection
- **AWS WAF**: Shields the main API Gateway against malicious payloads and DDoS attacks.
- **Network security**: Uses an internal NLB (Network Load Balancer) pattern with Fargate tasks. Identified gap around Fargate task security groups being too permissive relative to the NLB's intended isolation.
- **Secrets Management**: AWS Secrets Manager handles sensitive credentials like RDS passwords and JWT signing keys.

---

## 8. Infrastructure & DevOps

- **Infrastructure as Code**: Entire system provisioned via AWS CDK (per-service stacks) and Terraform (Azure/GCP).
- **Decoupled Workflows**: Each repository manages its own build and CI/CD pipeline.
- **CI/CD Pipelines**: Git-based workflows with GitHub Actions for build/test/deploy automation. AWS uses a multi-stage CodePipeline (Build -> Beta -> PreProd -> Manual Approval -> Prod) to deploy infrastructure as code.

---

## 9. Summary of Engineering Maturity

| Layer | Status |
|---|---|
| Identity/Auth (Cognito, JWT, OTP) | Functional; hardening recommended (JWT audience checks, OTP rate-limiting) |
| Chat (E2EE, AppSync/GraphQL) | IDOR vulnerabilities found and fixed; contract tests keep schema layers in sync |
| Matching (Gale-Shapley engine) | Production-grade design with feature-based scoring; needs operational tuning store |
| Infra (CDK, Fargate/NLB, EventBridge) | Solid IaC foundation; network isolation and DLQ/retry configs need finishing touches |