import { useState } from 'react';
import { Compass, MessageCircle, Heart, Settings, LogOut } from 'lucide-react';
import { MediaImage } from '../components/common/MediaImage';
import type { AppTab } from './BottomTabBar';
import type { UserProfile } from '../types';
import { UiElement, APP_TAB_SCREEN, trackProps } from '../lib/analytics/analytics';

interface DesktopSidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  currentUser: UserProfile | null;
  likesCount?: number;
  unreadCount?: number;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
  onOpenCreate?: () => void;
}

export function DesktopSidebar({
  activeTab,
  onTabChange,
  currentUser,
  likesCount = 0,
  unreadCount = 0,
  onLogout,
}: DesktopSidebarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);
  const handleWheel = () => setIsHovered(true);

  const userPhoto = currentUser?.photos?.[0] || (currentUser as any)?.pictures?.[0];

  const navItems = [
    {
      id: 'DISCOVERY' as AppTab,
      label: 'Discover',
      icon: Compass,
      badge: 0,
    },
    {
      id: 'MATCHES' as AppTab,
      label: 'Messages',
      icon: MessageCircle,
      badge: unreadCount,
    },
    {
      id: 'LIKES' as AppTab,
      label: 'Likes',
      icon: Heart,
      badge: likesCount,
    },
    {
      id: 'PROFILE' as AppTab,
      label: 'Profile',
      isProfile: true,
      badge: 0,
    },
    {
      id: 'SETTINGS' as AppTab,
      label: 'Settings',
      icon: Settings,
      badge: 0,
    },
  ];

  return (
    <div
      className="hidden md:block relative w-18 shrink-0 select-none z-30"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onScroll={handleWheel}
    >
      <aside
        className={`flex flex-col justify-center h-[calc(100dvh-3.5rem)] fixed top-14 left-0 bg-surface-card border-r border-border py-4 px-2.5 z-30 transition-all duration-250 ease-out select-none ${
          isHovered ? 'w-60 shadow-2xl' : 'w-18'
        }`}
      >
        {/* Navigation items: Discover, Messages, Likes, Profile + Three-Line Menu (vertically centered) */}
        <div className="flex flex-col justify-center gap-2 my-auto w-full">
          <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
            {navItems.map((item, idx) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={`${item.label}-${idx}`}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  {...(item.id === 'SETTINGS'
                    ? trackProps(UiElement.PROFILE_SETTINGS_OPEN)
                    : trackProps(UiElement.NAV_TAB_SELECT, { value: APP_TAB_SCREEN[item.id] }))}
                  className={`relative flex items-center ${
                    isHovered ? 'justify-start px-3' : 'justify-center px-0'
                  } py-3 rounded-xl transition-all group cursor-pointer ${
                    isActive
                      ? 'font-bold text-text bg-surface-hover'
                      : 'text-text hover:bg-surface-hover font-normal'
                  }`}
                  title={!isHovered ? item.label : undefined}
                >
                  {/* Icon or Avatar */}
                  <div className="relative flex items-center justify-center shrink-0">
                    {item.isProfile ? (
                      <div
                        className={`w-6 h-6 rounded-full overflow-hidden border ${
                          isActive ? 'ring-2 ring-accent' : 'border-border'
                        }`}
                      >
                        {userPhoto ? (
                          <MediaImage
                            src={userPhoto}
                            alt={currentUser?.name || 'Profile'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-surface flex items-center justify-center text-[10px]">
                            👤
                          </div>
                        )}
                      </div>
                    ) : (
                      <Icon
                        className="w-6 h-6 transition-transform group-hover:scale-105"
                        strokeWidth={isActive ? 2.5 : 1.75}
                        fill={isActive && (item.id === 'LIKES' || item.id === 'DISCOVERY') ? 'currentColor' : 'none'}
                      />
                    )}

                    {/* Badge */}
                    {item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-surface-card">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>

                  {/* Text Label: shown only when hovered/scrolled on the side */}
                  {isHovered && (
                    <span className="ml-4 text-sm tracking-tight truncate animate-in fade-in duration-150">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Subtle separator */}
          <div className="h-[1px] bg-border/60 my-1 mx-1" />

          {/* Log out — takes the place of the former three-line menu. This control OPENS the logout
              confirmation dialog (it does not sign out directly), so it is reported as the nav-rail
              menu/dialog opener; the dialog's own "Log out" / "Keep me signed in" actions are tracked
              with settings.sign_out by LogoutConfirmDialog. */}
          <button
            type="button"
            onClick={onLogout}
            {...trackProps(UiElement.NAV_MENU_OPEN)}
            className={`w-full flex items-center ${
              isHovered ? 'justify-start px-3' : 'justify-center px-0'
            } py-3 rounded-xl transition-all text-red-500 hover:bg-surface-hover font-normal cursor-pointer`}
            title={!isHovered ? 'Log out' : undefined}
          >
            <LogOut className="w-6 h-6 shrink-0" strokeWidth={1.75} />
            {isHovered && (
              <span className="ml-4 text-sm tracking-tight animate-in fade-in duration-150">Log out</span>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
