import type { ReactNode } from 'react';
import { ArrowLeft, Sun, Moon } from 'lucide-react';
import { BrandWordmark } from '../components/common/BrandWordmark';
import { useTheme } from '../lib/theme';
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
  /** Whether the user is premium. */
  premium?: boolean;
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
  premium,
  centerContent,
}: TopBarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

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
            >
              <BrandWordmark className="text-xl sm:text-2xl font-bold tracking-tight text-text group-hover/logo:opacity-85 transition-opacity" text="OneHook" />
              {premium && (
                <span className="text-[9px] px-1.5 py-0.5 bg-accent text-bg rounded-full tracking-widest font-bold leading-none">
                  PRO
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute left-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/logo:opacity-100 transition-all duration-150 shadow-md z-50">
              {premium ? 'OneHook (PRO)' : 'OneHook Home'}
            </div>
          </div>
        </div>

        {/* Center: Controls from the second header */}
        <div
          id="topbar-center-slot"
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10 max-w-[65%]"
        >
          {centerContent}
        </div>

        {/* Top Right Corner: Only the light/dark mode toggle */}
        <div className="flex items-center z-10 shrink-0">
          <div className="relative group/theme flex items-center">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-5 h-5 stroke-[1.75] hover:rotate-12 transition-transform" />
              ) : (
                <Moon className="w-5 h-5 stroke-[1.75] hover:-rotate-12 transition-transform" />
              )}
            </button>
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/theme:opacity-100 transition-all duration-150 shadow-md z-50">
              {resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
