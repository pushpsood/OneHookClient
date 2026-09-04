/**
 * Deriving encryption key material from a passkey, via the WebAuthn PRF extension.
 *
 * This is the unlock method that needs no other device: passkeys sync through iCloud Keychain and
 * Google Password Manager, so a brand-new device can authenticate with the same passkey, re-derive the
 * same 32 bytes, and open the history key on its own. Every other method needs a second device online
 * (device wrap, QR) or a native platform (escrow).
 *
 * Support is NOT universal and must never be assumed — verified as of 2026-08:
 *   - Android Chrome/Edge/Samsung: yes, Google Password Manager passkeys carry PRF by default
 *   - macOS 15+ Safari 18+/Chrome 132+/Firefox 139+: yes, via iCloud Keychain
 *   - iOS/iPadOS 18+: yes (18.0–18.3 had cross-device data-loss bugs, fixed in 18.4+)
 *   - Windows 11 25H2 + Feb 2026 update: yes (Firefox 148+, Chrome/Edge 147+)
 *   - Windows 10, Firefox on Android, Chrome profile authenticators: NO
 *
 * So callers must treat PRF as an enhancement and keep the QR and reset paths available. Two further
 * constraints worth knowing:
 *
 *  - The output is bound to the RP ID (the origin's domain). `localhost` therefore derives a DIFFERENT
 *    key from production, and a native app must share the web domain via Associated Domains / Digital
 *    Asset Links or it derives a third one.
 *  - A deleted passkey takes its wrap with it, permanently. That is why redundant passkeys matter and
 *    why reset exists as the floor.
 *
 * iCloud Keychain and Google Password Manager expose PRF unconditionally, so EXISTING passkeys work —
 * no re-registration needed.
 */

/** Fixed salt. Same passkey plus same salt yields the same bytes, which is what makes unlock work. */
const PRF_SALT_LABEL = 'onehook-history-key-v1';

/** WebAuthn PRF results, absent when the authenticator did not evaluate the extension. */
interface PrfExtensionResults {
  prf?: { results?: { first?: ArrayBuffer | Uint8Array } };
}

function saltBytes(): Uint8Array {
  return new TextEncoder().encode(PRF_SALT_LABEL);
}

function toBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/**
 * True when this browser advertises the PRF extension.
 *
 * Uses `getClientCapabilities()` where available, which reports the actual client rather than being
 * inferred from a user-agent string. A `false` is authoritative enough to skip PRF and offer the other
 * paths; a `true` still does not guarantee the specific authenticator will evaluate it, so callers must
 * handle an absent result.
 */
export async function isPrfSupported(): Promise<boolean> {
  const pk = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential as
    | { getClientCapabilities?: () => Promise<Record<string, boolean>> }
    | undefined;
  if (!pk) return false;
  if (typeof pk.getClientCapabilities !== 'function') {
    // Older browsers cannot be asked. Report unsupported rather than optimistically prompting for a
    // biometric that will not produce usable material.
    return false;
  }
  try {
    const capabilities = await pk.getClientCapabilities();
    return capabilities?.['extension:prf'] === true;
  } catch {
    return false;
  }
}

/** base64url, the encoding WebAuthn uses for credential ids. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Reads PRF output off an assertion, or null when the authenticator did not evaluate it. */
function readPrfSecret(assertion: PublicKeyCredential): Uint8Array | null {
  const results = assertion.getClientExtensionResults() as PrfExtensionResults | undefined;
  const first = results?.prf?.results?.first;
  if (!first) return null;
  const bytes = toBytes(first);
  // Anything shorter is not usable key material; refuse rather than deriving a weak wrap key.
  return bytes.length >= 32 ? bytes : null;
}

/**
 * Authenticates with a specific passkey and returns its PRF output.
 *
 * @param credentialId base64url credential id, i.e. the `wrapId` of the PRF wrap being opened
 * @returns the bytes, or null when the authenticator did not evaluate PRF, the user cancelled, or no
 *          matching credential exists. All are ordinary outcomes: the caller falls through to the next
 *          rung of the unlock ladder rather than treating it as an error.
 */
export async function derivePasskeySecret(credentialId: string): Promise<Uint8Array | null> {
  if (typeof navigator === 'undefined' || !navigator.credentials?.get) return null;

  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge as unknown as ArrayBuffer,
        allowCredentials: [
          { id: fromBase64Url(credentialId) as unknown as ArrayBuffer, type: 'public-key' },
        ],
        userVerification: 'required',
        extensions: { prf: { eval: { first: saltBytes() as unknown as ArrayBuffer } } },
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    return assertion ? readPrfSecret(assertion) : null;
  } catch {
    return null;
  }
}

/**
 * Lets the user pick any passkey for this origin and returns both its PRF output and its credential id.
 *
 * Used when CREATING a wrap, where the id is not known in advance — it becomes the wrap's `wrapId` so a
 * later unlock can target the same passkey.
 */
export async function derivePasskeySecretWithId(): Promise<{
  credentialId: string;
  secret: Uint8Array;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.credentials?.get) return null;

  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge as unknown as ArrayBuffer,
        userVerification: 'required',
        extensions: { prf: { eval: { first: saltBytes() as unknown as ArrayBuffer } } },
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    if (!assertion) return null;

    const secret = readPrfSecret(assertion);
    if (!secret) return null;

    return { credentialId: toBase64Url(new Uint8Array(assertion.rawId)), secret };
  } catch {
    return null;
  }
}
