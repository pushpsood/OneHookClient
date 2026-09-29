import { Sun, Moon, Smartphone, Check } from 'lucide-react';
import { useTheme, type Theme } from '../../lib/theme';

export function AppearanceCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const options: Array<{
    id: Theme;
    label: string;
    description: string;
    icon: typeof Sun;
    previewBg: string;
    previewCard: string;
    previewText: string;
  }> = [
    {
      id: 'light',
      label: 'Light Mode',
      description: 'Classic clean white appearance',
      icon: Sun,
      previewBg: 'bg-[#FFFFFF] border-gray-300',
      previewCard: 'bg-[#FAFAFA]',
      previewText: 'text-[#262626]',
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      description: 'Immersive pitch black appearance',
      icon: Moon,
      previewBg: 'bg-[#000000] border-neutral-700',
      previewCard: 'bg-[#1a1a1a]',
      previewText: 'text-[#F5F5F5]',
    },
    {
      id: 'system',
      label: 'System Default',
      description: 'Automatically match device settings',
      icon: Smartphone,
      previewBg: 'bg-gradient-to-r from-white to-black border-gray-400',
      previewCard: 'bg-neutral-500/20',
      previewText: 'text-text',
    },
  ];

  return (
    <div className="bg-surface-card border border-border p-6 rounded-2xl space-y-5 select-none transition-colors">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-text">Display & Appearance</h3>
          <p className="text-xs text-text-secondary">
            Switch between light and dark themes for the app. The main website remains in standard light mode.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-text-secondary capitalize">
          {resolvedTheme} Mode
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {options.map((opt) => {
          const isSelected = theme === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={`relative flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-ig-blue ring-2 ring-ig-blue/20 bg-surface'
                  : 'border-border hover:border-text-secondary bg-surface-card'
              }`}
            >
              {/* Header with icon & check */}
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isSelected ? 'bg-ig-blue text-white' : 'bg-surface text-text-secondary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {isSelected && (
                  <span className="w-5 h-5 rounded-full bg-ig-blue text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>

              {/* Labels */}
              <span className="text-sm font-semibold text-text mb-0.5">{opt.label}</span>
              <span className="text-xs text-text-secondary leading-snug">{opt.description}</span>

              {/* Visual mini swatch preview */}
              <div
                className={`mt-4 w-full h-10 rounded-lg border p-1.5 flex gap-1.5 items-center ${opt.previewBg}`}
              >
                <div className={`w-3 h-3 rounded-full ${opt.previewCard}`} />
                <div className={`h-2 flex-1 rounded ${opt.previewCard}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
