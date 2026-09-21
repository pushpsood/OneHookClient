/**
 * Chat wallpaper store — a single source of truth for the chat background, shared by every surface
 * that can change it (the shield menu's "Choose wallpaper" and the chat-settings sheet) so the two
 * can never disagree.
 *
 * The wallpapers are pure CSS gradients built from Tailwind's palette — no image assets — and are
 * always LIGHT/subtle on purpose. The message area paints a translucent white **scrim**
 * ({@link WALLPAPER_SCRIM_CLASS}) over the wallpaper before the bubbles, so the ambient area stays
 * bright enough that the app's dark-on-light text and muted labels keep a contrast ratio ≥ 4.5:1
 * (WCAG 1.4.3 Contrast (Minimum)). Because the bubbles themselves are opaque (near-black `bg-accent`
 * with white text, or `#F2F2F2` with near-black text), their internal contrast is unaffected by the
 * wallpaper; the scrim protects the text that sits directly on the background.
 */
import { useEffect, useState } from 'react';

export interface ChatWallpaper {
  id: string;
  label: string;
  /** Tailwind classes that paint the wallpaper. Kept light so the scrim preserves text contrast. */
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
    gradientClass: 'bg-gradient-to-br from-rose-50 via-white to-white',
    swatchClass: 'bg-gradient-to-br from-rose-100 to-white',
  },
  {
    id: 'mist',
    label: 'Mist',
    gradientClass: 'bg-gradient-to-br from-slate-100 via-white to-white',
    swatchClass: 'bg-gradient-to-br from-slate-200 to-white',
  },
  {
    id: 'sand',
    label: 'Sand',
    gradientClass: 'bg-gradient-to-br from-amber-50 via-white to-white',
    swatchClass: 'bg-gradient-to-br from-amber-100 to-white',
  },
  {
    id: 'sage',
    label: 'Sage',
    gradientClass: 'bg-gradient-to-br from-emerald-50 via-white to-white',
    swatchClass: 'bg-gradient-to-br from-emerald-100 to-white',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    gradientClass: 'bg-gradient-to-br from-indigo-50 via-white to-rose-50',
    swatchClass: 'bg-gradient-to-br from-indigo-100 to-rose-100',
  },
];

/**
 * The legibility scrim painted over the wallpaper and BEHIND the bubbles. Tuned so every wallpaper
 * above stays light enough to keep dark-on-light text ≥ 4.5:1 (WCAG 1.4.3). Do not lower the opacity
 * without re-checking contrast.
 */
export const WALLPAPER_SCRIM_CLASS = 'bg-white/70';

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
