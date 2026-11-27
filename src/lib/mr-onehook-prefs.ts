/**
 * On-device Mr.OneHook preferences (mirrors iOS `MrOneHookPreferences.swift`):
 *  - `asksInMessageMenus`: show "Ask Mr.OneHook" in message actions / selection.
 *  - `answersContextRequests`: when Mr.OneHook asks for more context (`needs_more_context`),
 *    run the bounded on-device search and offer review. Off = reply as-is without searching.
 */
import { useEffect, useState } from 'react';

export interface MrOneHookPrefs {
  asksInMessageMenus: boolean;
  answersContextRequests: boolean;
}

export type MrOneHookPrefKey = keyof MrOneHookPrefs;

const DEFAULTS: MrOneHookPrefs = {
  asksInMessageMenus: true,
  answersContextRequests: true,
};

const EVENT = 'onehook:mr-onehook-prefs-changed';

function storageKey(userId: string, key: MrOneHookPrefKey): string {
  return `onehook.mrOneHook.prefs.${key}.${userId}`;
}

export function loadMrOneHookPrefs(userId?: string): MrOneHookPrefs {
  if (!userId || typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const read = (k: MrOneHookPrefKey) => {
      const raw = window.localStorage.getItem(storageKey(userId, k));
      return raw === null ? DEFAULTS[k] : raw === 'true';
    };
    return {
      asksInMessageMenus: read('asksInMessageMenus'),
      answersContextRequests: read('answersContextRequests'),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setMrOneHookPref(userId: string | undefined, key: MrOneHookPrefKey, value: boolean): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId, key), String(value));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }));
  } catch {
    /* ignore */
  }
}

export function useMrOneHookPrefs(userId?: string): [MrOneHookPrefs, (key: MrOneHookPrefKey, value: boolean) => void] {
  const [prefs, setPrefs] = useState<MrOneHookPrefs>(() => loadMrOneHookPrefs(userId));

  useEffect(() => {
    setPrefs(loadMrOneHookPrefs(userId));
    const onChange = () => setPrefs(loadMrOneHookPrefs(userId));
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [userId]);

  const update = (key: MrOneHookPrefKey, value: boolean) => {
    setMrOneHookPref(userId, key, value);
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  return [prefs, update];
}
