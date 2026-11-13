import { useEffect, useState } from 'react';
import type { DiscoveryCategory } from '../../api/matching';
import { useToast } from '../../components/common/Toast';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { CategoryChips, DiscoveryEmptyState } from '../discovery/DiscoveryEmptyState';

export const MATCHING_INTRO_COPY = {
  title: 'Matching is off',
  body: 'Turn it on to build a matching profile and meet new people. Your chats and hooks stay as they are.',
  turnOn: 'Turn on matching',
  shouldIJoin: 'Should I sign up for matching?',
  hide: 'Hide matching screen',
  erasing: 'Matching is being turned off. You can turn it on again once that finishes.',
  locked: 'Opt in to get access',
  hidden: 'Matching hidden. You can show it again in Settings > General.',
  hideFailed: 'We couldn’t hide Matching. Please try again.',
  guideTitle: 'Should I sign up for matching?',
  guideBody: 'We’re building a short guide to help you decide. Coming soon.',
} as const;

/** The categories Discover shows a member without a deck of their own: "For you" plus locked chips. */
const PREVIEW_CATEGORY: DiscoveryCategory = 'ALL';
const PREVIEW_AVAILABLE: DiscoveryCategory[] = ['ALL'];

/** The app's standard black, square-cornered primary button (same width for every action). */
const PRIMARY_BUTTON =
  'w-full py-4 bg-accent text-bg text-[11px] font-black uppercase tracking-[0.3em] rounded-none hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

/**
 * Discover's category chips as this member would see them ("For you" selected, the rest locked), but
 * every chip only reports matching_intro.locked_tap and calls `onLocked`.
 */
export function LockedDiscoverChips({ onLocked }: { onLocked: () => void }) {
  return (
    <CategoryChips
      value={PREVIEW_CATEGORY}
      available={PREVIEW_AVAILABLE}
      onPick={() => onLocked()}
      trackAttrsFor={() => trackProps(UiElement.MATCHING_INTRO_LOCKED_TAP)}
    />
  );
}

/**
 * The Matching tab of a chat-only member (screen MATCHING_INTRO): a locked preview of the real
 * Discover screen in its empty state, built from the same pieces (DiscoveryEmptyState, CategoryChips).
 * The empty state carries the "Matching is off" message and the three actions; every other control
 * looks the same as on Discover but only says "Opt in to get access" (tracked as
 * matching_intro.locked_tap, never as its discover.* id).
 *
 * It calls nothing itself: no /matching/* route may be called while matching is off, which is why the
 * real DiscoveryView (it reads the rose quota on mount) is not mounted here.
 */
export function MatchingIntroView({
  erasing,
  onTurnOn,
  onHide,
}: {
  /** Matching is ERASING after an opt-out: turning it on waits until that finishes. */
  erasing: boolean;
  /** Opens the matching profile builder. */
  onTurnOn: () => void;
  /** Hides the Matching tab (SetMatchingTabHidden), leaving Chat, Profile and Settings. */
  onHide: () => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGuideOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guideOpen]);

  const locked = () => showToast(MATCHING_INTRO_COPY.locked, 'info');

  return (
    <section aria-labelledby="matching-intro-title" className="h-full" data-testid="matching-intro">
      <DiscoveryEmptyState
        titleId="matching-intro-title"
        chips={<LockedDiscoverChips onLocked={locked} />}
        title={MATCHING_INTRO_COPY.title}
        message={MATCHING_INTRO_COPY.body}
      >
        {erasing && (
          <p className="text-xs text-text-secondary leading-relaxed" role="status">
            {MATCHING_INTRO_COPY.erasing}
          </p>
        )}
        <div className="pt-3 flex flex-col gap-3" data-testid="matching-intro-actions">
          <button
            type="button"
            onClick={onTurnOn}
            disabled={erasing}
            {...trackProps(UiElement.MATCHING_INTRO_TURN_ON)}
            className={PRIMARY_BUTTON}
          >
            {MATCHING_INTRO_COPY.turnOn}
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            {...trackProps(UiElement.MATCHING_INTRO_SHOULD_I_JOIN)}
            className={PRIMARY_BUTTON}
          >
            {MATCHING_INTRO_COPY.shouldIJoin}
          </button>
          <button
            type="button"
            onClick={onHide}
            {...trackProps(UiElement.MATCHING_INTRO_HIDE)}
            className={PRIMARY_BUTTON}
          >
            {MATCHING_INTRO_COPY.hide}
          </button>
        </div>
      </DiscoveryEmptyState>

      {guideOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setGuideOpen(false)}
          data-track-exempt="backdrop: click-away that closes the matching guide; the OK control (matching_intro.should_i_join dismiss) is tracked."
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="matching-guide-title"
            className="max-w-sm w-full bg-surface-card text-text border border-border p-6 space-y-4 shadow-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
          >
            <h2 id="matching-guide-title" className="text-lg font-bold">
              {MATCHING_INTRO_COPY.guideTitle}
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">{MATCHING_INTRO_COPY.guideBody}</p>
            <button
              type="button"
              autoFocus
              onClick={() => setGuideOpen(false)}
              {...trackProps(UiElement.MATCHING_INTRO_SHOULD_I_JOIN, { action: 'dismiss' })}
              className={PRIMARY_BUTTON}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
