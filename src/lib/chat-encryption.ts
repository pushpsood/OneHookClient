import {
  ChatApi,
  type AccountHistoryKey,
  type DeviceRecord,
  type DeviceRegistry,
  type HistoryState,
} from '../api/chat';
import {
  unwrapWithDeviceKey,
  unwrapWithSecret,
  wrapToDeviceKey,
  wrapToSecret,
} from './ahk-wrap';
import { derivePasskeySecretWithId, isPrfSupported } from './passkey-prf';
import {
  decryptV2,
  deviceTargetId,
  encryptV2,
  historyTargetId,
  isV2Envelope,
  parseV2Envelope,
  type WireRecipient,
  type WireTarget,
} from './chat-wire-v2';
import {
  assertBundleMatchesRegistry,
  derivePublicKeySpki,
  fingerprintPublicKey,
  type RecoveryBundle,
} from './key-recovery';

/**
 * End-to-end message encryption for a match conversation.
 *
 * There is exactly ONE wire format: version 2, the multi-device envelope in chat-wire-v2.ts. Wire v1
 * — a single long-lived ECDH identity key per user, distributed through an X3DH-style pre-key server —
 * has been removed entirely, along with the pre-key endpoints that served it. It bound a conversation
 * to the one device that generated the key, which is precisely the limitation v2 exists to fix, and
 * keeping a second format alive meant every send had to decide which one to use and every receive had
 * to accept either. A v1 envelope now fails with an explicit unsupported-version error rather than
 * being decrypted by a fallback path nobody exercises.
 *
 * How v2 works here:
 *  - Each device owns its own non-extractable P-256 ECDH "device key", registered with the server
 *    (`POST /chat/devices`) under a random `deviceId`. A message is encrypted once with a random
 *    AES-256 content key, and that content key is wrapped separately for every registered device of
 *    BOTH members plus each member's account-history key. Every device registered at send time can
 *    therefore read the message immediately, with no transfer and no network round-trip.
 *  - Messages sent BEFORE a device existed cannot be wrapped to it — nothing can retroactively add a
 *    wrap to stored ciphertext. Reading those requires the account-history private key, which is the
 *    only thing this module ever moves between devices. It is never derived from `userId`, the Cognito
 *    subject, tokens, or any other backend-known value.
 *  - The account-history key is versioned as an EPOCH, and an epoch carries several independently
 *    encrypted copies of its private half ("wraps"), each openable by one unlock method: platform
 *    escrow, a passkey via WebAuthn PRF, or a specific device's key. Registration claims nothing; an
 *    epoch is established through an endpoint that REQUIRES a wrap set in the same call, so an account
 *    can never hold a history key that nothing can unlock.
 *  - A device without a wrap is not in a dead end. `unlockHistoryKey` walks the ladder — a device wrap
 *    sealed to it, then PRF — and `resetHistoryKey` is the floor when every rung fails. QR transfer
 *    (see key-recovery.ts, `exportRecoveryBundle` / `importRecoveryBundle`) is the manual fallback, no
 *    longer the mechanism. Every path that obtains the key also PUBLISHES a wrap for the device that
 *    obtained it, so the holder set grows and the account becomes progressively harder to strand.
 *
 * Historical note, because it explains several names here: the key used to be claimed at registration
 * first-write-wins. That left one winner holding the only copy and every later device permanently
 * "future-only" — able to wrap new messages to history but never to read it — with the account
 * depending forever on that one device surviving. Both the claim and the `future-only` state are gone.
 *
 * Consequences of v1's removal that callers must respect:
 *  - Device registration is REQUIRED, not best-effort. With no fallback format, a device that failed
 *    to register cannot send or read anything, so `initialize` propagates registration failures
 *    instead of warning and continuing.
 *  - Sending to a peer with no usable v2 device now THROWS. Previously such a peer got a v1 message;
 *    silently producing something unreadable is worse than refusing.
 *  - Reading a peer's device registry (`ensureSession`) is what initializes the conversation
 *    server-side. Claiming a pre-key bundle used to write the ChatTable TAIL marker that authorizes
 *    `getMessages`/`sendMessage`; the registry read now does it, so its failure is fatal to the
 *    conversation rather than cosmetic.
 *
 * Key extractability — a deliberate tradeoff:
 *  - The DEVICE key is generated non-extractable. It is per-device and must never move, so there is
 *    no reason to allow export.
 *  - The ACCOUNT-HISTORY key is generated extractable, because recovery has to hand it to another
 *    device. This does not widen the practical blast radius of a script-injection bug: an attacker
 *    running code in this origin can already open every message by calling `decrypt` with a
 *    non-extractable key handle. Extractability changes the cost of exfiltrating the key itself, not
 *    the attacker's ability to read messages — and in exchange the account stops losing its entire
 *    history when one device is lost.
 *  - Identities created before recovery existed hold a NON-extractable history key. Those devices
 *    cannot transfer it (the account-history row is immutable server-side, so it cannot be rotated
 *    either); `exportRecoveryBundle` reports that explicitly rather than failing obscurely.
 *
 * Security properties:
 *  - The server stores only ciphertext and public keys; it never sees plaintext.
 *  - AES-GCM is authenticated and the message AAD binds ciphertext to its matchId, so ciphertext
 *    cannot be replayed into a different conversation.
 *  - There is NO forward secrecy: the account-history key is long-lived, which is the deliberate
 *    tradeoff that enables multi-device history recovery.
 *  - Peer keys come from the server, so a malicious server could substitute keys. Detecting that
 *    requires out-of-band verification (safety numbers), which this client does not yet offer.
 *    History recovery is the exception: it verifies the transferred private key against the
 *    registry's canonical public key and shows the user a 6-digit code to compare across devices.
 *
 * Every failure path throws. Nothing here degrades to plaintext, and no branch returns an
 * unencrypted message as if it had been protected.
 */

const DB_NAME = 'onehook-e2ee';
// v2 added the device identity + account-history fields to the identity record; v3 accompanied wire
// v1's removal, after which the record holds ONLY device and history material. The store keyPath is
// unchanged (`userId`), so an existing record is migrated in place on read: its device fields are
// kept and any leftover v1 identity keys are simply never read again.
const DB_VERSION = 3;
const STORE_NAME = 'identity-keys';
const MAX_ENVELOPE_VERSION = 2;
const PLATFORM = 'WEB';

/**
 * Whether this device can read message history.
 *
 * Deliberately BINARY. The old model had a third state, `future-only`, for a device that knew the
 * history public key but had lost the registration race and could therefore never read history without
 * a device-to-device transfer. That state no longer exists: a device either holds a wrap for the active
 * epoch or it does not yet, and if it does not, the unlock ladder (platform escrow, passkey PRF, a
 * device wrap, QR, reset) is how it gets one. Keeping a `future-only` label would tell users a
 * limitation is permanent when it is usually one biometric prompt away from being resolved.
 */
export type HistoryKeyStatus = 'holding' | 'not-yet';

interface StoredIdentity {
  userId: string;
  // This device's v2 identity. Non-extractable and never transferred.
  deviceId?: string;
  devicePrivateKey?: CryptoKey;
  devicePublicKey?: CryptoKey;
  // Account-history key. `historyPublicKey` is enough to wrap NEW messages to history, which every
  // registered device can do. `historyPrivateKey` is present only once this device has unlocked a wrap
  // for the active epoch, and is what lets it READ older messages.
  historyKeyId?: string;
  historyPrivateKey?: CryptoKey;
  historyPublicKey?: CryptoKey;
  /**
   * Epoch of the history key this device holds. An epoch is a distinct history key with its own set
   * of encrypted copies ("wraps"), so a stranded key can be replaced without stranding the account
   * forever — see OneHookBackend/docs/account-key-recovery.md.
   */
  historyEpoch?: number;
  /**
   * Raw PKCS#8 of the history private key, kept so this device can seal it to ANOTHER unlock method
   * later (a newly approved device, or a newly added passkey).
   *
   * Stored because the key is deliberately generated extractable — it is the one key that must be
   * transferable — so persisting the bytes reveals nothing a `historyPrivateKey` holder could not
   * already export. The DEVICE key by contrast is non-extractable and never has a counterpart here.
   */
  historyPrivateKeyPkcs8?: Uint8Array;
}

export interface DeviceSummary {
  deviceId: string;
  platform: string;
  displayName?: string;
  maxEnvelopeVersion: number;
  createdAt?: number;
  lastSeenAt?: number;
  revoked?: boolean;
  isCurrentDevice: boolean;
}

export interface DeviceOverview {
  devices: DeviceSummary[];
  currentDeviceId?: string;
  historyStatus: HistoryKeyStatus;
  historyKeyId?: string;
}

/**
 * What this device needs in order to take part in a history-key recovery: its registry identity and
 * the long-term device key that authenticates (source) or receives (target) a transfer.
 */
export interface RecoveryIdentity {
  deviceId: string;
  /** Base64 SPKI of this device's registered public key. */
  devicePublicKey: string;
  /** SHA-256 fingerprint (hex) of the above — bound into every transfer envelope. */
  fingerprint: string;
  devicePrivateKey: CryptoKey;
  /** True when this device holds the account-history private key and can act as a transfer source. */
  holdsHistoryKey: boolean;
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'Message encryption is unavailable: this browser has no Web Crypto API (a secure HTTPS context is required).'
    );
  }
  return api;
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Message encryption is unavailable: this browser has no IndexedDB.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the key store.'));
  });
}

function readIdentity(db: IDBDatabase, userId: string): Promise<StoredIdentity | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve(request.result as StoredIdentity | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not read the identity key.'));
  });
}

function writeIdentity(db: IDBDatabase, identity: StoredIdentity): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(identity);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not persist the identity key.'));
  });
}

/**
 * Generates a P-256 ECDH key pair.
 *
 * @param extractable pass `true` only for keys history recovery must be able to hand to another
 *        device (the account-history key and the wire-v1 identity key). Device keys stay `false`.
 */
async function generateKeyPair(extractable = false): Promise<CryptoKeyPair> {
  return subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, extractable, [
    'deriveKey',
    'deriveBits',
  ]) as Promise<CryptoKeyPair>;
}

async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await subtle().exportKey('spki', key));
}

async function importEcdhPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    fromBase64(spkiBase64) as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

/**
 * Imports a PKCS#8 ECDH private key received from another device, together with the matching PUBLIC
 * key so the caller can verify it against the registry before trusting it (see
 * `derivePublicKeySpki`). `extractable: true` is also what allows this device to pass the key on to a
 * third device later.
 */
async function importTransferredPrivateKey(
  pkcs8: Uint8Array
): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicKeySpki: string }> {
  const privateKey = await subtle().importKey(
    'pkcs8',
    pkcs8 as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKeySpki = await derivePublicKeySpki(pkcs8);
  return {
    privateKey,
    publicKey: await importEcdhPublicKey(publicKeySpki),
    publicKeySpki,
  };
}

function isUsableV2Device(device: DeviceRecord): boolean {
  return !device.revoked && device.maxEnvelopeVersion >= 2 && Boolean(device.publicKey);
}

export class ChatEncryptionManager {
  private readonly userId: string;
  private identity: Promise<StoredIdentity> | null = null;
  private registration: Promise<void> | null = null;
  private readonly peerRegistries = new Map<string, Promise<DeviceRegistry>>();
  private selfRegistry: Promise<DeviceRegistry> | null = null;
  /**
   * Cached account history-key state.
   *
   * Epochs and wraps are ACCOUNT-level and change almost never — a new match does not touch them — but
   * a fresh manager is created per chat view, and both `ensureHistoryEpoch()` and `historyHorizon()`
   * read this. Without a cache, opening one conversation cost two `GET /chat/history` calls and opening
   * five cost ten, all for data that had not changed. Invalidated on every write.
   */
  private historyState: Promise<HistoryState> | null = null;

  constructor(userId: string) {
    if (!userId) throw new Error('A userId is required to encrypt messages.');
    this.userId = userId;
  }

  /**
   * Loads (or creates and migrates) this device's identity and registers it for wire v2, proposing an
   * account-history key on first run. Safe to call repeatedly.
   *
   * Registration failures PROPAGATE. With v1 gone there is no fallback format, so an unregistered
   * device cannot send or read anything — reporting that immediately is far better than letting the
   * user type into a conversation that will refuse every message.
   */
  async initialize(): Promise<void> {
    await this.ensureDeviceRegistered();
    // Publish epoch 1 with a wrap for this device if the account has no epoch yet. Best effort: chat
    // must still work if this fails, and the next sign-in retries. Without it the race winner would
    // remain the account's ONLY holder, which is the failure the epoch model exists to remove.
    try {
      await this.ensureHistoryEpoch();
    } catch {
      /* non-fatal: messaging does not depend on the epoch record existing yet */
    }
  }

  /**
   * Establishes the E2E session for a match by reading the peer's device registry.
   *
   * This is not merely a cache warm-up: the registry read is what initializes the conversation
   * server-side. It is the first authenticated, match-verified call both peers make, so the backend
   * writes the ChatTable TAIL marker there (previously a side effect of claiming a pre-key bundle),
   * and every `getMessages`/`sendMessage` is authorized against that marker. Failures therefore
   * propagate — swallowing them would leave the caller reading an empty, unauthorized conversation.
   */
  async ensureSession(peerId: string, matchId: string): Promise<void> {
    await this.peerRegistry(peerId, matchId);
  }

  /**
   * Encrypts one message for a peer inside a match.
   *
   * @throws if the peer has no usable v2 device. With v1 removed there is nothing to fall back to,
   *         and producing a message no one can open would be worse than refusing to send.
   */
  async encryptMessage(peerId: string, matchId: string, plaintext: string): Promise<string> {
    if (!peerId) throw new Error('A peer id is required to encrypt a message.');
    if (!matchId) throw new Error('A matchId is required to encrypt a message.');

    const targets = await this.collectV2Targets(peerId, matchId);
    if (!targets.length) {
      // Reached only when the registry read SUCCEEDED and reported no usable device; network,
      // authentication and server failures propagate from collectV2Targets instead.
      throw new Error(
        'This person has no device set up for encrypted chat yet, so your message cannot be delivered securely.'
      );
    }
    return encryptV2(plaintext, matchId, targets);
  }

  /**
   * Decrypts one message from a match.
   *
   * The peer's identity is irrelevant here — a v2 envelope carries its own wrapped content key — so a
   * message can be opened before the peer's profile has even loaded.
   *
   * @throws `UndecryptableMessageError` when the envelope is intact but wrapped to keys this device
   *         does not hold (history predating this device — recoverable via key recovery), and a plain
   *         error for a malformed envelope or a retired format such as a wire-v1 envelope.
   */
  async decryptMessage(matchId: string, ciphertext: string): Promise<string> {
    if (!isV2Envelope(ciphertext)) {
      // Almost certainly a wire-v1 envelope. Say so plainly: history recovery cannot help, because
      // this build has no v1 code left to decrypt it with.
      throw new Error('This message uses an old encryption format that is no longer supported.');
    }
    // Validate the envelope before opening the key store, so junk is reported as malformed rather
    // than as whatever the key store happens to fail on first.
    parseV2Envelope(ciphertext);
    const recipients = await this.v2Recipients();
    return decryptV2(ciphertext, matchId, recipients);
  }

  // ── Device management (for the account settings UI) ────────────────────────────────────────────

  /** Returns the caller's registered devices and account-history status. */
  async getDeviceOverview(): Promise<DeviceOverview> {
    const identity = await this.loadIdentity();
    const registry = await this.selfRegistryFresh();
    // Holding the PRIVATE key is the only thing that decides this. Knowing the public key means only
    // that this device can wrap NEW messages to history, which every registered device can do.
    const historyStatus: HistoryKeyStatus = identity.historyPrivateKey ? 'holding' : 'not-yet';
    return {
      currentDeviceId: identity.deviceId,
      historyStatus,
      historyKeyId: identity.historyKeyId,
      devices: (registry.devices ?? []).map((device) => ({
        deviceId: device.deviceId,
        platform: device.platform,
        displayName: device.displayName,
        maxEnvelopeVersion: device.maxEnvelopeVersion,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        revoked: device.revoked,
        isCurrentDevice: device.deviceId === identity.deviceId,
      })),
    };
  }

  /** Revokes a device from the caller's registry and refreshes the cached self registry. */
  async revokeDevice(deviceId: string): Promise<void> {
    if (!deviceId) throw new Error('A deviceId is required to revoke a device.');
    await ChatApi.revokeDevice(deviceId);
    this.selfRegistry = null;
  }

  // ── History-key recovery (see key-recovery.ts for the protocol) ────────────────────────────────

  /** True when this device can already read history-wrapped messages. */
  async holdsHistoryKey(): Promise<boolean> {
    const identity = await this.loadIdentity();
    return Boolean(identity.historyKeyId && identity.historyPrivateKey);
  }

  /**
   * This device's recovery identity: registry id, registered public key, its fingerprint, and the
   * long-term private key used to authenticate (as source) or receive (as target) a transfer.
   */
  async recoveryIdentity(): Promise<RecoveryIdentity> {
    const identity = await this.loadIdentity();
    if (!identity.deviceId || !identity.devicePrivateKey || !identity.devicePublicKey) {
      throw new Error('This device is not registered for encrypted chat yet.');
    }
    const devicePublicKey = await exportPublicKey(identity.devicePublicKey);
    return {
      deviceId: identity.deviceId,
      devicePublicKey,
      fingerprint: await fingerprintPublicKey(devicePublicKey),
      devicePrivateKey: identity.devicePrivateKey,
      holdsHistoryKey: Boolean(identity.historyKeyId && identity.historyPrivateKey),
    };
  }

  /** Registered public key of one of the caller's own devices, read fresh from the registry. */
  async lookupOwnDevicePublicKey(deviceId: string): Promise<string> {
    const registry = await ChatApi.getSelfDevices();
    this.selfRegistry = Promise.resolve(registry);
    const device = (registry.devices ?? []).find((entry) => entry.deviceId === deviceId);
    if (!device?.publicKey) {
      throw new Error('That device is no longer registered on your account.');
    }
    return device.publicKey;
  }

  /**
   * Collects the key material a SOURCE device transfers to a new device. Called only after the human
   * has confirmed the request on this device.
   *
   * @throws if this device does not hold the history key, or holds one created before recovery
   *         existed (non-extractable, therefore untransferable).
   */
  async exportRecoveryBundle(): Promise<RecoveryBundle> {
    const identity = await this.loadIdentity();
    if (!identity.historyKeyId || !identity.historyPrivateKey) {
      throw new Error('This device does not hold your history key, so it cannot restore history.');
    }

    try {
      return {
        historyKeyId: identity.historyKeyId,
        historyPrivateKey: new Uint8Array(
          await subtle().exportKey('pkcs8', identity.historyPrivateKey)
        ),
      };
    } catch {
      throw new Error(
        'This device’s history key was created by an older version of the app and cannot be transferred. Sign in on this device again after updating it.'
      );
    }
  }

  /**
   * Adopts a bundle scanned from a source device, then clears the caches so the next read decrypts
   * with the new material.
   *
   * The transferred history key is verified against the registry's canonical account-history key
   * BEFORE anything is persisted: both the logical key id and the derived public key must match. A
   * backend that pointed the client at a key of its own choosing therefore fails here instead of
   * silently installing a key that opens nothing.
   */
  async importRecoveryBundle(bundle: RecoveryBundle): Promise<void> {
    const registry = await ChatApi.getSelfDevices();
    this.selfRegistry = Promise.resolve(registry);
    await assertBundleMatchesRegistry(bundle, registry.accountHistoryKey);
    const canonical = registry.accountHistoryKey!;

    const imported = await importTransferredPrivateKey(bundle.historyPrivateKey);

    const db = await openDatabase();
    const identity = await this.loadIdentity();
    identity.historyKeyId = canonical.keyId;
    identity.historyPrivateKey = imported.privateKey;
    identity.historyPublicKey = imported.publicKey;
    identity.historyPrivateKeyPkcs8 = bundle.historyPrivateKey;
    await writeIdentity(db, identity);

    // Force the next decrypt to rebuild its recipient list with the adopted key.
    this.identity = Promise.resolve(identity);

    // A QR transfer should also make this device a HOLDER others can unlock from, not just a reader.
    // Best effort: the key already works locally, so a failed publish must not present the transfer as
    // failed — it only means this device is not yet advertised as a holder.
    try {
      const state = await ChatApi.getHistoryState();
      const epochRecord = state.epochs.find((e) => e.keyId === canonical.keyId);
      if (epochRecord && identity.deviceId && identity.devicePublicKey) {
        identity.historyEpoch = epochRecord.epoch;
        await writeIdentity(db, identity);
        this.identity = Promise.resolve(identity);
        await ChatApi.putHistoryWrap({
          epoch: epochRecord.epoch,
          method: 'DEVICE',
          wrapId: identity.deviceId,
          wrappedKey: await wrapToDeviceKey(
            bundle.historyPrivateKey,
            await exportPublicKey(identity.devicePublicKey),
            {
              userId: this.userId,
              epoch: epochRecord.epoch,
              method: 'DEVICE',
              wrapId: identity.deviceId,
            }
          ),
        });
        this.invalidateHistoryState();
      }
    } catch {
      /* retried by ensureHistoryEpoch/unlockHistoryKey on the next sign-in */
    }
  }

  // ── Account history-key epochs and the unlock ladder ───────────────────────────────────────────

  /**
   * Publishes epoch 1 with a wrap for this device, if the account has no epoch yet.
   *
   * Called after registration by the device that WON the first-write-wins race, so the winner is no
   * longer the sole holder: its own key becomes one wrap among several. Without this the account
   * would still have exactly one holder, which is the failure the epoch model exists to remove.
   *
   * Safe to call repeatedly and safe to lose: a losing race returns quietly, because another of the
   * user's devices published the epoch and this device will unlock against that instead.
   */
  async ensureHistoryEpoch(): Promise<void> {
    const identity = await this.loadIdentity();
    if (!identity.deviceId || !identity.devicePublicKey) return;

    const state = await this.historyStateFresh();

    if (state.activeEpoch) {
      // An epoch already exists. If this device holds its key, record which epoch that is so later
      // unlock and wrap writes address the right slot. If it does not, there is nothing to do here —
      // `unlockHistoryKey()` owns that case.
      const match = state.epochs.find((e) => e.keyId === identity.historyKeyId);
      if (match && identity.historyEpoch !== match.epoch && identity.historyPrivateKeyPkcs8) {
        identity.historyEpoch = match.epoch;
        await writeIdentity(await openDatabase(), identity);
        this.identity = Promise.resolve(identity);
      }
      return;
    }

    // No epoch yet, so this device creates one. Generated extractable on purpose: this is the key that
    // must be transferable to future devices and to other unlock methods.
    const pair = await generateKeyPair(true);
    const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
    const keyId = randomId();

    // The wrap set goes in the SAME call as the epoch, which is what makes an unrecoverable history key
    // impossible: the backend rejects an epoch with no wraps.
    const result = await ChatApi.establishHistoryEpoch({
      epoch: 1,
      expectedEpoch: 0,
      keyId,
      publicKey: await exportPublicKey(pair.publicKey),
      wraps: [
        {
          method: 'DEVICE',
          wrapId: identity.deviceId,
          wrappedKey: await wrapToDeviceKey(pkcs8, await exportPublicKey(identity.devicePublicKey), {
            userId: this.userId,
            epoch: 1,
            method: 'DEVICE',
            wrapId: identity.deviceId,
          }),
        },
      ],
    });

    this.invalidateHistoryState();

    if (!result.established) {
      // Another of the user's devices created epoch 1 first. Discard the key we generated — keeping it
      // would leave this device believing it holds a history key the account never adopted — and let the
      // unlock ladder obtain the real one.
      return;
    }

    const db = await openDatabase();
    identity.historyKeyId = keyId;
    identity.historyEpoch = 1;
    identity.historyPrivateKey = pair.privateKey;
    identity.historyPublicKey = pair.publicKey;
    identity.historyPrivateKeyPkcs8 = pkcs8;
    await writeIdentity(db, identity);
    this.identity = Promise.resolve(identity);

    // Add a second, device-independent holder straight away where the platform allows it, so a
    // brand-new account is not one lost device away from losing its history.
    try {
      await this.addPasskeyUnlock();
    } catch {
      /* PRF unavailable here; the device wrap above still stands */
    }
  }

  /**
   * Walks the unlock ladder to obtain the active epoch's history private key.
   *
   * Order is deliberate — cheapest and least interactive first:
   *   1. already held (nothing to do);
   *   2. a DEVICE wrap sealed to this device, written when another device approved it;
   *   3. PRF, supplied by the caller because deriving it needs a user gesture this layer must not
   *      trigger on its own.
   *
   * QR transfer and reset sit ABOVE this in the UI rather than here: both need explicit user
   * involvement, and this method must be safe to call unattended at sign-in.
   *
   * @param derivePrfSecret optional: given a credential id, returns that passkey's PRF output
   * @returns how the key was obtained, or why it could not be
   */
  async unlockHistoryKey(
    derivePrfSecret?: (credentialId: string) => Promise<Uint8Array | null>
  ): Promise<'already-held' | 'device-wrap' | 'prf' | 'unavailable'> {
    const identity = await this.loadIdentity();
    if (!identity.deviceId || !identity.devicePrivateKey) return 'unavailable';

    const state = await this.historyStateFresh();
    const activeEpoch = state.activeEpoch;
    if (!activeEpoch) return 'unavailable';

    if (identity.historyPrivateKey && identity.historyEpoch === activeEpoch) {
      return 'already-held';
    }

    const wraps = state.wraps ?? [];

    const deviceWrap = wraps.find(
      (w) => w.method === 'DEVICE' && w.wrapId === identity.deviceId && w.wrappedKey
    );
    if (deviceWrap?.wrappedKey) {
      const pkcs8 = await unwrapWithDeviceKey(deviceWrap.wrappedKey, identity.devicePrivateKey, {
        userId: this.userId,
        epoch: activeEpoch,
        method: 'DEVICE',
        wrapId: identity.deviceId,
      });
      await this.adoptHistoryKey(pkcs8, activeEpoch, state);
      return 'device-wrap';
    }

    if (derivePrfSecret) {
      for (const wrap of wraps.filter((w) => w.method === 'PRF' && w.wrappedKey)) {
        const secret = await derivePrfSecret(wrap.wrapId);
        if (!secret) continue;
        try {
          const pkcs8 = await unwrapWithSecret(wrap.wrappedKey!, secret, {
            userId: this.userId,
            epoch: activeEpoch,
            method: 'PRF',
            wrapId: wrap.wrapId,
          });
          await this.adoptHistoryKey(pkcs8, activeEpoch, state);
          return 'prf';
        } catch {
          // This passkey is not the one this wrap was sealed to; try the next.
        }
      }
    }

    return 'unavailable';
  }

  /**
   * Stores an unlocked history key and publishes a wrap for THIS device.
   *
   * Publishing matters as much as storing: it turns every successful unlock into an additional
   * holder, so the account becomes progressively harder to strand rather than depending forever on
   * whichever method happened to work first.
   */
  private async adoptHistoryKey(
    pkcs8: Uint8Array,
    epoch: number,
    state: HistoryState
  ): Promise<void> {
    const imported = await importTransferredPrivateKey(pkcs8);
    const epochRecord = state.epochs.find((e) => e.epoch === epoch);
    if (!epochRecord) {
      throw new Error('The account has no record of that history epoch.');
    }
    if (imported.publicKeySpki !== epochRecord.publicKey) {
      // The unwrapped key must be the epoch's key. A mismatch means the wrap and the epoch record
      // disagree, so adopting it would leave this device unable to read anything.
      throw new Error('That recovery key does not match this account’s history key.');
    }

    const db = await openDatabase();
    const identity = await this.loadIdentity();
    identity.historyKeyId = epochRecord.keyId;
    identity.historyEpoch = epoch;
    identity.historyPrivateKey = imported.privateKey;
    identity.historyPublicKey = imported.publicKey;
    identity.historyPrivateKeyPkcs8 = pkcs8;
    await writeIdentity(db, identity);
    this.identity = Promise.resolve(identity);

    // Best effort: the key is already usable locally, so a failed publish must not present the
    // unlock as failed. It only means this device is not yet a holder others can rely on.
    if (identity.deviceId && identity.devicePublicKey) {
      try {
        await ChatApi.putHistoryWrap({
          epoch,
          method: 'DEVICE',
          wrapId: identity.deviceId,
          wrappedKey: await wrapToDeviceKey(
            pkcs8,
            await exportPublicKey(identity.devicePublicKey),
            { userId: this.userId, epoch, method: 'DEVICE', wrapId: identity.deviceId }
          ),
        });
        this.invalidateHistoryState();
      } catch {
        /* the next sign-in retries via ensureHistoryEpoch/unlock */
      }
    }
  }

  /**
   * Seals the history key to ANOTHER device, granting it access without a QR transfer.
   *
   * Must only be called after the user has explicitly approved that device: the backend supplies the
   * public key being sealed to, so an unverified call here is exactly the substitution risk noted in
   * docs/account-key-recovery.md §5.1.
   */
  async grantHistoryKeyToDevice(targetDeviceId: string): Promise<void> {
    const identity = await this.loadIdentity();
    if (!identity.historyPrivateKeyPkcs8 || !identity.historyEpoch) {
      throw new Error('This device does not hold your history key, so it cannot grant access.');
    }
    const targetPublicKey = await this.lookupOwnDevicePublicKey(targetDeviceId);
    await ChatApi.putHistoryWrap({
      epoch: identity.historyEpoch,
      method: 'DEVICE',
      wrapId: targetDeviceId,
      wrappedKey: await wrapToDeviceKey(identity.historyPrivateKeyPkcs8, targetPublicKey, {
        userId: this.userId,
        epoch: identity.historyEpoch,
        method: 'DEVICE',
        wrapId: targetDeviceId,
      }),
    });
    this.invalidateHistoryState();
  }

  /**
   * Registers a passkey as an unlock method for the active epoch.
   *
   * This is the rung that makes a future device self-sufficient: because passkeys sync through iCloud
   * Keychain and Google Password Manager, a brand-new device can re-derive the same PRF output and open
   * the key with NO other device online. Every other method needs a second device or a native platform.
   *
   * Must be called on a device that already holds the key. Returns the credential id used, or null when
   * PRF is unavailable — an ordinary outcome on Windows 10, Firefox-on-Android and Chrome-profile
   * authenticators, where the caller keeps QR and reset as the available paths.
   */
  async addPasskeyUnlock(): Promise<string | null> {
    const identity = await this.loadIdentity();
    if (!identity.historyPrivateKeyPkcs8 || !identity.historyEpoch) {
      throw new Error('This device does not hold your history key, so it cannot add a passkey unlock.');
    }
    if (!(await isPrfSupported())) return null;

    const derived = await derivePasskeySecretWithId();
    if (!derived) return null;

    const epoch = identity.historyEpoch;
    await ChatApi.putHistoryWrap({
      epoch,
      method: 'PRF',
      wrapId: derived.credentialId,
      wrappedKey: await wrapToSecret(identity.historyPrivateKeyPkcs8, derived.secret, {
        userId: this.userId,
        epoch,
        method: 'PRF',
        wrapId: derived.credentialId,
      }),
    });
    this.invalidateHistoryState();
    return derived.credentialId;
  }

  /**
   * Which unlock methods the active epoch currently has, so settings can show the account's real
   * resilience and nudge toward a second passkey rather than guessing.
   */
  async historyUnlockMethods(): Promise<{
    activeEpoch?: number;
    escrow: number;
    prf: number;
    device: number;
    prfSupportedHere: boolean;
  }> {
    const state = await this.historyStateFresh();
    const wraps = state.wraps ?? [];
    return {
      activeEpoch: state.activeEpoch,
      escrow: wraps.filter((w) => w.method === 'ESCROW').length,
      prf: wraps.filter((w) => w.method === 'PRF').length,
      device: wraps.filter((w) => w.method === 'DEVICE').length,
      prfSupportedHere: await isPrfSupported(),
    };
  }

  /**
   * Establishes a NEW epoch after every unlock method has failed, deliberately abandoning history.
   *
   * The floor of the ladder. Without it a stranded key leaves the account permanently broken: every
   * future message would keep being wrapped to a key nobody holds, with no way to establish a
   * replacement. This trades "old messages lost" for "account works again".
   *
   * Records a HORIZON rather than deleting anything. `ChatTable` stores one shared copy per match, so
   * deleting would destroy the peer's copy too — and the peer may still read it perfectly well. It also
   * buys no confidentiality, since that ciphertext is already unreadable without the key. See
   * docs/account-key-recovery.md §4.1.
   *
   * Callers MUST confirm with the user first and should re-authenticate: reset cannot reveal history,
   * but it can destroy this account's access to it.
   *
   * @returns true when this device established the new epoch; false when another device won the race,
   *          in which case the caller should re-read and try unlocking against that epoch instead.
   */
  async resetHistoryKey(): Promise<boolean> {
    const identity = await this.loadIdentity();
    if (!identity.deviceId || !identity.devicePublicKey) {
      throw new Error('This device is not registered for encrypted chat yet.');
    }

    const state = await ChatApi.getHistoryState();
    const currentEpoch = state.activeEpoch ?? 0;
    const nextEpoch = currentEpoch + 1;

    // Extractable on purpose: this key must be transferable to future devices and to other unlock
    // methods, exactly like the epoch it replaces.
    const pair = await generateKeyPair(true);
    const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
    const keyId = randomId();

    const established = await ChatApi.establishHistoryEpoch({
      epoch: nextEpoch,
      expectedEpoch: currentEpoch,
      keyId,
      publicKey: await exportPublicKey(pair.publicKey),
      // Every epoch after the first is a reset, so the backend requires a horizon. This is the line
      // the UI renders as "earlier messages aren't available on this account".
      horizonAt: currentEpoch > 0 ? Date.now() : undefined,
      wraps: [
        {
          method: 'DEVICE',
          wrapId: identity.deviceId,
          wrappedKey: await wrapToDeviceKey(pkcs8, await exportPublicKey(identity.devicePublicKey), {
            userId: this.userId,
            epoch: nextEpoch,
            method: 'DEVICE',
            wrapId: identity.deviceId,
          }),
        },
      ],
    });

    if (!established.established) return false;
    this.invalidateHistoryState();

    const db = await openDatabase();
    identity.historyKeyId = keyId;
    identity.historyEpoch = nextEpoch;
    identity.historyPrivateKey = pair.privateKey;
    identity.historyPublicKey = pair.publicKey;
    identity.historyPrivateKeyPkcs8 = pkcs8;
    await writeIdentity(db, identity);
    this.identity = Promise.resolve(identity);

    // Immediately add a second holder where possible, so the fresh epoch is not a single point of
    // failure the way the one it replaced was.
    try {
      await this.addPasskeyUnlock();
    } catch {
      /* PRF is unavailable here; the device wrap above still stands */
    }
    return true;
  }

  /**
   * The active epoch's history horizon, if it has one.
   *
   * Set only on an epoch created by a reset. Messages older than this cannot be read on this account,
   * so the UI shows one marker instead of a wall of individually locked bubbles.
   */
  async historyHorizon(): Promise<number | undefined> {
    const state = await this.historyStateFresh();
    if (!state.activeEpoch) return undefined;
    return state.epochs.find((e) => e.epoch === state.activeEpoch)?.horizonAt;
  }

  // ── v2 internals ───────────────────────────────────────────────────────────────────────────────

  private async collectV2Targets(peerId: string, matchId: string): Promise<WireTarget[]> {
    const peerRegistry = await this.peerRegistry(peerId, matchId);
    const peerDevices = (peerRegistry.devices ?? []).filter(isUsableV2Device);
    if (!peerDevices.length) return [];

    const selfRegistry = await this.selfRegistryFresh();
    const selfDevices = (selfRegistry.devices ?? []).filter(isUsableV2Device);
    const identity = await this.loadIdentity();

    const targets: WireTarget[] = [];
    if (identity.deviceId && identity.devicePublicKey) {
      targets.push({
        id: deviceTargetId(identity.deviceId),
        publicKey: await exportPublicKey(identity.devicePublicKey),
      });
    }
    for (const device of selfDevices) {
      targets.push({ id: deviceTargetId(device.deviceId), publicKey: device.publicKey });
    }
    for (const device of peerDevices) {
      targets.push({ id: deviceTargetId(device.deviceId), publicKey: device.publicKey });
    }
    // Both members' account-history keys, so either member can recover this message on a new device.
    if (selfRegistry.accountHistoryKey?.publicKey) {
      targets.push({
        id: historyTargetId(this.userId, selfRegistry.accountHistoryKey.keyId),
        publicKey: selfRegistry.accountHistoryKey.publicKey,
      });
    }
    if (peerRegistry.accountHistoryKey?.publicKey) {
      targets.push({
        id: historyTargetId(peerId, peerRegistry.accountHistoryKey.keyId),
        publicKey: peerRegistry.accountHistoryKey.publicKey,
      });
    }
    return targets;
  }

  private async v2Recipients(): Promise<WireRecipient[]> {
    const identity = await this.loadIdentity();
    const recipients: WireRecipient[] = [];
    // Own device key first, account-history key second (device-preferred decryption).
    if (identity.deviceId && identity.devicePrivateKey) {
      recipients.push({
        id: deviceTargetId(identity.deviceId),
        privateKey: identity.devicePrivateKey,
      });
    }
    if (identity.historyKeyId && identity.historyPrivateKey) {
      recipients.push({
        id: historyTargetId(this.userId, identity.historyKeyId),
        privateKey: identity.historyPrivateKey,
      });
    }
    return recipients;
  }

  private peerRegistry(peerId: string, matchId: string): Promise<DeviceRegistry> {
    const cacheKey = `${matchId}:${peerId}`;
    const cached = this.peerRegistries.get(cacheKey);
    if (cached) return cached;
    const pending = ChatApi.getPeerDevices(peerId, matchId).catch((error) => {
      this.peerRegistries.delete(cacheKey);
      throw error;
    });
    this.peerRegistries.set(cacheKey, pending);
    return pending;
  }

  /** Reads history state once per manager, then serves the cached copy. */
  private historyStateFresh(): Promise<HistoryState> {
    if (this.historyState) return this.historyState;
    const pending = ChatApi.getHistoryState().catch((error) => {
      // Do not cache a failure: a transient error must not make the whole session believe the account
      // has no epoch, which would send every unlock straight to the QR fallback.
      this.historyState = null;
      throw error;
    });
    this.historyState = pending;
    return pending;
  }

  /** Drops the cached state after any write that could change it. */
  private invalidateHistoryState(): void {
    this.historyState = null;
  }

  private selfRegistryFresh(): Promise<DeviceRegistry> {
    if (this.selfRegistry) return this.selfRegistry;
    const pending = ChatApi.getSelfDevices().catch((error) => {
      this.selfRegistry = null;
      throw error;
    });
    this.selfRegistry = pending;
    return pending;
  }

  private ensureDeviceRegistered(): Promise<void> {
    if (this.registration) return this.registration;
    this.registration = (async () => {
      const db = await openDatabase();
      const identity = await this.loadIdentity();
      if (!identity.deviceId || !identity.devicePublicKey) {
        throw new Error('Device identity is missing after migration.');
      }

      const response = await ChatApi.registerDevice({
        deviceId: identity.deviceId,
        publicKey: await exportPublicKey(identity.devicePublicKey),
        platform: PLATFORM,
        displayName: this.defaultDisplayName(),
        maxEnvelopeVersion: MAX_ENVELOPE_VERSION,
      });

      // Registration no longer proposes a history key. It used to, first-write-wins, which left the
      // winner holding the only copy and every later device permanently "future-only" — able to wrap new
      // messages to history but never to read it, and dependent on that one device surviving. Epoch 1 is
      // now established by `ensureHistoryEpoch()` through an endpoint that requires a wrap set in the
      // same call, so a history key can never exist with no way to unlock it.
      //
      // What this device DOES take from the response is the history PUBLIC key, so it can wrap new
      // messages to history immediately. Whether it can READ history is decided by the wraps on the
      // active epoch — see `unlockHistoryKey()`.
      if (response.accountHistoryKey?.publicKey && !identity.historyKeyId) {
        identity.historyKeyId = response.accountHistoryKey.keyId;
        identity.historyPublicKey = await importEcdhPublicKey(response.accountHistoryKey.publicKey);
        await writeIdentity(db, identity);
      }

      // POST /chat/devices intentionally returns only the registered device, not the full list.
      // Read the authoritative registry after persisting any accepted key so subsequent sends fan
      // out to all sender devices and the management UI is complete.
      this.selfRegistry = Promise.resolve(await ChatApi.getSelfDevices());
    })().catch((error) => {
      this.registration = null;
      throw error;
    });
    return this.registration;
  }

  private defaultDisplayName(): string {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent;
      const platform =
        /iPhone|iPad|iPod/.test(ua)
          ? 'iOS'
          : /Android/.test(ua)
            ? 'Android'
            : /Macintosh/.test(ua)
              ? 'Mac'
              : /Windows/.test(ua)
                ? 'Windows'
                : /Linux/.test(ua)
                  ? 'Linux'
                  : 'Web';
      const browser = /Firefox\//.test(ua)
        ? 'Firefox'
        : /Edg\//.test(ua)
          ? 'Edge'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser';
      return `${browser} on ${platform}`;
    }
    return 'Web';
  }

  // ── Identity storage ───────────────────────────────────────────────────────────────────────────

  /**
   * Loads this device's identity, creating it on first use.
   *
   * A record written before wire v1 was removed also carries the old v1 identity key pair. It is
   * neither read nor deleted here: `StoredIdentity` no longer declares those fields, so they are
   * simply inert. Rewriting every stored record to strip them would risk the one thing that must not
   * be lost — the device and account-history keys sitting beside them.
   */
  private async loadIdentity(): Promise<StoredIdentity> {
    if (!this.identity) {
      this.identity = (async () => {
        const db = await openDatabase();
        const existing = await readIdentity(db, this.userId);
        if (existing && existing.deviceId && existing.devicePrivateKey) {
          return existing;
        }

        // No record yet, or one predating multi-device support. Either way, add a random deviceId and
        // a fresh non-extractable device key IN PLACE, preserving anything already stored (notably an
        // account-history key). The history key itself is proposed later, during registration, once
        // the server can say whether the account already has one.
        const devicePair = await generateKeyPair();
        const identity: StoredIdentity = {
          ...(existing ?? {}),
          userId: this.userId,
          deviceId: existing?.deviceId ?? randomId(),
          devicePrivateKey: devicePair.privateKey,
          devicePublicKey: devicePair.publicKey,
        };
        await writeIdentity(db, identity);
        return identity;
      })().catch((error) => {
        this.identity = null;
        throw error;
      });
    }
    return this.identity;
  }
}
