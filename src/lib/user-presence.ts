/**
 * User-presence gate for actions that hand out key material.
 *
 * Approving a history transfer copies the account's history key to another device, so it must never
 * be a single tap that someone holding an unlocked, already-signed-in phone can perform unnoticed.
 * This module asks the platform authenticator (Face ID, Touch ID, Windows Hello, Android biometrics)
 * to confirm the human is present.
 *
 * How it degrades, deliberately:
 *  - A credential already enrolled for this origin  -> WebAuthn `get()`, i.e. a biometric prompt.
 *  - A platform authenticator but nothing enrolled  -> WebAuthn `create()` with
 *    `userVerification: 'required'`. Creating the credential itself requires the biometric, so the
 *    first approval is gated exactly like later ones AND leaves an enrolled credential behind, which
 *    makes every subsequent transfer a plain verification.
 *  - No platform authenticator (most desktop browsers, older devices) -> `unsupported`. The caller
 *    must then fall back to an explicit confirmation, which is what the recovery UI does: the user has
 *    to compare a 6-digit code across the two screens and press a confirm button. Weaker than a
 *    biometric, but it is a conscious, informed act rather than a silent one.
 *
 * The credential is used ONLY as a presence signal. Nothing here derives, wraps or protects key
 * material with it — the transfer's security comes from the ECDH binding in key-recovery.ts.
 */

export type UserPresenceResult =
  /** The platform authenticator confirmed the user. */
  | 'verified'
  /** The user dismissed or failed the prompt — treat as refusal. */
  | 'declined'
  /** No platform authenticator available; the caller must gate on an explicit confirmation. */
  | 'unsupported';

const CREDENTIAL_STORAGE_PREFIX = 'onehook-presence-credential:';
const PRESENCE_TIMEOUT_MS = 60_000;

function storageKey(userId: string): string {
  return `${CREDENTIAL_STORAGE_PREFIX}${userId}`;
}

function readStoredCredentialId(userId: string): Uint8Array | null {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (!stored) return null;
    const binary = atob(stored);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function storeCredentialId(userId: string, rawId: ArrayBuffer): void {
  try {
    let binary = '';
    for (const byte of new Uint8Array(rawId)) binary += String.fromCharCode(byte);
    localStorage.setItem(storageKey(userId), btoa(binary));
  } catch {
    // A failed write only costs a re-enrolment next time; never block the transfer for it.
  }
}

/** True when this device can prompt for a biometric / device unlock. */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Asks the user to prove they are present.
 *
 * @param userId the signed-in user's id — scopes the enrolled credential so a shared browser profile
 *        does not let one account's credential satisfy another's prompt.
 * @param displayName shown by the authenticator during first-time enrolment.
 */
export async function requireUserPresence(
  userId: string,
  displayName: string
): Promise<UserPresenceResult> {
  if (!(await hasPlatformAuthenticator())) return 'unsupported';

  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const existingId = readStoredCredentialId(userId);

  try {
    if (existingId) {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: PRESENCE_TIMEOUT_MS,
          userVerification: 'required',
          allowCredentials: [{ id: existingId, type: 'public-key' }],
        },
      });
      return assertion ? 'verified' : 'declined';
    }

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'OneHook', id: window.location.hostname },
        user: {
          // Not a secret and never sent anywhere: WebAuthn requires a user handle, and scoping it to
          // the account id is what keeps one profile's credential from answering another's prompt.
          id: new TextEncoder().encode(userId),
          name: displayName || userId,
          displayName: displayName || 'OneHook member',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: PRESENCE_TIMEOUT_MS,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return 'declined';
    storeCredentialId(userId, credential.rawId);
    return 'verified';
  } catch (error) {
    // NotAllowedError covers both an explicit dismissal and a timeout; both mean "not confirmed".
    if (error instanceof Error && error.name === 'NotAllowedError') return 'declined';
    // Anything else (unsupported option, insecure context, authenticator failure) falls back to the
    // explicit-confirmation path rather than blocking recovery outright.
    console.warn('[presence] platform authenticator unavailable:', error);
    return 'unsupported';
  }
}
