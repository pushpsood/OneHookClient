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

## Environment Configuration

### Development values in `.env`:

```bash
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=us-east-1_local_dev
VITE_COGNITO_CLIENT_ID=local_client_id
```

### Staging values in `.env` (auto-detected by hostname or mode):

```bash
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=<YOUR_STAGING_USER_POOL_ID>
VITE_COGNITO_CLIENT_ID=<YOUR_STAGING_CLIENT_ID>
```

### Production values in `.env` (auto-detected by hostname or mode):

```bash
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=<YOUR_PROD_USER_POOL_ID>
VITE_COGNITO_CLIENT_ID=<YOUR_PROD_CLIENT_ID>
```

## How to Get Cognito Credentials

### Step 1: Get User Pool ID and Client ID

After deployment, run:

```bash
npx cdk deploy --all --context env=prod
```

The output will show:

```
OneHook-Shared-prod.UserPoolId = us-east-1_ABC123
OneHook-Shared-prod.UserPoolClientId = xyz789
```

### Step 2: Update Environment Variables

Add these values to your `.env` files:

```bash
VITE_COGNITO_USER_POOL_ID=us-east-1_ABC123
VITE_COGNITO_CLIENT_ID=xyz789
```

### Step 3: Rebuild Frontend

```bash
npm run build:client
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

### 1. With Mock API

Development mode will use mock data:

```bash
npm run dev
```

Navigate to: `http://localhost:3000/login`

### 2. Against Real Cognito

Create a test user in AWS Cognito console:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123 \
  --username test@example.com \
  --message-action SUPPRESS \
  --temporary-password TempPassword123!
```

Then set permanent password:

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_ABC123 \
  --username test@example.com \
  --password Password123456! \
  --permanent
```

Login with:

- Email: `test@example.com`
- Password: `Password123456!`

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
