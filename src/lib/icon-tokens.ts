/**
 * Shared icon sizing and stroke-thickness tokens per UI section.
 *
 * Keeping size (`w-* h-*`), `shrink-0`, and stroke weight (`stroke-[*]`) standardized per section
 * prevents visual mismatches when sibling icons sit together in headers, sidebars, toolbars,
 * modal headers, and card sections.
 */
export const ICON_SECTION = {
  /** Top app chrome (`TopBar`, `SiteHeader`, injected TopBar portal controls, Chat header actions). */
  header: {
    icon: 'w-5 h-5 shrink-0 stroke-[1.75]',
    caret: 'w-3.5 h-3.5 shrink-0 stroke-[1.75]',
    pillIcon: 'w-3.5 h-3.5 shrink-0 stroke-[1.75]',
    menuItem: 'w-4 h-4 shrink-0 stroke-[1.75]',
    button:
      'w-9 h-9 flex items-center justify-center rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer',
  },
  /** Primary navigation rail (`DesktopSidebar`) and mobile bottom bar (`BottomTabBar`). */
  nav: {
    icon: 'w-6 h-6 shrink-0',
    inactiveStrokeWidth: 1.75,
    activeStrokeWidth: 2.25,
    fallbackUserIcon: 'w-3.5 h-3.5 shrink-0 stroke-[1.75] text-text-muted',
  },
  /** Secondary toolbars (Chat sub-header toolbar & call buttons, Discovery/Likes bars, Mr.OneHook bar). */
  toolbar: {
    subHeaderIcon: 'w-4 h-4 shrink-0 stroke-[1.75]',
    subHeaderButton:
      'w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
    lockBadge:
      'absolute -bottom-0.5 -right-0.5 w-3 h-3 shrink-0 stroke-[2.25] text-text-muted bg-surface-card rounded-full p-[1px]',
    pillIcon: 'w-3.5 h-3.5 shrink-0 stroke-[1.75]',
    pillButton:
      'w-8 h-8 rounded-full border border-border bg-surface hover:bg-surface-hover flex items-center justify-center text-text cursor-pointer',
  },
  /** Modal, drawer & sheet headers (`close`, `back`, `sort`, title leading icon). */
  modalHeader: {
    icon: 'w-4 h-4 shrink-0 stroke-[1.75]',
    button:
      'w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer',
    largeIcon: 'w-5 h-5 shrink-0 stroke-[1.75]',
  },
  /** Section headings & card/list row icons (`Profile`, `Settings`, `ContactInfo`, account cards). */
  section: {
    headingIcon: 'w-4 h-4 shrink-0 stroke-[1.75]',
    rowIcon: 'w-4 h-4 shrink-0 stroke-[1.75]',
    actionIcon: 'w-3.5 h-3.5 shrink-0 stroke-[1.75]',
    badgeIcon: 'w-3 h-3 shrink-0 stroke-[1.75]',
  },
  /** Chat composer, attachment menu, voice controls & message action menus. */
  composer: {
    triggerIcon: 'w-4 h-4 shrink-0 stroke-[1.75]',
    menuItemIcon: 'w-4 h-4 shrink-0 stroke-[1.75]',
    inlineActionIcon: 'w-3.5 h-3.5 shrink-0 stroke-[1.75]',
  },
} as const;
