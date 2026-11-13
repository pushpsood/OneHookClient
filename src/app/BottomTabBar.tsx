import { Home, MessageCircle, Search, Clapperboard, Settings, Heart } from 'lucide-react';
import { MediaImage } from '../components/common/MediaImage';
import { UiElement, APP_TAB_SCREEN, trackProps } from '../lib/analytics/analytics';
import type { AppTab } from '../lib/app-mode';

export type { AppTab } from '../lib/app-mode';

interface BottomTabBarProps {
  activeTab: AppTab;
  /** Tabs the shell has for the member's matching mode (lib/app-mode.ts `appTabsFor`). */
  tabs: readonly AppTab[];
  onTabChange: (tab: AppTab) => void;
  /** Number of unread likes to show as a badge on the Likes tab. */
  likesCount?: number;
  /** Number of unread messages to show as a badge on the Chat tab. */
  unreadCount?: number;
  /** Current user profile photo for avatar in profile tab */
  userPhoto?: string;
  onOpenSearch?: () => void;
  onOpenCreate?: () => void;
}

export function BottomTabBar({
  activeTab,
  tabs,
  onTabChange,
  unreadCount = 0,
  userPhoto,
  onOpenSearch,
}: BottomTabBarProps) {
  // Discovery, its search and its reels shortcut exist only while matching is ON.
  const discovery = tabs.includes('DISCOVERY');
  // The Matching intro exists only while matching is NOT on (chat-only members).
  const matchingIntro = tabs.includes('MATCHING_INTRO');
  return (
    <nav
      className="md:hidden sticky bottom-0 z-50 bg-surface-card border-t border-border flex items-center justify-around shrink-0 select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile Navigation"
    >
      {/* Matching intro (chat-only members): first, before Chat */}
      {matchingIntro && (
      <button
        type="button"
        onClick={() => onTabChange('MATCHING_INTRO')}
        aria-label="Matching"
        {...trackProps(UiElement.NAV_TAB_SELECT, { value: APP_TAB_SCREEN.MATCHING_INTRO })}
        className={`relative flex items-center justify-center p-3 flex-1 min-h-[48px] transition-colors cursor-pointer ${
          activeTab === 'MATCHING_INTRO' ? 'text-text' : 'text-text-muted hover:text-text'
        }`}
      >
        <Heart
          className="w-6 h-6"
          strokeWidth={activeTab === 'MATCHING_INTRO' ? 2.5 : 1.75}
          fill={activeTab === 'MATCHING_INTRO' ? 'currentColor' : 'none'}
        />
      </button>
      )}

      {/* Home / Feed */}
      {discovery && (
      <button
        type="button"
        onClick={() => onTabChange('DISCOVERY')}
        aria-label="Home"
        {...trackProps(UiElement.NAV_TAB_SELECT, { value: APP_TAB_SCREEN.DISCOVERY })}
        className={`relative flex items-center justify-center p-3 flex-1 min-h-[48px] transition-colors cursor-pointer ${
          activeTab === 'DISCOVERY' ? 'text-text' : 'text-text-muted hover:text-text'
        }`}
      >
        <Home
          className="w-6 h-6"
          strokeWidth={activeTab === 'DISCOVERY' ? 2.5 : 1.75}
          fill={activeTab === 'DISCOVERY' ? 'currentColor' : 'none'}
        />
      </button>
      )}

      {/* Search / Explore */}
      {discovery && (
      <button
        type="button"
        onClick={() => {
          if (onOpenSearch) {
            onOpenSearch();
          } else {
            onTabChange('DISCOVERY');
          }
        }}
        aria-label="Search"
        {...trackProps(UiElement.NAV_SEARCH_OPEN)}
        className="relative flex items-center justify-center p-3 flex-1 min-h-[48px] text-text-muted hover:text-text transition-colors cursor-pointer"
      >
        <Search className="w-6 h-6" strokeWidth={1.75} />
      </button>
      )}

      {/* Reels / Video Explore */}
      {discovery && (
      <button
        type="button"
        onClick={() => onTabChange('DISCOVERY')}
        aria-label="Reels"
        {...trackProps(UiElement.NAV_TAB_SELECT, { value: APP_TAB_SCREEN.DISCOVERY })}
        className="relative flex items-center justify-center p-3 flex-1 min-h-[48px] text-text-muted hover:text-text transition-colors cursor-pointer"
      >
        <Clapperboard className="w-6 h-6" strokeWidth={1.75} />
      </button>
      )}

      {/* Messages */}
      <button
        type="button"
        onClick={() => onTabChange('MATCHES')}
        aria-label="Messages"
        {...trackProps(UiElement.NAV_TAB_SELECT, { value: APP_TAB_SCREEN.MATCHES })}
        className={`relative flex items-center justify-center p-3 flex-1 min-h-[48px] transition-colors cursor-pointer ${
          activeTab === 'MATCHES' ? 'text-text' : 'text-text-muted hover:text-text'
        }`}
      >
        <MessageCircle
          className="w-6 h-6"
          strokeWidth={activeTab === 'MATCHES' ? 2.5 : 1.75}
          fill={activeTab === 'MATCHES' ? 'currentColor' : 'none'}
        />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-4 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Profile */}
      <button
        type="button"
        onClick={() => onTabChange('PROFILE')}
        aria-label="Profile"
        {...trackProps(UiElement.NAV_TAB_SELECT, { value: APP_TAB_SCREEN.PROFILE })}
        className="relative flex items-center justify-center p-3 flex-1 min-h-[48px] cursor-pointer"
      >
        <div
          className={`w-6 h-6 rounded-full overflow-hidden border ${
            activeTab === 'PROFILE' ? 'ring-2 ring-accent border-transparent' : 'border-border'
          }`}
        >
          {userPhoto ? (
            <MediaImage
              src={userPhoto}
              alt="Me"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-surface flex items-center justify-center text-[10px]">
              👤
            </div>
          )}
        </div>
      </button>

      {/* Settings */}
      <button
        type="button"
        onClick={() => onTabChange('SETTINGS')}
        aria-label="Settings"
        {...trackProps(UiElement.PROFILE_SETTINGS_OPEN)}
        className={`relative flex items-center justify-center p-3 flex-1 min-h-[48px] transition-colors cursor-pointer ${
          activeTab === 'SETTINGS' ? 'text-text' : 'text-text-muted hover:text-text'
        }`}
      >
        <Settings
          className="w-6 h-6"
          strokeWidth={activeTab === 'SETTINGS' ? 2.5 : 1.75}
        />
      </button>
    </nav>
  );
}
