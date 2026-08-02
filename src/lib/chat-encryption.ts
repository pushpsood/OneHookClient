import { ChatApi } from '../api/chat';

/**
 * Manages End-to-End Encryption (E2EE) using Signal Protocol concepts (X3DH &
 * Double Ratchet). In a production environment, this would use a real Signal
 * implementation (e.g. 'libsignal-protocol-javascript'); here the crypto is
 * mocked but the KEY-SERVER interactions mirror the real backend contract.
 *
 * Note: claiming a peer's pre-key bundle requires the shared `matchId` — the
 * backend authorizes the claim against a State-verified mutual match.
 */
export class ChatEncryptionManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initializes the user's identity and uploads PreKey bundles to the server (X3DH setup).
   */
  async initialize(): Promise<void> {
    // 1. Generate Identity Key Pair, Signed PreKey, and One-Time PreKeys
    const identityKey = this.generateKeyPair('identity');
    const signedPreKey = this.generateKeyPair('signed_prekey');
    const oneTimePreKeys = [
      this.generateKeyPair('opk_1'),
      this.generateKeyPair('opk_2'),
      this.generateKeyPair('opk_3'),
    ];

    // 2. Upload the public bundle to the backend (Keyserver)
    await ChatApi.uploadPreKeys(
      this.userId,
      identityKey.public,
      signedPreKey.public,
      oneTimePreKeys.map((k) => k.public)
    );

    // 3. Store private keys securely in IndexedDB/LocalStorage
    localStorage.setItem(`e2e_priv_${this.userId}`, identityKey.private);
  }

  /**
   * Encrypts a message for a specific recipient within a match. Performs X3DH
   * (claiming the recipient's pre-key bundle) if no session exists, then uses
   * Double Ratchet for subsequent messages.
   */
  async encryptMessage(recipientId: string, matchId: string, plaintext: string): Promise<string> {
    const sessionKey = `e2e_session_${matchId}_${recipientId}`;
    let session = localStorage.getItem(sessionKey);

    if (!session) {
      // Claim the recipient's PreKey bundle from the backend (requires matchId).
      const bundle = await ChatApi.claimPreKeyBundle(recipientId, matchId);

      // Perform DH exchange to derive initial shared secret.
      session = `session_derived_from_${(bundle.identityKey ?? '').slice(0, 8)}`;
      localStorage.setItem(sessionKey, session);
    }

    // Double Ratchet: Encrypt plaintext using the session's current chain key.
    const ciphertext = btoa(`enc(${session}):${plaintext}`);
    return ciphertext;
  }

  /**
   * Decrypts an incoming message.
   */
  async decryptMessage(senderId: string, matchId: string, ciphertext: string): Promise<string> {
    const sessionKey = `e2e_session_${matchId}_${senderId}`;
    const session = localStorage.getItem(sessionKey);

    if (!session) {
      // If we don't have a session, this might be the first message
      // (PreKeySignalMessage). We would normally process the X3DH headers here.
      return '[Encrypted Message - Session not established]';
    }

    try {
      const decoded = atob(ciphertext);
      if (decoded.startsWith(`enc(${session}):`)) {
        return decoded.replace(`enc(${session}):`, '');
      }
      return '[Decryption Error: Key Mismatch]';
    } catch (e) {
      return '[Decryption Error]';
    }
  }

  private generateKeyPair(label: string) {
    // Placeholder for Curve25519 key generation
    return {
      public: `pub_${label}_${Math.random().toString(36).substring(7)}`,
      private: `priv_${label}_${Math.random().toString(36).substring(7)}`,
    };
  }
}
