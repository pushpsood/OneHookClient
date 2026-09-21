import { Check } from 'lucide-react';
import { CHAT_WALLPAPERS, type ChatWallpaper } from '../../lib/chat-appearance';

/**
 * Reusable wallpaper swatch grid. Shared by the shield-menu "Choose wallpaper" modal and the chat
 * settings sheet — both drive the SAME shared store (see chat-appearance.ts) so they can never
 * disagree. Photos elsewhere in the app use aspect-[3/4]; the swatches match for visual consistency.
 */
export function WallpaperGrid({
  current,
  onChoose,
}: {
  current: ChatWallpaper;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CHAT_WALLPAPERS.map((w) => (
        <button
          key={w.id}
          onClick={() => onChoose(w.id)}
          className={`relative aspect-[3/4] overflow-hidden border transition-all ${
            current.id === w.id
              ? 'border-accent ring-2 ring-accent'
              : 'border-border hover:border-accent'
          }`}
          title={w.label}
          aria-pressed={current.id === w.id}
        >
          <span className={`absolute inset-0 ${w.swatchClass}`} aria-hidden="true" />
          <span className="absolute bottom-0 inset-x-0 bg-white/80 text-[9px] uppercase tracking-widest font-bold py-1 text-center">
            {w.label}
          </span>
          {current.id === w.id && (
            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
              <Check className="w-3 h-3" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
