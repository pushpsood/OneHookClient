/**
 * Google Identity Services (Sign in with Google) integration.
 *
 * Returns a Google **ID token** (a signed JWT), which is what the backend needs: the Cognito
 * custom-auth trigger verifies its signature and issuer, pins its `aud` to the same web client ID
 * configured here, and matches its `sub` against the account's `custom:google_id`.
 *
 * Deliberately NOT the OAuth token client (`google.accounts.oauth2`): that yields an access token,
 * which carries no verifiable identity claims.
 *
 * The Cognito Hosted UI is not used, so no user-pool domain or Google IdP federation is involved.
 */

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GSI_SCRIPT_ID = 'google-identity-services';

interface GsiCredentialResponse {
  credential?: string;
}

interface GsiPromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

interface GsiIdApi {
  initialize: (options: {
    client_id: string;
    callback: (response: GsiCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (listener?: (notification: GsiPromptNotification) => void) => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiIdApi } };
  }
}

let scriptPromise: Promise<GsiIdApi> | null = null;

function loadGoogleIdentityServices(): Promise<GsiIdApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in a browser.'));
  }

  const existing = window.google?.accounts?.id;
  if (existing) return Promise.resolve(existing);

  if (!scriptPromise) {
    scriptPromise = new Promise<GsiIdApi>((resolve, reject) => {
      const settle = () => {
        const api = window.google?.accounts?.id;
        if (api) resolve(api);
        else reject(new Error('Google sign-in failed to initialise.'));
      };

      const alreadyAdded = document.getElementById(GSI_SCRIPT_ID) as HTMLScriptElement | null;
      if (alreadyAdded) {
        alreadyAdded.addEventListener('load', settle, { once: true });
        alreadyAdded.addEventListener(
          'error',
          () => reject(new Error('Could not reach Google sign-in.')),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.id = GSI_SCRIPT_ID;
      script.src = GSI_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = settle;
      script.onerror = () => reject(new Error('Could not reach Google sign-in.'));
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = null;
      throw error;
    });
  }

  return scriptPromise;
}

/**
 * Prompts for Google sign-in and resolves with the returned ID token.
 *
 * Rejects with an actionable message when the prompt cannot be shown or the member dismisses it —
 * it never resolves without a real credential.
 */
export async function requestGoogleIdToken(clientId: string): Promise<string> {
  if (!clientId) {
    throw new Error('Google sign-in is not configured.');
  }

  const googleId = await loadGoogleIdentityServices();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };

    googleId.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      callback: (response) => {
        const credential = response?.credential;
        if (credential) finish(() => resolve(credential));
        else finish(() => reject(new Error('Google did not return an identity token.')));
      },
    });

    googleId.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        finish(() =>
          reject(
            new Error(
              `Google sign-in could not be shown (${notification.getNotDisplayedReason()}). Check that third-party sign-in is not blocked, then try again.`
            )
          )
        );
        return;
      }
      if (notification.isSkippedMoment() || notification.isDismissedMoment()) {
        // A credential callback may still arrive after a skipped moment, so only reject on an
        // explicit cancellation.
        const reason = notification.isDismissedMoment()
          ? notification.getDismissedReason()
          : notification.getSkippedReason();
        if (reason !== 'credential_returned') {
          finish(() => reject(new Error('Google sign-in was cancelled.')));
        }
      }
    });
  });
}
