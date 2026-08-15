# Login Page Setup Guide

## Overview

The login page has been successfully created with the following features:

- **Email/Password Login** via AWS Cognito
- **Invite Code Redemption** for new users
- **Protected Routes** for authenticated users
- **Token Management** with localStorage
- **Error Handling** with user-friendly messages

## Files Created

### 1. **`client/src/components/auth/Login.tsx`**

Main login page component with:

- Email and password input fields
- Error display
- Loading states
- Link to invite redemption page

### 2. **`client/src/components/auth/RedeemInvite.tsx`**

Multi-step invite redemption with:

- Invite code verification
- User registration with password confirmation
- Password strength validation (min 12 characters)

### 3. **`client/src/lib/cognito-auth.ts`**

Cognito authentication service with:

- User login via Cognito API
- Token storage and retrieval
- Token refresh logic
- JWT decoding and validation
- Logout functionality

### 4. **Updated Files**

#### `client/src/utils/env.config.ts`

Added Cognito configuration variables:

- `VITE_COGNITO_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`

#### `client/src/App.tsx`

- Added React Router with protected routes
- Routing setup for `/login`, `/redeem`, and `/`
- Cognito initialization on app startup

## Cognito Runtime Configuration

The current Gamma Cognito identifiers are public browser configuration and are checked into
`src/config/deployment.config.ts`:

```text
Region: ap-south-1
User Pool: ap-south-1_pN10ldNoo
App client: 2rt0v69jq2acjaboom84cinign
Identity Pool: ap-south-1:8bfabd43-a446-4b8d-9201-b250cf3b62ef
```

No `.env` or GitHub variable is required. `src/utils/env.config.ts` derives the Cognito IDP endpoint
from the region. Local developers may copy `.env.example` to ignored `.env` for temporary overrides.

There is currently no Cognito Hosted UI domain. Amplify therefore omits OAuth unless a domain,
sign-in redirect and sign-out redirect are all supplied; direct Cognito password, OTP and WebAuthn
flows remain available. When backend deployment outputs change, update the matching
source-controlled stage entry and rebuild the frontend:

```bash
npm run build:prod
```

## User Flow

### 1. First-Time Users (with Invite Code)

```
Login Page → Click "Redeem Invite Code" → Enter Code → Create Account → Login
```

### 2. Returning Users

```
Login Page → Enter Email & Password → Navigate to App
```

### 3. Logout

```
App → Click Logout Button → Redirected to Login Page
```

## Token Management

Tokens are stored in `localStorage`:

- `id_token` - JWT ID token (used for actions)
- `accessToken` - Access token
- `refresh_token` - Refresh token (for getting new tokens)
- `token_expires_at` - Token expiration timestamp

### Token Refresh Flow

1. If token is expired → Use refresh token to get a new one
2. If refresh fails → Redirect to login page
3. Clear all tokens on logout

## Security Features

✅ **Password Requirements**:

- Minimum 12 characters
- Symbols required (configured in Cognito)

✅ **Token Expiration**:

- Automatic token refresh using refresh tokens
- Graceful redirect to login on auth failure

✅ **Error Handling**:

- User-friendly error messages
- No sensitive data in error logs

✅ **CORS Configuration**:

- Cognito credentials sent securely via headers
- No tokens in URL parameters

## Testing the Login Page

Development mode uses the real checked-in Gamma configuration; there is no mock API runtime path:

```bash
npm run dev
```

Navigate to `http://localhost:3000/login`. To test password login, create an authorized test user in
the Gamma Cognito pool (using backend-account credentials):

```bash
aws cognito-idp admin-create-user \
  --region ap-south-1 \
  --user-pool-id ap-south-1_pN10ldNoo \
  --username test@example.com \
  --message-action SUPPRESS \
  --temporary-password 'TempPassword123!'

aws cognito-idp admin-set-user-password \
  --region ap-south-1 \
  --user-pool-id ap-south-1_pN10ldNoo \
  --username test@example.com \
  --password 'Password123456!' \
  --permanent
```

Use synthetic test identities only; never put production PII in setup documentation or fixtures.

## Next Steps

1. **Add Social Login** (Google, Apple)
   - See `SOCIAL_LOGIN.md`

2. **Add Forgot Password**
   - Create `/forgot-password` route
   - Implement Cognito forgot password flow

3. **Add MFA/2FA**
   - Enable MFA in Cognito User Pool
   - Update login flow to handle MFA challenges

4. **Add Email Verification**
   - Configure Cognito to require email verification
   - Add verification UI

## Troubleshooting

### "Cannot find module 'cognito-auth'"

- Ensure `client/src/lib/cognito-auth.ts` exists
- Check file paths are correct

### Redirect to login in infinite loop

- Check `isAuthenticated` state in store
- Verify tokens are stored properly in localStorage

### "Authentication failed" message

- Verify Cognito User Pool ID and Client ID
- Check user exists in Cognito User Pool
- Ensure password policy matches requirements

### CORS errors

- Check Cognito domain configuration
- Verify API Gateway CORS settings
- Check that Cognito endpoint is accessible

## See Also

- `ARCHITECTURE.md` - System architecture
- `DEPLOYMENT.md` - Deployment guide
- `packages/identity/README.md` - Identity service API
