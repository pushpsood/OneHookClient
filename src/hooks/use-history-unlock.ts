import { useEffect, useRef, useState } from 'react';
import { ChatEncryptionManager } from '../lib/chat-encryption';
import { derivePasskeySecret, isPrfSupported } from '../lib/passkey-prf';

/**
 * Runs the history-key unlock ladder once per signed-in session.
 *
 * This is what actually CONSUMES the wraps. Without it the epoch and wrap machinery only ever writes:
 * a new device would sit "future-only" and the UI would fall straight through to the QR fallback, even
 * though a device wrap or a passkey could have opened the key with no other device involved.
 *
 * Order and the reason for it:
 *  1. a DEVICE wrap sealed to this device — silent, no prompts, so it is tried first;
 *  2. PRF, which needs a biometric prompt, so it is only attempted when the account actually has a PRF
 *     wrap this device could open AND the platform supports it.
 *
 * Deliberately does NOT prompt on load when there is nothing to gain. A biometric dialog appearing
 * unbidden at sign-in would be both alarming and usually pointless, so `promptForPasskey` is opt-in and
 * the silent rungs run on their own.
 *
 * QR transfer and reset stay in the UI above this: both need explicit user involvement.
 */
export type UnlockOutcome = 'idle' | 'unlocking' | 'already-held' | 'device-wrap' | 'prf' | 'unavailable';

export function useHistoryUnlock(userId: string | undefined, promptForPasskey = false) {
  const [outcome, setOutcome] = useState<UnlockOutcome>('idle');
  /** Guards against a second attempt when a parent re-renders; unlocking twice is wasted work. */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const attemptKey = `${userId}:${promptForPasskey}`;
    if (attempted.current === attemptKey) return;
    attempted.current = attemptKey;

    let active = true;
    void (async () => {
      setOutcome('unlocking');
      try {
        const manager = new ChatEncryptionManager(userId);
        // Registration must precede an unlock attempt: the device wrap is addressed to this device's
        // id, so a device the backend has never seen has nothing to find.
        await manager.initialize();

        const usePrf = promptForPasskey && (await isPrfSupported());
        const result = await manager.unlockHistoryKey(
          usePrf ? (credentialId) => derivePasskeySecret(credentialId) : undefined
        );
        if (active) setOutcome(result);
      } catch {
        // Never surface this as an error: failing to unlock is an ordinary state for a device that has
        // not been granted access yet, and the recovery UI already explains the options.
        if (active) setOutcome('unavailable');
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, promptForPasskey]);

  return {
    outcome,
    /** True once history is readable on this device, however it was obtained. */
    unlocked: outcome === 'already-held' || outcome === 'device-wrap' || outcome === 'prf',
    /** True when the silent rungs found nothing, so the UI should offer PRF, QR or reset. */
    needsUserAction: outcome === 'unavailable',
  };
}
