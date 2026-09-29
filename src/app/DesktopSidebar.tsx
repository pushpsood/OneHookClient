import { useState, useRef, useEffect } from 'react';
import {
  Compass,
  MessageCircle,
  Heart,
  Menu,
  Moon,
  Sun,
  Settings,
  LogOut,
  Sparkles,
  Shield,
} from 'lucide-react';
import { MediaImage } from '../components/common/MediaImage';
import { useTheme } from '../lib/theme';
import type { AppTab } from './BottomTabBar';
import type { UserProfile } from '../types';

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
  onOpenSettings,
}: DesktopSidebarProps) {
  const { resolvedTheme, toggleTheme, theme, setTheme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isAppearanceSubmenu, setIsAppearanceSubmenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close popup menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
        setIsAppearanceSubmenu(false);
        setIsHovered(false);
      }
    }
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreOpen]);

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    if (!isMoreOpen) {
      setIsHovered(false);
    }
  };
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

          {/* Three-Line Menu (Hamburger) & Popover */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsMoreOpen(!isMoreOpen);
                setIsAppearanceSubmenu(false);
              }}
              className={`w-full flex items-center ${
                isHovered ? 'justify-start gap-4 px-3' : 'justify-center px-0'
              } py-3 rounded-xl transition-all cursor-pointer ${
                isMoreOpen ? 'bg-surface-hover font-bold text-text' : 'text-text hover:bg-surface-hover font-normal'
              }`}
              title={!isHovered ? 'Menu' : undefined}
            >
              <Menu className="w-6 h-6 shrink-0" strokeWidth={isMoreOpen ? 2.5 : 1.75} />
              {isHovered && <span className="ml-4 text-sm tracking-tight animate-in fade-in duration-150">Menu</span>}
            </button>

            {/* Popover Menu */}
            {isMoreOpen && (
              <div className="absolute bottom-14 left-0 w-64 bg-surface-card border border-border rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                {!isAppearanceSubmenu ? (
                  <div className="flex flex-col text-sm text-text">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSettings?.();
                        setIsMoreOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors text-left cursor-pointer"
                    >
                      <Settings className="w-4 h-4 shrink-0" />
                      <span>Settings</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAppearanceSubmenu(true)}
                      className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {resolvedTheme === 'dark' ? (
                          <Moon className="w-4 h-4 shrink-0" />
                        ) : (
                          <Sun className="w-4 h-4 shrink-0" />
                        )}
                        <span>Switch appearance</span>
                      </div>
                      <span className="text-xs text-text-secondary capitalize">{resolvedTheme}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onTabChange('DISCOVERY');
                        setIsMoreOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors text-left cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Your activity</span>
                    </button>

                    <div className="h-[1px] bg-border my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreOpen(false);
                        onLogout();
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-hover text-red-500 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Log out</span>
                    </button>
                  </div>
                ) : (
                  /* Appearance Submenu */
                  <div className="flex flex-col text-sm text-text">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border mb-1">
                      <button
                        type="button"
                        onClick={() => setIsAppearanceSubmenu(false)}
                        className="text-xs text-text-secondary hover:text-text cursor-pointer"
                      >
                        ← Back
                      </button>
                      <span className="font-semibold text-xs ml-2">Switch appearance</span>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors">
                      <span className="text-sm font-medium">Dark mode</span>
                      <button
                        type="button"
                        onClick={toggleTheme}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                          resolvedTheme === 'dark' ? 'bg-ig-blue justify-end' : 'bg-border justify-start'
                        }`}
                      >
                        <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 px-2 pt-1 pb-2">
                      <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer ${
                          theme === 'light' ? 'bg-surface-hover font-semibold' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Sun className="w-3.5 h-3.5" /> Light
                        </span>
                        {theme === 'light' && <span>✓</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer ${
                          theme === 'dark' ? 'bg-surface-hover font-semibold' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Moon className="w-3.5 h-3.5" /> Dark
                        </span>
                        {theme === 'dark' && <span>✓</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => setTheme('system')}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer ${
                          theme === 'system' ? 'bg-surface-hover font-semibold' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5" /> Use device settings
                        </span>
                        {theme === 'system' && <span>✓</span>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
