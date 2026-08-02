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
