/**
 * Account recovery on web: a passkey that can unlock the member's message history on a new device.
 *
 * Web has no platform escrow, so recovery means a PRF wrap of the history key (chat-encryption.ts
 * `addPasskeyUnlock`). Setting it up is the same sequence account settings uses to add a passkey
 * (AccountSettingsCard: Cognito `registerWebAuthn`, then `addPasskeyUnlock`), preceded by registering
 * this device for encrypted chat so it holds the history key it is about to wrap. Recovery is optional:
 * nothing here blocks sign-in, chat or device registration.
 */
import { ChatEncryptionManager } from './chat-encryption';
import { getCognitoAuth } from './cognito-auth';

export type RecoveryStatus = 'on' | 'not-set-up';

/** Recovery is on once the active epoch has a wrap that does not depend on one device (PRF or escrow). */
export function recoveryStatusFrom(methods: { prf: number; escrow: number }): RecoveryStatus {
  return methods.prf + methods.escrow > 0 ? 'on' : 'not-set-up';
}

export type RecoverySetupResult =
  | { kind: 'protected' }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export const RECOVERY_COPY = {
  unsupported:
    'This browser can’t use a passkey to protect your messages. You can set this up later on another device from Profile > Account recovery.',
  cancelled: 'Recovery wasn’t set up. You can try again, or skip for now.',
  failed: 'We couldn’t set up recovery. Please try again.',
} as const;

/** The calls the setup makes, injectable for tests. */
export interface RecoverySetupDeps {
  /** Registers this device for encrypted chat and creates the history key if the account has none. */
  initialize(): Promise<void>;
  unlockMethods(): Promise<{ prf: number; escrow: number; prfSupportedHere: boolean }>;
  /** Creates a passkey (Cognito WebAuthn registration). Throws when the member cancels. */
  registerPasskey(): Promise<void>;
  /** Seals the history key to a passkey's PRF output; null when the passkey can't do PRF or was cancelled. */
  addPasskeyUnlock(): Promise<string | null>;
}

export function recoveryDepsFor(userId: string): RecoverySetupDeps {
  const manager = new ChatEncryptionManager(userId);
  return {
    initialize: () => manager.initialize(),
    unlockMethods: () => manager.historyUnlockMethods(),
    registerPasskey: () => getCognitoAuth().registerWebAuthn(),
    addPasskeyUnlock: () => manager.addPasskeyUnlock(),
  };
}

/** True for a WebAuthn / provider sheet the member closed rather than a failure. */
export function isCancelError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  return /cancel|NotAllowedError|AbortError/i.test(`${String(name ?? '')} ${String(message ?? '')}`);
}

/** The member's recovery status, or null when it can't be read (shown as no subtitle). */
export async function readRecoveryStatus(userId: string): Promise<RecoveryStatus | null> {
  try {
    return recoveryStatusFrom(await new ChatEncryptionManager(userId).historyUnlockMethods());
  } catch {
    return null;
  }
}

/**
 * Sets up account recovery from a user gesture. Idempotent: an account that already has a passkey or
 * escrow wrap reports `protected` without prompting.
 */
export async function setUpAccountRecovery(deps: RecoverySetupDeps): Promise<RecoverySetupResult> {
  try {
    await deps.initialize();
    const methods = await deps.unlockMethods();
    if (recoveryStatusFrom(methods) === 'on') return { kind: 'protected' };
    if (!methods.prfSupportedHere) return { kind: 'unsupported' };
  } catch {
    return { kind: 'error', message: RECOVERY_COPY.failed };
  }

  try {
    await deps.registerPasskey();
  } catch (err) {
    if (isCancelError(err)) return { kind: 'cancelled' };
    return { kind: 'error', message: err instanceof Error && err.message ? err.message : RECOVERY_COPY.failed };
  }

  try {
    return (await deps.addPasskeyUnlock()) ? { kind: 'protected' } : { kind: 'cancelled' };
  } catch {
    return { kind: 'error', message: RECOVERY_COPY.failed };
  }
}
