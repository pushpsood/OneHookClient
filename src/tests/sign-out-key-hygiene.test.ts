import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Sign-out and account switching on the web key store.
 *
 *  - One page load must register ONE device, however many components build a manager at once
 *    (it used to register one per component; only the last device key survived in IndexedDB).
 *  - Signing out removes the account-history private key from IndexedDB, but only once this device
 *    can get it back through its own DEVICE wrap. Otherwise it is kept: it may be the only copy.
 *  - Accounts on the same browser never share a record.
 */

const api = vi.hoisted(() => ({
  registerDevice: vi.fn(),
  getSelfDevices: vi.fn(),
  getHistoryState: vi.fn(),
  putHistoryWrap: vi.fn(),
  establishHistoryEpoch: vi.fn(),
}));

vi.mock('../api/chat', () => ({ ChatApi: api }));

import {
  ChatEncryptionManager,
  resetSharedEncryptionState,
  secureHistoryKeyForSignOut,
} from '../lib/chat-encryption';

const USER_A = 'user-a';
const USER_B = 'user-b';

function readRecord(userId: string): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('onehook-e2ee', 3);
    open.onupgradeneeded = () => open.result.createObjectStore('identity-keys', { keyPath: 'userId' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const get = open.result.transaction('identity-keys', 'readonly').objectStore('identity-keys').get(userId);
      get.onsuccess = () => resolve(get.result as Record<string, unknown> | undefined);
      get.onerror = () => reject(get.error);
    };
  });
}

function writeRecord(record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('onehook-e2ee', 3);
    open.onupgradeneeded = () => open.result.createObjectStore('identity-keys', { keyPath: 'userId' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('identity-keys', 'readwrite');
      tx.objectStore('identity-keys').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Empties the store. Deleting the database would block: the app keeps its connection open. */
function clearStore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('onehook-e2ee', 3);
    open.onupgradeneeded = () => open.result.createObjectStore('identity-keys', { keyPath: 'userId' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('identity-keys', 'readwrite');
      tx.objectStore('identity-keys').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Gives a user's stored record a history private key, as after a QR or passkey restore. */
async function giveHistoryKey(userId: string, epoch = 1): Promise<void> {
  const record = (await readRecord(userId))!;
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ])) as CryptoKeyPair;
  record.historyKeyId = 'hk-1';
  record.historyEpoch = epoch;
  record.historyPrivateKey = pair.privateKey;
  record.historyPublicKey = pair.publicKey;
  record.historyPrivateKeyPkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  await writeRecord(record);
}

beforeEach(async () => {
  resetSharedEncryptionState();
  await clearStore();
  vi.clearAllMocks();
  api.registerDevice.mockResolvedValue({});
  api.getSelfDevices.mockResolvedValue({ devices: [] });
  api.putHistoryWrap.mockResolvedValue({});
});

describe('device creation', () => {
  it('registers ONE device when several managers initialise at once on a fresh browser', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });

    await Promise.all(
      Array.from({ length: 4 }, () => new ChatEncryptionManager(USER_A).initialize())
    );

    const deviceIds = new Set(api.registerDevice.mock.calls.map(([req]) => req.deviceId));
    expect(deviceIds.size).toBe(1);
    const stored = await readRecord(USER_A);
    expect(deviceIds.has(stored!.deviceId as string)).toBe(true);
  });

  it('keeps accounts on the same browser in separate records', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });
    await new ChatEncryptionManager(USER_A).initialize();
    await new ChatEncryptionManager(USER_B).initialize();

    const a = await readRecord(USER_A);
    const b = await readRecord(USER_B);
    expect(a?.deviceId).toBeTruthy();
    expect(b?.deviceId).toBeTruthy();
    expect(a?.deviceId).not.toBe(b?.deviceId);
  });
});

describe('sign-out', () => {
  it('drops the history private key when this device already has a DEVICE wrap, and keeps the device key', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });
    await new ChatEncryptionManager(USER_A).initialize();
    await giveHistoryKey(USER_A);
    const deviceId = (await readRecord(USER_A))!.deviceId as string;
    api.getHistoryState.mockResolvedValue({
      epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }],
      activeEpoch: 1,
      wraps: [{ epoch: 1, method: 'DEVICE', wrapId: deviceId, wrappedKey: 'sealed', createdAt: 1 }],
    });
    resetSharedEncryptionState();

    await secureHistoryKeyForSignOut(USER_A);

    const after = await readRecord(USER_A);
    expect(after?.historyPrivateKey).toBeUndefined();
    expect(after?.historyPrivateKeyPkcs8).toBeUndefined();
    expect(after?.devicePrivateKey).toBeTruthy();
    expect(after?.deviceId).toBe(deviceId);
    expect(after?.historyPublicKey).toBeTruthy();
    expect(api.putHistoryWrap).not.toHaveBeenCalled();
  });

  it('publishes the missing DEVICE wrap first, then drops the key', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });
    await new ChatEncryptionManager(USER_A).initialize();
    await giveHistoryKey(USER_A);
    const deviceId = (await readRecord(USER_A))!.deviceId as string;
    resetSharedEncryptionState();

    await secureHistoryKeyForSignOut(USER_A);

    expect(api.putHistoryWrap).toHaveBeenCalledTimes(1);
    expect(api.putHistoryWrap.mock.calls[0][0]).toMatchObject({ epoch: 1, method: 'DEVICE', wrapId: deviceId });
    expect((await readRecord(USER_A))?.historyPrivateKeyPkcs8).toBeUndefined();
  });

  it('KEEPS the key when the wrap cannot be published, since it may be the only copy', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });
    await new ChatEncryptionManager(USER_A).initialize();
    await giveHistoryKey(USER_A);
    api.putHistoryWrap.mockRejectedValue(new Error('offline'));
    resetSharedEncryptionState();

    await secureHistoryKeyForSignOut(USER_A);

    expect((await readRecord(USER_A))?.historyPrivateKeyPkcs8).toBeInstanceOf(Uint8Array);
  });

  it('KEEPS the key when history state cannot be read, and never hangs past the timeout', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });
    await new ChatEncryptionManager(USER_A).initialize();
    await giveHistoryKey(USER_A);
    api.getHistoryState.mockImplementation(() => new Promise(() => undefined));
    resetSharedEncryptionState();

    const started = Date.now();
    await secureHistoryKeyForSignOut(USER_A, 50);

    expect(Date.now() - started).toBeLessThan(1000);
    expect((await readRecord(USER_A))?.historyPrivateKeyPkcs8).toBeInstanceOf(Uint8Array);
  });

  it('does not touch another account on the same browser', async () => {
    api.getHistoryState.mockResolvedValue({ epochs: [{ epoch: 1, keyId: 'hk-1', publicKey: 'x', createdAt: 1 }], activeEpoch: 1, wraps: [] });
    await new ChatEncryptionManager(USER_A).initialize();
    await new ChatEncryptionManager(USER_B).initialize();
    await giveHistoryKey(USER_A);
    await giveHistoryKey(USER_B);
    resetSharedEncryptionState();

    await secureHistoryKeyForSignOut(USER_A);

    expect((await readRecord(USER_A))?.historyPrivateKeyPkcs8).toBeUndefined();
    expect((await readRecord(USER_B))?.historyPrivateKeyPkcs8).toBeInstanceOf(Uint8Array);
  });
});

describe('sign-out wiring', () => {
  const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  it('every web sign-out goes through CognitoAuthService.logout, which secures the history key first', () => {
    const auth = src('lib/cognito-auth.ts');
    const logout = auth.slice(auth.indexOf('async logout()'));
    expect(logout.indexOf('secureHistoryKeyForSignOut')).toBeGreaterThan(-1);
    expect(logout.indexOf('secureHistoryKeyForSignOut')).toBeLessThan(logout.indexOf('await signOut()'));
  });

  it('the set-password sign-out clears all app state, not just the auth flag', () => {
    const card = src('components/profile/SetPasswordCard.tsx');
    expect(card).toMatch(/useAppStore\.getState\(\)\.logout\(\)/);
    expect(card).not.toMatch(/setAuthenticated\(false\)/);
  });
});
