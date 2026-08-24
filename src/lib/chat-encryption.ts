import {
  ChatApi,
  type AccountHistoryKey,
  type DeviceRecord,
  type DeviceRegistry,
} from '../api/chat';
import {
  decryptV2,
  deviceTargetId,
  encryptV2,
  historyTargetId,
  isV2Envelope,
  type WireRecipient,
  type WireTarget,
} from './chat-wire-v2';

/**
 * End-to-end message encryption for a match conversation.
 *
 * Wire version 1 (legacy, retained for interop):
 *  - Each member owns a long-lived ECDH P-256 identity key pair. The private key is generated
 *    non-extractable by WebCrypto and persisted as a `CryptoKey` in IndexedDB, so it is never
 *    serialisable to JavaScript, never written to `localStorage`, and never leaves the device.
 *  - The public key is published to the chat key server (`POST /chat/prekeys`).
 *  - A conversation key is derived with ECDH against the peer's published identity key, then
 *    HKDF-SHA256 (salt = matchId) into a 256-bit AES-GCM key. This binds a conversation to a single
 *    device, so a member could only read a match from the device that generated that key.
 *
 * Wire version 2 (multi-device, see chat-wire-v2.ts):
 *  - Each device owns its own non-extractable P-256 ECDH "device key", registered with the server
 *    (`POST /chat/devices`) under a random `deviceId`. A message is encrypted once with a random
 *    AES-256 content key, and that content key is wrapped separately for every registered device of
 *    BOTH members plus each member's account-history key. Every device registered at send time can
 *    read the message immediately. A later device is future-only until it securely obtains the
 *    account-history private key; this module never derives that private key from public account
 *    identifiers or backend-known material.
 *  - The first device to register may propose an account-history key. The server returns the
 *    canonical account-history key and whether the proposal was accepted. If accepted, this device
 *    keeps the private key and can decrypt history wraps. If a different device already owns it, this
 *    device keeps only the public key ("future-only") — it can wrap NEW messages to history but
 *    cannot decrypt history-wrapped messages it was not a recipient of.
 *
 * Security properties:
 *  - The server stores only ciphertext and public keys; it never sees plaintext.
 *  - AES-GCM is authenticated and the message AAD binds ciphertext to its matchId, so ciphertext
 *    cannot be replayed into a different conversation.
 *  - There is NO forward secrecy: the account-history key is long-lived, which is the deliberate
 *    tradeoff that enables multi-device history recovery.
 *  - Peer keys come from the server, so a malicious server could substitute keys. Detecting that
 *    requires out-of-band verification (safety numbers), which this client does not yet offer.
 *
 * Every failure path throws. Nothing here degrades to plaintext, and no branch returns an
 * unencrypted message as if it had been protected.
 */

const DB_NAME = 'onehook-e2ee';
// v2 adds the device identity + account-history fields to the identity record. The store keyPath is
// unchanged (`userId`), so existing v1 records are migrated in place on read rather than dropped.
const DB_VERSION = 2;
const STORE_NAME = 'identity-keys';
const WIRE_VERSION_V1 = 1;
const IV_BYTES = 12;
const HKDF_INFO = 'onehook-chat-v1';
const ONE_TIME_PREKEY_COUNT = 5;
const MAX_ENVELOPE_VERSION = 2;
const PLATFORM = 'WEB';

export type HistoryKeyStatus = 'none' | 'holding' | 'future-only';

interface StoredIdentity {
  userId: string;
  // v1 identity key (retained for v1 decrypt / fallback send).
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  // v2 device identity.
  deviceId?: string;
  devicePrivateKey?: CryptoKey;
  devicePublicKey?: CryptoKey;
  // Account-history key. `historyPrivateKey` is present only when this device holds the canonical
  // history private key; otherwise the key is "future-only" (public wrap target without decrypt).
  historyKeyId?: string;
  historyPrivateKey?: CryptoKey;
  historyPublicKey?: CryptoKey;
  historyFutureOnly?: boolean;
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

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
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

function isUsableV2Device(device: DeviceRecord): boolean {
  return !device.revoked && device.maxEnvelopeVersion >= 2 && Boolean(device.publicKey);
}

export class ChatEncryptionManager {
  private readonly userId: string;
  private identity: Promise<StoredIdentity> | null = null;
  private registration: Promise<void> | null = null;
  private readonly conversationKeys = new Map<string, Promise<CryptoKey>>();
  private readonly peerRegistries = new Map<string, Promise<DeviceRegistry>>();
  private selfRegistry: Promise<DeviceRegistry> | null = null;

  constructor(userId: string) {
    if (!userId) throw new Error('A userId is required to encrypt messages.');
    this.userId = userId;
  }

  /**
   * Loads (or creates and migrates) this device's identity, publishes v1 pre-key material, and
   * registers the device for wire v2 (including proposing an account-history key on first run).
   * Safe to call repeatedly.
   */
  async initialize(): Promise<void> {
    const identity = await this.loadIdentity();
    const signedPreKey = await generateKeyPair();
    const oneTimePreKeys = await Promise.all(
      Array.from({ length: ONE_TIME_PREKEY_COUNT }, () => generateKeyPair())
    );

    await ChatApi.uploadPreKeys(
      this.userId,
      await exportPublicKey(identity.publicKey),
      await exportPublicKey(signedPreKey.publicKey),
      await Promise.all(oneTimePreKeys.map((pair) => exportPublicKey(pair.publicKey)))
    );

    // Register the device for v2. Non-fatal: a registry failure must not break v1 messaging.
    await this.ensureDeviceRegistered().catch((error) => {
      console.warn('Chat device registration failed; continuing with v1 only:', error);
    });
  }

  /**
   * Ensures the E2E session for a match exists. For v1 this claims the peer's pre-key bundle (which
   * initializes the conversation server-side). For v2 this pre-warms the peer device registry.
   * Safe to call repeatedly.
   */
  async ensureSession(peerId: string, matchId: string): Promise<void> {
    // Claiming the v1 bundle writes the ChatTable TAIL marker the read path requires, so keep doing
    // it even when the peer supports v2.
    await this.conversationKey(peerId, matchId).catch((error) => {
      console.warn('Could not establish v1 chat session:', error);
    });
    await this.peerRegistry(peerId, matchId).catch(() => {
      /* peer may not support v2 yet; v1 path remains available */
    });
  }

  /** Encrypts one message for a peer inside a match, using v2 when the peer supports it. */
  async encryptMessage(peerId: string, matchId: string, plaintext: string): Promise<string> {
    if (!peerId) throw new Error('A peer id is required to derive the conversation key.');
    if (!matchId) throw new Error('A matchId is required to derive the conversation key.');

    const targets = await this.collectV2Targets(peerId, matchId);
    if (targets.length) {
      return encryptV2(plaintext, matchId, targets);
    }
    // A successful registry response confirmed that the peer has no usable v2 device. Network,
    // authentication, and server failures propagate above rather than silently creating a v1
    // message that a known multi-device peer may be unable to open.
    return this.encryptV1(peerId, matchId, plaintext);
  }

  /** Decrypts one message from a peer inside a match. Throws when authentication fails. */
  async decryptMessage(peerId: string, matchId: string, ciphertext: string): Promise<string> {
    if (isV2Envelope(ciphertext)) {
      const recipients = await this.v2Recipients();
      return decryptV2(ciphertext, matchId, recipients);
    }
    return this.decryptV1(peerId, matchId, ciphertext);
  }

  // ── Device management (for the account settings UI) ────────────────────────────────────────────

  /** Returns the caller's registered devices and account-history status. */
  async getDeviceOverview(): Promise<DeviceOverview> {
    const identity = await this.loadIdentity();
    const registry = await this.selfRegistryFresh();
    const historyStatus: HistoryKeyStatus = identity.historyPrivateKey
      ? 'holding'
      : identity.historyKeyId
        ? 'future-only'
        : 'none';
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

      // Propose a fresh account-history key only if this account has none yet on this device.
      let proposal: AccountHistoryKey | undefined;
      let proposedPair: CryptoKeyPair | undefined;
      if (!identity.historyKeyId) {
        proposedPair = await generateKeyPair();
        proposal = {
          keyId: randomId(),
          publicKey: await exportPublicKey(proposedPair.publicKey),
        };
      }

      const response = await ChatApi.registerDevice({
        deviceId: identity.deviceId,
        publicKey: await exportPublicKey(identity.devicePublicKey),
        platform: PLATFORM,
        displayName: this.defaultDisplayName(),
        maxEnvelopeVersion: MAX_ENVELOPE_VERSION,
        accountHistoryKey: proposal,
      });

      // Reconcile the account-history key against the server's canonical answer.
      if (proposal && proposedPair) {
        if (response.ownsAccountHistoryKey && response.accountHistoryKey?.keyId === proposal.keyId) {
          // Accepted: this device owns the canonical history key and can decrypt history wraps.
          identity.historyKeyId = proposal.keyId;
          identity.historyPrivateKey = proposedPair.privateKey;
          identity.historyPublicKey = proposedPair.publicKey;
          identity.historyFutureOnly = false;
          await writeIdentity(db, identity);
        } else if (response.accountHistoryKey?.publicKey) {
          // Rejected: a different device owns history. Discard our private key and retain only the
          // canonical public key so we can still wrap NEW messages to it ("future-only").
          identity.historyKeyId = response.accountHistoryKey.keyId;
          identity.historyPrivateKey = undefined;
          identity.historyPublicKey = await importEcdhPublicKey(
            response.accountHistoryKey.publicKey
          );
          identity.historyFutureOnly = true;
          await writeIdentity(db, identity);
        }
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

  // ── Identity storage + v1 internals ─────────────────────────────────────────────────────────────

  private async loadIdentity(): Promise<StoredIdentity> {
    if (!this.identity) {
      this.identity = (async () => {
        const db = await openDatabase();
        const existing = await readIdentity(db, this.userId);
        if (existing && existing.deviceId && existing.devicePrivateKey) {
          return existing;
        }

        // Either no record yet, or a v1 record predating multi-device support. In both cases we
        // migrate IN PLACE: keep any existing v1 identity key, and add a random deviceId plus a
        // fresh non-extractable device key. The account-history key is proposed later, during
        // registration, once the server can tell us whether the account already has one.
        const v1Pair = existing
          ? { privateKey: existing.privateKey, publicKey: existing.publicKey }
          : await generateKeyPair();
        const devicePair = await generateKeyPair();
        const identity: StoredIdentity = {
          ...(existing ?? {}),
          userId: this.userId,
          privateKey: v1Pair.privateKey,
          publicKey: v1Pair.publicKey,
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

  /** v1 single-device encryption, retained for peers that have not registered v2 devices. */
  private async encryptV1(peerId: string, matchId: string, plaintext: string): Promise<string> {
    const key = await this.conversationKey(peerId, matchId);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(matchId) },
      key,
      new TextEncoder().encode(plaintext)
    );

    const envelope = new Uint8Array(1 + IV_BYTES + ciphertext.byteLength);
    envelope[0] = WIRE_VERSION_V1;
    envelope.set(iv, 1);
    envelope.set(new Uint8Array(ciphertext), 1 + IV_BYTES);
    return toBase64(envelope.buffer);
  }

  /** v1 single-device decryption. */
  private async decryptV1(peerId: string, matchId: string, ciphertext: string): Promise<string> {
    const envelope = fromBase64(ciphertext);
    if (envelope.length <= 1 + IV_BYTES) {
      throw new Error('Message is malformed.');
    }
    if (envelope[0] !== WIRE_VERSION_V1) {
      throw new Error(`Unsupported message encryption version ${envelope[0]}.`);
    }

    const key = await this.conversationKey(peerId, matchId);
    const plaintext = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: envelope.subarray(1, 1 + IV_BYTES),
        additionalData: new TextEncoder().encode(matchId),
      },
      key,
      envelope.subarray(1 + IV_BYTES)
    );
    return new TextDecoder().decode(plaintext);
  }

  private conversationKey(peerId: string, matchId: string): Promise<CryptoKey> {
    if (!peerId) throw new Error('A peer id is required to derive the conversation key.');
    if (!matchId) throw new Error('A matchId is required to derive the conversation key.');

    const cacheKey = `${matchId}:${peerId}`;
    const cached = this.conversationKeys.get(cacheKey);
    if (cached) return cached;

    const derived = (async () => {
      const identity = await this.loadIdentity();
      const bundle = await ChatApi.claimPreKeyBundle(peerId, matchId);
      const peerIdentityKey = bundle?.identityKey;
      if (!peerIdentityKey) {
        throw new Error('The peer has not published an encryption key yet.');
      }

      const peerPublicKey = await subtle().importKey(
        'spki',
        fromBase64(peerIdentityKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      );

      const sharedSecret = await subtle().deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        identity.privateKey,
        256
      );
      const hkdfKey = await subtle().importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
      return subtle().deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new TextEncoder().encode(matchId),
          info: new TextEncoder().encode(HKDF_INFO),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    })().catch((error) => {
      this.conversationKeys.delete(cacheKey);
      throw error;
    });

    this.conversationKeys.set(cacheKey, derived);
    return derived;
  }
}
