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


# Clean dependencies
npm install

# Start dev server (port 3000)
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

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

## Deployment

```bash
# Deploy to dev
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

## Infrastructure

The frontend is deployed as a static site via:
- **S3** — Hosts the built assets
- **CloudFront** — CDN with HTTPS, caching, and security headers
- **Route53** — DNS (optional, if domain configured)

Infrastructure is defined in `infra/stacks/frontend-stack.ts` using AWS CDK.

## Related Repositories

- **OneHookBackend** — Backend microservices (provides API + Cognito)
- **OneHookPlatform** — iOS and Android mobile applications
