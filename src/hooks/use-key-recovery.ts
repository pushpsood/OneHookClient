import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRecoveryApi, type KeyRecoverySession } from '../api/key-recovery';
import { ChatEncryptionManager, type DeviceSummary } from '../lib/chat-encryption';
import {
  deriveVerificationCode,
  fingerprintPublicKey,
  generateChallenge,
  generateEphemeralKeyPair,
  openRecoveryBundle,
  sealRecoveryBundle,
  type RecoverySessionBinding,
} from '../lib/key-recovery';
import { requireUserPresence, type UserPresenceResult } from '../lib/user-presence';
import {
  recoveryCandidates,
  selectIncomingRequest,
  targetPhaseFor,
} from '../lib/key-recovery-session';

/**
 * The two halves of history-key recovery, as React state machines.
 *
 * `useHistoryRecovery` runs on the NEW device (the one that cannot read history) and `useRecoveryResponder`
 * runs on every OTHER signed-in device, waiting to be picked. See lib/key-recovery.ts for the protocol
 * and the threat model; this file is only orchestration.
 */

/** How long the new device waits before suggesting the other device may be offline. */
export const WAITING_HINT_MS = 15_000;

/** Backstop poll interval. Subscriptions carry the happy path; polling covers a silently dropped socket. */
const POLL_INTERVAL_MS = 3_000;

export type RecoveryPhase =
  /** Nothing started. */
  | 'idle'
  /** Showing the user their other devices to choose from. */
  | 'choosing'
  /** Session being opened. */
  | 'requesting'
  /** Waiting for the chosen device to confirm and show its QR code. */
  | 'waiting'
  /** The other device is displaying the code; the camera is open here. */
  | 'scanning'
  /** A code was read; verifying and importing. */
  | 'importing'
  /** History unlocked. */
  | 'done'
  /** Nothing to do — this device already holds the history key. */
  | 'not-needed'
  | 'error';

export interface HistoryRecoveryState {
  phase: RecoveryPhase;
  /** The caller's other registered devices, newest activity first. */
  candidates: DeviceSummary[];
  selectedDeviceId?: string;
  /** 6-digit code the user compares against the one on the other device. */
  verificationCode?: string;
  /** Epoch ms after which the session dies; drives the countdown. */
  expiresAt?: number;
  /** True once the wait has run long enough to suspect the other device is offline. */
  showOfflineHint: boolean;
  error?: string;
  busy: boolean;
}

/**
 * NEW-device side: pick a device, wait for its QR, scan it, import the keys.
 *
 * The ephemeral private key lives only in this hook's ref — never in IndexedDB, never in the store —
 * so it dies with the tab. A QR photographed by someone else is therefore useless to them, which is
 * what makes an optical transfer safe despite being visible in the room.
 */
export function useHistoryRecovery(userId: string | undefined, matchRefetch?: () => void) {
  const manager = useMemo(() => (userId ? new ChatEncryptionManager(userId) : null), [userId]);

  const [phase, setPhase] = useState<RecoveryPhase>('idle');
  const [candidates, setCandidates] = useState<DeviceSummary[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [verificationCode, setVerificationCode] = useState<string | undefined>();
  const [expiresAt, setExpiresAt] = useState<number | undefined>();
  const [showOfflineHint, setShowOfflineHint] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const ephemeral = useRef<{ privateKey: CryptoKey; publicKeySpki: string } | null>(null);
  const session = useRef<KeyRecoverySession | null>(null);
  const binding = useRef<RecoverySessionBinding | null>(null);
  const sourcePublicKey = useRef<string | null>(null);
  /** This device's long-term registered private key; the sender bound the transfer to it. */
  const deviceKey = useRef<CryptoKey | null>(null);

  const reset = useCallback(() => {
    ephemeral.current = null;
    session.current = null;
    binding.current = null;
    sourcePublicKey.current = null;
    deviceKey.current = null;
    setPhase('idle');
    setSelectedDeviceId(undefined);
    setVerificationCode(undefined);
    setExpiresAt(undefined);
    setShowOfflineHint(false);
    setError(undefined);
    setBusy(false);
  }, []);

  /** Opens the picker, listing the caller's other devices. */
  const start = useCallback(async () => {
    if (!manager) return;
    setBusy(true);
    setError(undefined);
    try {
      if (await manager.holdsHistoryKey()) {
        // Nothing to recover: this device can already read history. Surfacing this explicitly avoids
        // sending the user through a transfer that would change nothing.
        setPhase('not-needed');
        return;
      }
      const overview = await manager.getDeviceOverview();
      setCandidates(recoveryCandidates(overview.devices));
      setPhase('choosing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your other devices.');
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, [manager]);

  /** Opens a session against the chosen device and starts waiting for its QR code. */
  const chooseDevice = useCallback(
    async (deviceId: string) => {
      if (!manager) return;
      setBusy(true);
      setError(undefined);
      setShowOfflineHint(false);
      try {
        const identity = await manager.recoveryIdentity();
        const sourceKey = await manager.lookupOwnDevicePublicKey(deviceId);
        const pair = await generateEphemeralKeyPair();
        const challenge = generateChallenge();

        setPhase('requesting');
        const opened = await KeyRecoveryApi.request({
          sourceDeviceId: deviceId,
          targetDeviceId: identity.deviceId,
          targetEphemeralPublicKey: pair.publicKeySpki,
          challenge,
        });

        // Defence in depth: use only LOCAL values for anything the backend merely echoes. If the
        // echoed challenge differs from the one this device minted, the request was rewritten in
        // transit and there is no reason to continue.
        if (opened.challenge !== challenge) {
          throw new Error('The request was altered in transit. Please try again.');
        }

        const sessionBinding: RecoverySessionBinding = {
          sessionId: opened.sessionId,
          challenge,
          expiresAt: opened.expiresAt,
          sourceFingerprint: await fingerprintPublicKey(sourceKey),
          targetFingerprint: identity.fingerprint,
        };

        ephemeral.current = pair;
        session.current = opened;
        binding.current = sessionBinding;
        sourcePublicKey.current = sourceKey;
        deviceKey.current = identity.devicePrivateKey;

        setSelectedDeviceId(deviceId);
        setExpiresAt(opened.expiresAt);
        setVerificationCode(await deriveVerificationCode(sessionBinding, pair.publicKeySpki));
        setPhase(opened.status === 'DISPLAYING' ? 'scanning' : 'waiting');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reach your other device.');
        setPhase('error');
      } finally {
        setBusy(false);
      }
    },
    [manager]
  );

  // Learn the moment the other device puts the code on screen. The subscription is the fast path;
  // the poll below covers a socket that dropped without telling us.
  useEffect(() => {
    if (!userId || !session.current) return;
    if (phase !== 'waiting' && phase !== 'scanning') return;
    const targetDeviceId = session.current.targetDeviceId;

    const apply = (incoming: KeyRecoverySession) => {
      if (incoming.sessionId !== session.current?.sessionId) return;
      const signal = targetPhaseFor(incoming.status);
      if (signal === 'scan') setPhase('scanning');
      if (signal === 'declined') {
        setError('The transfer was declined on your other device.');
        setPhase('error');
      }
    };

    const unsubscribe = KeyRecoveryApi.subscribeToUpdates(userId, targetDeviceId, apply);
    const poll = setInterval(() => {
      const current = session.current;
      if (!current) return;
      void KeyRecoveryApi.getSession(current.sourceDeviceId, current.targetDeviceId)
        .then((latest) => {
          if (!latest) {
            setError('The request expired before your other device answered.');
            setPhase('error');
            return;
          }
          apply(latest);
        })
        .catch(() => {
          /* transient: the subscription or the next poll will catch up */
        });
    }, POLL_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [userId, phase]);

  // Edge case the user asked for explicitly: the old device is offline (SIM moved, Wi-Fi off), so the
  // request never arrives and this screen would otherwise wait forever with no explanation.
  useEffect(() => {
    if (phase !== 'waiting') {
      setShowOfflineHint(false);
      return;
    }
    const timer = setTimeout(() => setShowOfflineHint(true), WAITING_HINT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  /** Handles a decoded QR string: verify, import, then tell the other device to put the code away. */
  const submitScan = useCallback(
    async (scanned: string) => {
      if (!manager || !ephemeral.current || !binding.current || !sourcePublicKey.current) return;
      if (!deviceKey.current) return;
      const current = session.current;
      if (!current) return;

      setPhase('importing');
      setBusy(true);
      try {
        const bundle = await openRecoveryBundle({
          scanned,
          binding: binding.current,
          targetEphemeralPrivateKey: ephemeral.current.privateKey,
          targetDevicePrivateKey: deviceKey.current,
          sourceDevicePublicKeySpki: sourcePublicKey.current,
        });
        await manager.importRecoveryBundle(bundle);

        // Best effort: the keys are already in place, so a failed status update must not present the
        // transfer as failed. It only means the other device keeps its QR up until expiry.
        await KeyRecoveryApi.update({
          sourceDeviceId: current.sourceDeviceId,
          targetDeviceId: current.targetDeviceId,
          sessionId: current.sessionId,
          status: 'COMPLETED',
        }).catch(() => undefined);

        ephemeral.current = null;
        setPhase('done');
        matchRefetch?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That code could not be verified.');
        setPhase('scanning');
      } finally {
        setBusy(false);
      }
    },
    [manager, matchRefetch]
  );

  /** Abandons the session, telling the other device to stop showing its code. */
  const cancel = useCallback(async () => {
    const current = session.current;
    if (current) {
      await KeyRecoveryApi.update({
        sourceDeviceId: current.sourceDeviceId,
        targetDeviceId: current.targetDeviceId,
        sessionId: current.sessionId,
        status: 'DECLINED',
      }).catch(() => undefined);
    }
    reset();
  }, [reset]);

  const state: HistoryRecoveryState = {
    phase,
    candidates,
    selectedDeviceId,
    verificationCode,
    expiresAt,
    showOfflineHint,
    error,
    busy,
  };

  return { ...state, start, chooseDevice, submitScan, cancel, reset };
}

export interface ResponderState {
  /** The live request aimed at this device, if any. */
  incoming?: KeyRecoverySession;
  /** 6-digit code to compare with the new device's screen. */
  verificationCode?: string;
  /** Base45 text to render as a QR code once approved. */
  qrPayload?: string;
  /** How the human confirmed (or could not be asked). */
  presence?: UserPresenceResult;
  error?: string;
  busy: boolean;
  /** True when this device cannot fulfil requests because it does not hold the history key. */
  cannotHelp: boolean;
}

/**
 * SOURCE-device side: listen for requests, confirm intent, show the QR.
 *
 * Mounted app-wide, so whichever screen the user is on can answer. It does nothing at all — no
 * subscription, no polling — on a device that does not hold the history key, since such a device has
 * nothing to hand over.
 */
export function useRecoveryResponder(userId: string | undefined) {
  const manager = useMemo(() => (userId ? new ChatEncryptionManager(userId) : null), [userId]);

  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [canHelp, setCanHelp] = useState<boolean | undefined>();
  const [incoming, setIncoming] = useState<KeyRecoverySession | undefined>();
  const [verificationCode, setVerificationCode] = useState<string | undefined>();
  const [qrPayload, setQrPayload] = useState<string | undefined>();
  const [presence, setPresence] = useState<UserPresenceResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // Resolve this device's identity once, and whether it has anything to offer.
  useEffect(() => {
    if (!manager) return;
    let active = true;
    void (async () => {
      try {
        const identity = await manager.recoveryIdentity();
        if (!active) return;
        setDeviceId(identity.deviceId);
        setCanHelp(identity.holdsHistoryKey);
      } catch {
        if (active) setCanHelp(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [manager]);

  const dismiss = useCallback(() => {
    setIncoming(undefined);
    setVerificationCode(undefined);
    setQrPayload(undefined);
    setPresence(undefined);
    setError(undefined);
    setBusy(false);
  }, []);

  const adopt = useCallback(
    async (session: KeyRecoverySession) => {
      if (!manager) return;
      if (session.expiresAt <= Date.now()) return;
      try {
        const identity = await manager.recoveryIdentity();
        const targetKey = await manager.lookupOwnDevicePublicKey(session.targetDeviceId);
        // Derived from the ephemeral key AS RECEIVED. If anything rewrote it in transit, this code
        // differs from the one on the new device's screen and the user stops before the QR appears.
        const code = await deriveVerificationCode(
          {
            sessionId: session.sessionId,
            challenge: session.challenge,
            expiresAt: session.expiresAt,
            sourceFingerprint: identity.fingerprint,
            targetFingerprint: await fingerprintPublicKey(targetKey),
          },
          session.targetEphemeralPublicKey
        );
        setIncoming(session);
        setVerificationCode(code);
        setQrPayload(undefined);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the recovery request.');
      }
    },
    [manager]
  );

  // Subscription for live requests + a cold-start read. The read matters: a subscription only
  // delivers while connected, so a device that was closed or reconnecting when the user tapped
  // "restore" would never hear about it and the other screen would wait forever.
  useEffect(() => {
    if (!userId || !deviceId || canHelp !== true) return;

    const refresh = () => {
      void KeyRecoveryApi.listRequests(deviceId)
        .then((sessions) => {
          const live = selectIncomingRequest(sessions, Date.now());
          if (live && live.sessionId !== incoming?.sessionId) {
            void adopt(live);
          }
        })
        .catch(() => {
          /* the subscription remains the primary path */
        });
    };

    refresh();
    const unsubscribe = KeyRecoveryApi.subscribeToRequests(userId, deviceId, (session) => {
      void adopt(session);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // `incoming` is read inside `refresh` but deliberately not a dependency: re-subscribing every
    // time a request arrives would tear down the socket mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, deviceId, canHelp, adopt]);

  /**
   * Confirms intent, seals the bundle and publishes DISPLAYING so the new device opens its camera.
   *
   * @param displayName shown by the platform authenticator during first-time enrolment.
   */
  const approve = useCallback(
    async (displayName: string) => {
      if (!manager || !incoming || !userId) return;
      setBusy(true);
      setError(undefined);
      try {
        const result = await requireUserPresence(userId, displayName);
        setPresence(result);
        if (result === 'declined') {
          setError('Confirmation failed, so nothing was shared.');
          return;
        }

        const identity = await manager.recoveryIdentity();
        const targetKey = await manager.lookupOwnDevicePublicKey(incoming.targetDeviceId);
        const bundle = await manager.exportRecoveryBundle();

        const payload = await sealRecoveryBundle({
          bundle,
          binding: {
            sessionId: incoming.sessionId,
            challenge: incoming.challenge,
            expiresAt: incoming.expiresAt,
            sourceFingerprint: identity.fingerprint,
            targetFingerprint: await fingerprintPublicKey(targetKey),
          },
          sourceDevicePrivateKey: identity.devicePrivateKey,
          targetEphemeralPublicKeySpki: incoming.targetEphemeralPublicKey,
          // Binding to the receiving device's REGISTERED key is what makes a swapped ephemeral key
          // fail outright instead of relying on the user spotting a mismatched code.
          targetDevicePublicKeySpki: targetKey,
        });

        await KeyRecoveryApi.update({
          sourceDeviceId: incoming.sourceDeviceId,
          targetDeviceId: incoming.targetDeviceId,
          sessionId: incoming.sessionId,
          status: 'DISPLAYING',
        });
        setQrPayload(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not prepare the transfer.');
      } finally {
        setBusy(false);
      }
    },
    [manager, incoming, userId]
  );

  /** Refuses the request and tells the other device immediately. */
  const decline = useCallback(async () => {
    if (!incoming) return dismiss();
    await KeyRecoveryApi.update({
      sourceDeviceId: incoming.sourceDeviceId,
      targetDeviceId: incoming.targetDeviceId,
      sessionId: incoming.sessionId,
      status: 'DECLINED',
    }).catch(() => undefined);
    dismiss();
  }, [incoming, dismiss]);

  // While the code is on screen, watch for the new device finishing (or the session dying) so the QR
  // comes down as soon as it is no longer needed rather than lingering until expiry.
  useEffect(() => {
    if (!qrPayload || !incoming) return;

    const finish = (message?: string) => {
      if (message) setError(message);
      setQrPayload(undefined);
      setIncoming(undefined);
      setVerificationCode(undefined);
    };

    const poll = setInterval(() => {
      if (incoming.expiresAt <= Date.now()) {
        finish('The code expired. Ask the new device to try again.');
        return;
      }
      void KeyRecoveryApi.getSession(incoming.sourceDeviceId, incoming.targetDeviceId)
        .then((latest) => {
          if (!latest) return finish();
          if (latest.status === 'COMPLETED' || latest.status === 'DECLINED') finish();
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(poll);
  }, [qrPayload, incoming]);

  const state: ResponderState = {
    incoming,
    verificationCode,
    qrPayload,
    presence,
    error,
    busy,
    cannotHelp: canHelp === false,
  };

  return { ...state, approve, decline, dismiss };
}
