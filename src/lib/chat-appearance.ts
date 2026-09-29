/**
 * Chat wallpaper store — a single source of truth for the chat background, shared by every surface
 * that can change it (the shield menu's "Choose wallpaper" and the chat-settings sheet) so the two
 * can never disagree.
 */
import { useEffect, useState } from 'react';

export interface ChatWallpaper {
  id: string;
  label: string;
  /** Tailwind classes that paint the wallpaper in both light and dark mode. */
  gradientClass: string;
  /** A small swatch class used in the picker preview. */
  swatchClass: string;
}

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  {
    id: 'paper',
    label: 'Paper',
    gradientClass: 'bg-bg',
    swatchClass: 'bg-bg border border-border',
  },
  {
    id: 'dawn',
    label: 'Dawn',
    gradientClass: 'bg-gradient-to-br from-rose-50 via-white to-white dark:from-rose-950/30 dark:via-bg dark:to-bg',
    swatchClass: 'bg-gradient-to-br from-rose-100 to-white dark:from-rose-900 dark:to-neutral-900',
  },
  {
    id: 'mist',
    label: 'Mist',
    gradientClass: 'bg-gradient-to-br from-slate-100 via-white to-white dark:from-slate-900/40 dark:via-bg dark:to-bg',
    swatchClass: 'bg-gradient-to-br from-slate-200 to-white dark:from-slate-800 dark:to-neutral-900',
  },
  {
    id: 'sand',
    label: 'Sand',
    gradientClass: 'bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-950/30 dark:via-bg dark:to-bg',
    swatchClass: 'bg-gradient-to-br from-amber-100 to-white dark:from-amber-900 dark:to-neutral-900',
  },
  {
    id: 'sage',
    label: 'Sage',
    gradientClass: 'bg-gradient-to-br from-emerald-50 via-white to-white dark:from-emerald-950/30 dark:via-bg dark:to-bg',
    swatchClass: 'bg-gradient-to-br from-emerald-100 to-white dark:from-emerald-900 dark:to-neutral-900',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    gradientClass: 'bg-gradient-to-br from-indigo-50 via-white to-rose-50 dark:from-indigo-950/30 dark:via-bg dark:to-rose-950/30',
    swatchClass: 'bg-gradient-to-br from-indigo-100 to-rose-100 dark:from-indigo-900 dark:to-rose-950',
  },
];

/**
 * The legibility scrim painted over the wallpaper and BEHIND the bubbles.
 * Light mode uses bg-white/70, Dark mode uses bg-black/60.
 */
export const WALLPAPER_SCRIM_CLASS = 'bg-white/70 dark:bg-black/60';

const DEFAULT_WALLPAPER_ID = 'paper';
const STORAGE_KEY = 'onehook.chat.wallpaper';
const CHANGE_EVENT = 'onehook:chat-wallpaper-changed';

export function getWallpaperById(id: string | null | undefined): ChatWallpaper {
  return CHAT_WALLPAPERS.find((w) => w.id === id) ?? CHAT_WALLPAPERS[0];
}

function readStoredWallpaperId(): string {
  if (typeof window === 'undefined') return DEFAULT_WALLPAPER_ID;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_WALLPAPER_ID;
  } catch {
    return DEFAULT_WALLPAPER_ID;
  }
}

/**
 * React hook exposing the shared wallpaper choice. All instances stay in sync via a same-tab custom
 * event and cross-tab `storage` events, so the shield menu and the settings sheet always agree.
 */
export function useChatWallpaper(): [ChatWallpaper, (id: string) => void] {
  const [id, setId] = useState<string>(readStoredWallpaperId);

  useEffect(() => {
    const sync = () => setId(readStoredWallpaperId());
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (typeof next === 'string') setId(next);
      else sync();
    };
    window.addEventListener(CHANGE_EVENT, onCustom as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onCustom as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = (next: string) => {
    setId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / disabled storage */
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  };

  return [getWallpaperById(id), update];
}
