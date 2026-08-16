import { ChatApi } from '../api/chat';

/**
 * End-to-end message encryption for a match conversation.
 *
 * Scheme (wire version 1):
 *  - Each member owns a long-lived ECDH P-256 identity key pair. The private key is generated
 *    non-extractable by WebCrypto and persisted as a `CryptoKey` in IndexedDB, so it is never
 *    serialisable to JavaScript, never written to `localStorage`, and never leaves the device.
 *  - The public key is published to the chat key server (`POST /chat/prekeys`).
 *  - A conversation key is derived with ECDH against the peer's published identity key, then
 *    HKDF-SHA256 (salt = matchId) into a 256-bit AES-GCM key.
 *  - Every message uses a fresh 96-bit random IV and carries `matchId` as additional authenticated
 *    data, so ciphertext cannot be replayed into a different conversation. AES-GCM is
 *    authenticated: tampering fails decryption rather than yielding altered plaintext.
 *
 * Security properties, stated precisely:
 *  - The server stores only ciphertext and cannot read message content.
 *  - Integrity and conversation-binding are cryptographically enforced.
 *  - There is NO forward secrecy: the conversation key is static for a match, so compromise of an
 *    identity private key exposes that conversation's history. A Double Ratchet upgrade is the
 *    intended next step; the key server already accepts the signed and one-time pre-keys uploaded
 *    below, which that upgrade requires.
 *  - Peer public keys are obtained from the key server, so a malicious server could substitute its
 *    own key. Detecting that requires out-of-band key verification (safety numbers), which this
 *    client does not yet offer.
 *
 * Every failure path throws. Nothing here degrades to plaintext, and no branch returns an
 * unencrypted message as if it had been protected.
 */

const DB_NAME = 'onehook-e2ee';
const DB_VERSION = 1;
const STORE_NAME = 'identity-keys';
const WIRE_VERSION = 1;
const IV_BYTES = 12;
const HKDF_INFO = 'onehook-chat-v1';
const ONE_TIME_PREKEY_COUNT = 5;

interface StoredIdentity {
  userId: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
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

export class ChatEncryptionManager {
  private readonly userId: string;
  private identity: Promise<StoredIdentity> | null = null;
  private readonly conversationKeys = new Map<string, Promise<CryptoKey>>();

  constructor(userId: string) {
    if (!userId) throw new Error('A userId is required to encrypt messages.');
    this.userId = userId;
  }

  /**
   * Loads (or creates) this device's identity key pair and publishes the public key material the
   * key server needs. Safe to call repeatedly: the identity key is reused, while the signed and
   * one-time pre-keys are replenished.
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
  }

  /** Encrypts one message for a peer inside a match. */
  async encryptMessage(peerId: string, matchId: string, plaintext: string): Promise<string> {
    const key = await this.conversationKey(peerId, matchId);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(matchId) },
      key,
      new TextEncoder().encode(plaintext)
    );

    const envelope = new Uint8Array(1 + IV_BYTES + ciphertext.byteLength);
    envelope[0] = WIRE_VERSION;
    envelope.set(iv, 1);
    envelope.set(new Uint8Array(ciphertext), 1 + IV_BYTES);
    return toBase64(envelope.buffer);
  }

  /** Decrypts one message from a peer inside a match. Throws when authentication fails. */
  async decryptMessage(peerId: string, matchId: string, ciphertext: string): Promise<string> {
    const envelope = fromBase64(ciphertext);
    if (envelope.length <= 1 + IV_BYTES) {
      throw new Error('Message is malformed.');
    }
    if (envelope[0] !== WIRE_VERSION) {
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

  private async loadIdentity(): Promise<StoredIdentity> {
    if (!this.identity) {
      this.identity = (async () => {
        const db = await openDatabase();
        const existing = await readIdentity(db, this.userId);
        if (existing) return existing;

        const pair = await generateKeyPair();
        const identity: StoredIdentity = {
          userId: this.userId,
          privateKey: pair.privateKey,
          publicKey: pair.publicKey,
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
