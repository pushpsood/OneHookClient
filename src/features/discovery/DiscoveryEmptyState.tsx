import type { ReactNode } from 'react';
import type { DiscoveryCategory } from '../../api/matching';
import { LockIcon } from '../../components/common/LockedFeature';

/**
 * Presentational pieces of Discover's empty ("no one new") state, shared by the real Discover screen
 * (DiscoveryView) and the chat-only member's locked preview of it (MatchingIntroView), so the two
 * stay identical. Neither piece calls an API or tracks anything itself: the owner passes behaviour
 * and telemetry in.
 */

export const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  ALL: 'For you',
  PROFILE_MATCH: 'Matches your preferences',
  ONEHOOK_SUGGESTED: 'Mr. OneHook picks',
  SIMILAR: 'Similar to your likes',
};

/** Every discovery category, in display order. */
export const ALL_CATEGORIES: DiscoveryCategory[] = ['ALL', 'PROFILE_MATCH', 'ONEHOOK_SUGGESTED', 'SIMILAR'];

/**
 * The discovery category chips. Categories outside `available` (from the backend, by tier) stay
 * visible with a lock. `onPick` gets whether the chip is open; `trackAttrsFor` gives each chip's
 * telemetry attributes (a `trackProps(...)` result).
 */
export function CategoryChips({
  value,
  available,
  onPick,
  trackAttrsFor,
}: {
  value: DiscoveryCategory;
  available: DiscoveryCategory[];
  onPick: (option: DiscoveryCategory, open: boolean) => void;
  trackAttrsFor: (option: DiscoveryCategory, open: boolean) => Record<string, string>;
}) {
  const open = new Set<DiscoveryCategory>(available.length ? available : ['ALL']);
  const options = [...ALL_CATEGORIES, ...available.filter((c) => !ALL_CATEGORIES.includes(c))];
  return (
    <div role="tablist" aria-label="Discovery category" className="flex gap-2 overflow-x-auto no-scrollbar">
      {options.map((option) => {
        const isOpen = open.has(option);
        const trackAttrs = trackAttrsFor(option, isOpen);
        const label = CATEGORY_LABELS[option] ?? option;
        return isOpen ? (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={option === value}
            onClick={() => onPick(option, true)}
            {...trackAttrs}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              option === value
                ? 'bg-ig-blue text-white border-ig-blue'
                : 'bg-surface border-border text-text-secondary hover:text-text'
            }`}
          >
            {label}
          </button>
        ) : (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={false}
            aria-label={`${label}, locked`}
            data-locked="true"
            onClick={() => onPick(option, false)}
            {...trackAttrs}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-border text-text-muted bg-surface cursor-pointer"
          >
            <LockIcon />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Discover's empty state: the category chips above a centred title and message. `children` (the
 * preview's buttons) go under the message; the real screen passes none.
 */
export function DiscoveryEmptyState({
  chips,
  title,
  message,
  titleId,
  children,
}: {
  chips: ReactNode;
  title: ReactNode;
  message: ReactNode;
  titleId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg text-text p-6 gap-6">
      {chips}
      <div className="max-w-sm w-full text-center space-y-3">
        <h2 id={titleId} className="text-lg font-semibold text-text">
          {title}
        </h2>
        <p className="text-sm text-text-secondary">{message}</p>
        {children}
      </div>
    </div>
  );
}
