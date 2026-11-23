# OneHook Documentation

OneHook is an intentional dating platform designed for meaningful connections, one at a time.

The current, maintained reference for this web client is the repository [README](../README.md)
(configuration, routes, auth, E2EE, Mr OneHook, telemetry, deployment and infrastructure).

## 📚 Documents

These notes cover single topics in more depth than the README and were checked against `src/`.
The README stays the reference for configuration, auth, E2EE, Mr OneHook, telemetry and deployment.

- [FRONTEND_PRODUCTION.md](./FRONTEND_PRODUCTION.md): Frontend architecture: source layout, backend integration (SDK, `fetch` helpers, GraphQL, view passes), state, hooks, error handling, build and deployment.
- [LOGIN_SETUP.md](./LOGIN_SETUP.md): Sign-in methods (one-time code, password, Google, Apple), sessions and tokens, sign-out, and why invite redemption on the web shows an "install the app" notice.
- [ONBOARDING_SKIP_LOGOUT.md](./ONBOARDING_SKIP_LOGOUT.md): The onboarding "Skip for now" action, which signs the user out (including E2EE key hygiene) and reopens onboarding on the next sign-in.
- [LANDING_PAGE.md](./LANDING_PAGE.md): The landing page sections, copy sources, assets, animations, the mascot and the public Mr OneHook widget.
- [LEGAL_PAGES.md](./LEGAL_PAGES.md): What the Privacy Policy, Terms and Contact pages contain, and where their text disagrees with the implementation.
- [CRUX.md](../CRUX.md): Product and technical overview across all OneHook repositories; also the product context uploaded for Mr OneHook.

## 🛠 Related Resources

- **App routes**: `../src/App.tsx` (member app shell: `../src/app/AppContent.tsx`)
- **Global Store**: `../src/store/app-store.ts`
- **API Client**: `../src/api/sdk-client.ts` (generated `onehook-api-client` REST SDK) and `../src/api/external-sdk-clients.ts` (`onehook-mr-onehook-client` and `saha-equation-admin-portal-client` SDKs; service wrappers in `../src/api/`). `../src/lib/api-client.ts` holds the shared `ApiError` type.
- **Runtime Config**: `../src/config/deployment.config.ts` and `../src/utils/env.config.ts`
- **Auth**: `../src/lib/cognito-auth.ts`
- **E2EE**: `../src/lib/chat-encryption.ts`
- **Build Config**: `../vite.config.ts`
