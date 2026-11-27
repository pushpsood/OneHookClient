// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadMrOneHookPrefs, setMrOneHookPref } from '../lib/mr-onehook-prefs';
import { MrOneHookUploadManager, useMrOneHookUploadStore } from '../store/mr-onehook-upload-store';

beforeAll(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage?.setItem !== 'function') {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  }
});

describe('MrOneHookUploadManager & mr-onehook-prefs unit tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    MrOneHookUploadManager.syncOwner(undefined);
  });

  it('persists Mr.OneHook preferences independently per user id', () => {
    expect(loadMrOneHookPrefs('u1')).toEqual({
      asksInMessageMenus: true,
      answersContextRequests: true,
    });
    setMrOneHookPref('u1', 'asksInMessageMenus', false);
    setMrOneHookPref('u1', 'answersContextRequests', false);
    expect(loadMrOneHookPrefs('u1')).toEqual({
      asksInMessageMenus: false,
      answersContextRequests: false,
    });
    expect(loadMrOneHookPrefs('u2')).toEqual({
      asksInMessageMenus: true,
      answersContextRequests: true,
    });
  });

  it('manages upload tray items per owner and clears items on owner change', () => {
    MrOneHookUploadManager.syncOwner('u1');
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const rejections = MrOneHookUploadManager.addFiles(
      [{ name: 'note.txt', type: 'text/plain', size: 5, blob }],
      { maxAttachmentBytes: 5 * 1024 * 1024, maxAttachmentsPerMessage: 3 }
    );
    expect(rejections).toEqual([]);
    expect(useMrOneHookUploadStore.getState().items).toHaveLength(1);
    expect(useMrOneHookUploadStore.getState().items[0].name).toBe('note.txt');

    const localId = useMrOneHookUploadStore.getState().items[0].localId;
    MrOneHookUploadManager.remove(localId);
    expect(useMrOneHookUploadStore.getState().items).toHaveLength(0);

    MrOneHookUploadManager.addFiles(
      [{ name: 'note.txt', type: 'text/plain', size: 5, blob }],
      { maxAttachmentBytes: 5 * 1024 * 1024, maxAttachmentsPerMessage: 3 }
    );
    expect(useMrOneHookUploadStore.getState().items).toHaveLength(1);

    MrOneHookUploadManager.syncOwner('u2');
    expect(useMrOneHookUploadStore.getState().items).toHaveLength(0);
  });
});
