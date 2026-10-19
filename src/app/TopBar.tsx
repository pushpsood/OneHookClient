import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Sun, Moon, Monitor, Check } from 'lucide-react';
import { BrandWordmark } from '../components/common/BrandWordmark';
import { useTheme } from '../lib/theme';
import { UiElement, trackProps } from '../lib/analytics/analytics';
import type { AppTab } from './BottomTabBar';

interface TopBarProps {
  activeTab?: AppTab;
  onNavigateToChat?: () => void;
  onNavigateToLikes?: () => void;
  onNavigateToDiscovery?: () => void;
  /** Shown on Profile tab only. */
  onOpenSettings?: () => void;
  /** Optional back button handler — shown when a sub-view is open (e.g., chat thread). */
  onBack?: () => void;
  /** Optional custom title to override the default tab-based title. */
  title?: string;
  /** Current user's profile photo for the wordmark area. */
  userPhoto?: string;
  /** Brand name of the caller's paid tier (Super / Infinity), or undefined on the free tier. */
  paidTierName?: string;
  /** Likes count badge */
  likesCount?: number;
  /** Unread messages count badge */
  unreadCount?: number;
  /** Optional center content */
  centerContent?: ReactNode;
}

export function TopBar({
  onNavigateToDiscovery,
  onBack,
  paidTierName,
  centerContent,
}: TopBarProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close the theme menu on an outside click.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeOpen(false);
      }
    }
    if (isThemeOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isThemeOpen]);

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'Use device settings', icon: Monitor },
  ];
  const TriggerIcon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  const triggerTitle =
    theme === 'system' ? 'Appearance: device settings' : `Appearance: ${resolvedTheme}`;

  return (
    <header className="sticky top-0 z-40 w-full bg-surface-card/95 backdrop-blur-md border-b border-border shrink-0 select-none">
      <div className="relative flex items-center justify-between h-14 px-4 sm:px-6 w-full">
        {/* Left side: Back button (if present) + OneHook Logo */}
        <div className="flex items-center gap-2 min-w-0 z-10 shrink-0">
          {onBack ? (
            <div className="relative group/back flex items-center">
              <button
                type="button"
                onClick={onBack}
                aria-label="Go back"
                title="Go back"
                {...trackProps(UiElement.NAV_BACK)}
                className="w-9 h-9 flex items-center justify-center text-text hover:bg-surface-hover rounded-xl transition-colors cursor-pointer -ml-1"
              >
                <ArrowLeft className="w-5 h-5 stroke-[1.75]" />
              </button>
              <div className="pointer-events-none absolute left-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/back:opacity-100 transition-all duration-150 shadow-md z-50">
                Go back
              </div>
            </div>
          ) : null}

          <div className="relative group/logo flex items-center">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => onNavigateToDiscovery?.()}
              title="OneHook Home"
              aria-label="OneHook Home"
              {...trackProps(UiElement.NAV_HOME_LOGO)}
            >
              <BrandWordmark className="text-xl sm:text-2xl font-bold tracking-tight text-text group-hover/logo:opacity-85 transition-opacity" text="OneHook" />
              {paidTierName && (
                <span className="text-[9px] px-1.5 py-0.5 bg-accent text-bg rounded-full tracking-widest font-bold leading-none uppercase">
                  {paidTierName}
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute left-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/logo:opacity-100 transition-all duration-150 shadow-md z-50">
              {paidTierName ? `OneHook ${paidTierName}` : 'OneHook Home'}
            </div>
          </div>
        </div>

        {/* Center: Controls from the second header */}
        <div
          id="topbar-center-slot"
          // Center within the CONTENT AREA (right of the desktop nav rail), not the whole window. The
          // rail (DesktopSidebar) is w-18 (4.5rem) and only present at md+, so shift the center point
          // right by half the rail (2.25rem) from md up; on mobile (no rail) it stays window-centered.
          className="absolute left-1/2 md:left-[calc(50%+2.25rem)] -translate-x-1/2 flex items-center justify-center z-10 max-w-[65%]"
        >
          {centerContent}
        </div>

        {/* Top Right Corner: Appearance control (Light / Dark / Use device settings) */}
        <div className="flex items-center z-10 shrink-0">
          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              onClick={() => setIsThemeOpen((open) => !open)}
              aria-label="Change appearance"
              aria-haspopup="menu"
              aria-expanded={isThemeOpen}
              title={triggerTitle}
              {...trackProps(UiElement.SETTINGS_THEME_OPEN)}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <TriggerIcon className="w-5 h-5 stroke-[1.75]" />
            </button>

            {isThemeOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-56 bg-surface-card border border-border rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Appearance
                </p>
                {themeOptions.map((option) => {
                  const OptionIcon = option.icon;
                  const isActive = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => {
                        setTheme(option.value);
                        setIsThemeOpen(false);
                      }}
                      {...trackProps(UiElement.SETTINGS_THEME_SELECT, { value: option.value })}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                        isActive ? 'bg-surface-hover font-semibold text-text' : 'text-text hover:bg-surface-hover'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <OptionIcon className="w-4 h-4 shrink-0" />
                        {option.label}
                      </span>
                      {isActive && <Check className="w-4 h-4 shrink-0 text-accent" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
