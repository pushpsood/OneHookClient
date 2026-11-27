import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Heart, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SubscriptionTier, type DiscoveryCandidate, type UserProfile } from '../../types';
import type { ApiError } from '../../lib/api-client';
import { errorMessage } from '../../lib/api-errors';
import { DISCOVER_LOAD_FAILED_COPY } from '../../hooks/use-api';
import type { LikeTargetType } from '../../api/rest';
import { MatchingApi, type DiscoveryCategory } from '../../api/matching';
import { useAppStore } from '../../store/app-store';
import { useArchiveStore } from '../../store/archive-store';
import {
  buildHookFormingPrompt,
  markFirstLikeConfirmedToday,
  totalPendingCount,
  type HookFormingPromptSpec,
} from '../../lib/hook-forming-guard';
import { HookFormingGuardDialog } from '../chat/LetHookGoDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { UpgradeDialog } from '../../components/common/LockedFeature';
import { CATEGORY_LABELS, CategoryChips, DiscoveryEmptyState } from './DiscoveryEmptyState';
import { DiscoveryCard } from './DiscoveryCard';
import { CommentComposer } from './CommentComposer';
import { LikesYouView } from './LikesYouView';
import { BoostDialog, BoostHeaderPill, PendingNoticeDialog } from './WalletDialogs';
import type { LikeTarget } from './like-target';
import { trackCardImpression, trackCardSwipe, UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

/**
 * DiscoveryView — ONE profile at a time, matched to the iOS discovery experience.
 *
 * There is intentionally no stories tray, no "suggested for you" sidebar, and no prev/next skipping:
 * the only way past the current profile is to act on it — PASS, LIKE (comment on an element), or
 * ROSE (a daily-limited super-like on the whole profile). Acting removes the profile from the deck,
 * so the next one appears. This mirrors iOS's single-card deck and keeps discovery deliberate.
 */
export function DiscoveryView({
  candidates,
  loading,
  error,
  onRetry,
  onPass,
  onLike,
  onNavigateToProfile,
  onOpenPreferences,
  onOpenRequests,
  onOpenArchives,
  onMatched,
  category = 'ALL',
  availableCategories = ['ALL'],
  onCategoryChange,
}: {
  key?: string;
  candidates: DiscoveryCandidate[];
  loading: boolean;
  error?: ApiError | null;
  /** Accepted for API compatibility; not used in the single-profile layout. */
  currentUser?: UserProfile | null;
  onRetry: () => void;
  /** PASS the candidate (LEFT). */
  onPass: (targetId: string) => Promise<boolean>;
  /** LIKE/ROSE the candidate (RIGHT) with a comment on a specific element (or the whole profile for a rose). */
  onLike: (
    targetId: string,
    comment: string,
    likeTargetType: LikeTargetType,
    likeTargetRef?: string,
    likeKind?: 'LIKE' | 'ROSE'
  ) => Promise<boolean>;
  onNavigateToProfile?: () => void;
  onOpenPreferences?: () => void;
  onOpenRequests?: () => void;
  onOpenArchives?: () => void;
  onMatched?: (matchId?: string) => Promise<void> | void;
  /** Applied discovery category and the ones this member may pick (from the backend). */
  category?: DiscoveryCategory;
  availableCategories?: DiscoveryCategory[];
  onCategoryChange?: (category: DiscoveryCategory) => void;
}) {
  const userState = useAppStore((s) => s.userState);
  const allowance = useArchiveStore((s) => s.list?.allowance);
  const tier = userState?.subscriptionTier ?? SubscriptionTier.MUST;
  const [mode, setMode] = useState<'matches' | 'likes'>('matches');
  const [pendingLikesCount, setPendingLikesCount] = useState(0);
  const [boostOpen, setBoostOpen] = useState(false);
  const [pendingNoticeOpen, setPendingNoticeOpen] = useState(false);
  const [undoUpgradeOpen, setUndoUpgradeOpen] = useState(false);
  const [guardPrompt, setGuardPrompt] = useState<HookFormingPromptSpec | null>(null);
  const [pendingComment, setPendingComment] = useState<string | null>(null);

  // The element being commented on (composer open). `kind` distinguishes a normal like from a rose.
  const [activeComposer, setActiveComposer] = useState<{
    candidateId: string;
    target: LikeTarget;
    displayName: string;
    kind: 'like' | 'rose';
  } | null>(null);

  // Acted-on candidate ids disappear from the deck — the only way to advance.
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [passStack, setPassStack] = useState<string[]>([]);
  const [rosesRemaining, setRosesRemaining] = useState<number | null>(null);

  const visibleCandidates = candidates.filter((c) => !passedIds.has(c.id));
  const currentCandidate = visibleCandidates[0] || null;
  const pendingTotal = totalPendingCount(userState?.pending);

  // Remaining daily roses + pending received likes count (best-effort).
  useEffect(() => {
    let active = true;
    MatchingApi.rosesRemaining()
      .then((r) => active && setRosesRemaining(r.remaining))
      .catch(() => undefined);
    MatchingApi.pendingLikeCount()
      .then((r) => active && setPendingLikesCount(r.received ?? 0))
      .catch(() => undefined);
    const onLikesUpdated = () => {
      MatchingApi.pendingLikeCount()
        .then((r) => active && setPendingLikesCount(r.received ?? 0))
        .catch(() => undefined);
    };
    window.addEventListener('onehook:likes-updated', onLikesUpdated);
    return () => {
      active = false;
      window.removeEventListener('onehook:likes-updated', onLikesUpdated);
    };
  }, []);

  // Impression for the currently shown profile, emitted with its dwell (time on screen) when the
  // card is replaced or the view unmounts — this `durationMs` drives GCP's dwell-velocity scoring.
  useEffect(() => {
    if (!currentCandidate || mode !== 'matches') return;
    const id = currentCandidate.id;
    const shownAt = Date.now();
    return () => {
      trackCardImpression(id, 0, Date.now() - shownAt);
    };
  }, [currentCandidate?.id, mode]);

  const nameOf = (c: DiscoveryCandidate) =>
    (c as { displayName?: string }).displayName || c.name || 'this person';

  const advance = (id: string, recordUndo = false) => {
    setPassedIds((prev) => new Set(prev).add(id));
    if (recordUndo) setPassStack((prev) => [...prev, id]);
  };

  const handlePass = async () => {
    if (!currentCandidate) return;
    const targetId = currentCandidate.id;
    trackCardSwipe('left', targetId);
    advance(targetId, true);
    try {
      await onPass(targetId);
    } catch (err) {
      console.warn('Pass error in background:', err);
    }
  };

  const handleUndo = () => {
    if (passStack.length === 0) return;
    if (tier === SubscriptionTier.MUST) {
      setUndoUpgradeOpen(true);
      return;
    }
    const lastId = passStack[passStack.length - 1];
    setPassStack((prev) => prev.slice(0, -1));
    setPassedIds((prev) => {
      const next = new Set(prev);
      next.delete(lastId);
      return next;
    });
  };

  const handleOpenComposer = (target: LikeTarget) => {
    if (!currentCandidate) return;
    setActiveComposer({ candidateId: currentCandidate.id, target, displayName: nameOf(currentCandidate), kind: 'like' });
  };

  const handleRose = () => {
    if (!currentCandidate || rosesRemaining === 0) return;
    trackCardSwipe('up', currentCandidate.id); // 'up' = super/rose
    setActiveComposer({
      candidateId: currentCandidate.id,
      // A rose is on the whole profile (BIO target, like iOS's rose composer).
      target: { type: 'BIO', label: 'Profile', preview: currentCandidate.bio },
      displayName: nameOf(currentCandidate),
      kind: 'rose',
    });
  };

  const sendLikeNow = async (comment: string) => {
    if (!activeComposer) return;
    const { candidateId, target, kind } = activeComposer;
    // Throws propagate to the composer so a rejected like/rose keeps it open and does NOT advance.
    await onLike(candidateId, comment, target.type, target.ref, kind === 'rose' ? 'ROSE' : 'LIKE');
    trackCardSwipe(kind === 'rose' ? 'up' : 'right', candidateId);
    if (kind === 'rose') {
      setRosesRemaining((n) => (typeof n === 'number' ? Math.max(0, n - 1) : n));
    }
    setActiveComposer(null);
    advance(candidateId, false);
  };

  const handleSubmitComment = async (comment: string) => {
    if (!activeComposer) return;
    const firstLikePrompt = buildHookFormingPrompt('firstLike', userState, allowance, activeComposer.displayName);
    if (firstLikePrompt) {
      setPendingComment(comment);
      setGuardPrompt(firstLikePrompt);
      return;
    }
    await sendLikeNow(comment);
  };

  // Every member sees every category. The ones their tier does not include carry a lock and open the
  // upgrade prompt; the backend's availableCategories decides which are open.
  const selector = onCategoryChange ? (
    <CategorySelector value={category} available={availableCategories} onChange={onCategoryChange} />
  ) : null;

  const headerBar = (
    <div className="w-full max-w-[500px] mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
      <div role="tablist" aria-label="Discover mode" className="inline-flex p-0.5 rounded-full border border-border bg-surface">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'matches'}
          onClick={() => setMode('matches')}
          // TODO(telemetry-parity): switch to UiElement.DISCOVER_MODE_SELECT once enabled on web.
          data-track-exempt="disabled: pending telemetry web parity enablement for discover.mode_select"
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'matches' ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text'
          }`}
        >
          <Sparkles className={ICON_SECTION.toolbar.pillIcon} aria-hidden="true" /> Matches
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'likes'}
          onClick={() => setMode('likes')}
          // TODO(telemetry-parity): switch to UiElement.DISCOVER_MODE_SELECT once enabled on web.
          data-track-exempt="disabled: pending telemetry web parity enablement for discover.mode_select"
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'likes' ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text'
          }`}
        >
          <Heart className={ICON_SECTION.toolbar.pillIcon} aria-hidden="true" /> Likes
          {pendingLikesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
              {pendingLikesCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {mode === 'matches' && passStack.length > 0 && (
          <button
            type="button"
            onClick={handleUndo}
            aria-label="Undo last pass"
            title="Undo pass"
            // TODO(telemetry-parity): switch to UiElement.DISCOVER_UNDO_BUTTON once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for discover.undo_button"
            className={ICON_SECTION.toolbar.pillButton}
          >
            <RotateCcw className={ICON_SECTION.toolbar.pillIcon} />
          </button>
        )}
        {pendingTotal > 0 && (
          <button
            type="button"
            onClick={() => setPendingNoticeOpen(true)}
            aria-label={`${pendingTotal} pending requests`}
            // TODO(telemetry-parity): switch to UiElement.DISCOVER_PENDING_NOTICE_OPEN once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for discover.pending_notice_open"
            className="h-8 inline-flex items-center gap-1 px-2.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
          >
            <BellRing className={ICON_SECTION.toolbar.pillIcon} />
            <span>{pendingTotal}</span>
          </button>
        )}
        <BoostHeaderPill onOpen={() => setBoostOpen(true)} />
        {onOpenPreferences && (
          <button
            type="button"
            onClick={onOpenPreferences}
            aria-label="Discovery preferences"
            title="Discovery preferences"
            // TODO(telemetry-parity): switch to UiElement.DISCOVER_PREFERENCES_OPEN once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for discover.preferences_open"
            className={ICON_SECTION.toolbar.pillButton}
          >
            <SlidersHorizontal className={ICON_SECTION.toolbar.pillIcon} />
          </button>
        )}
      </div>
    </div>
  );

  if (mode === 'likes') {
    return (
      <div className="h-full flex flex-col bg-bg text-text overflow-hidden">
        {headerBar}
        <div className="flex-1 min-h-0">
          <LikesYouView
            embedded
            onOpenRequests={onOpenRequests}
            onOpenArchives={onOpenArchives}
            onOpenUpgrade={onNavigateToProfile}
            onMatched={onMatched}
          />
        </div>
        <BoostDialog open={boostOpen} onClose={() => setBoostOpen(false)} />
        <PendingNoticeDialog
          open={pendingNoticeOpen}
          onClose={() => setPendingNoticeOpen(false)}
          onOpenRequests={() => onOpenRequests?.()}
          onOpenArchives={() => onOpenArchives?.()}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-bg text-text">
        {headerBar}
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col bg-bg text-text">
        {headerBar}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <h2 className="text-lg font-semibold text-text">Couldn't load discovery</h2>
            <p className="text-sm text-text-secondary">{errorMessage(error, DISCOVER_LOAD_FAILED_COPY)}</p>
            <button
              onClick={onRetry}
              {...trackProps(UiElement.DISCOVER_RETRY)}
              className="w-full py-3 bg-ig-blue text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentCandidate) {
    return (
      <div className="h-full flex flex-col bg-bg text-text overflow-y-auto">
        {headerBar}
        <div className="flex-1">
          <DiscoveryEmptyState
            chips={selector}
            title={DISCOVER_EMPTY_COPY.title}
            message={DISCOVER_EMPTY_COPY.message}
          />
        </div>
        <BoostDialog open={boostOpen} onClose={() => setBoostOpen(false)} />
        <PendingNoticeDialog
          open={pendingNoticeOpen}
          onClose={() => setPendingNoticeOpen(false)}
          onOpenRequests={() => onOpenRequests?.()}
          onOpenArchives={() => onOpenArchives?.()}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-bg text-text">
      {headerBar}
      <div className="w-full max-w-[500px] mx-auto px-0 sm:px-4 pb-4">
        {selector && <div className="px-4 sm:px-0 pb-3">{selector}</div>}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCandidate.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <DiscoveryCard
              candidate={currentCandidate}
              onPass={handlePass}
              onComment={handleOpenComposer}
              onRose={handleRose}
              rosesRemaining={rosesRemaining}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {activeComposer && (
          <CommentComposer
            key="composer"
            targetName={activeComposer.displayName}
            target={activeComposer.target}
            kind={activeComposer.kind}
            onSubmit={handleSubmitComment}
            onCancel={() => setActiveComposer(null)}
            onOpenUpgrade={onNavigateToProfile}
          />
        )}
      </AnimatePresence>

      <BoostDialog open={boostOpen} onClose={() => setBoostOpen(false)} />
      <PendingNoticeDialog
        open={pendingNoticeOpen}
        onClose={() => setPendingNoticeOpen(false)}
        onOpenRequests={() => onOpenRequests?.()}
        onOpenArchives={() => onOpenArchives?.()}
      />
      {undoUpgradeOpen && (
        <UpgradeDialog
          feature="Undo passes"
          detail="Bring back the profile you just passed with Super or Infinity."
          element={UiElement.DISCOVER_UPGRADE_OPEN}
          onClose={() => setUndoUpgradeOpen(false)}
        />
      )}
      <HookFormingGuardDialog
        prompt={guardPrompt}
        onConfirm={() => {
          const comment = pendingComment ?? '';
          markFirstLikeConfirmedToday(userState?.userId);
          setGuardPrompt(null);
          setPendingComment(null);
          void sendLikeNow(comment).catch(() => undefined);
        }}
        onCancel={() => {
          setGuardPrompt(null);
          setPendingComment(null);
        }}
      />
    </div>
  );
}

export { ALL_CATEGORIES } from './DiscoveryEmptyState';

/** The real Discover screen's empty-state copy. */
export const DISCOVER_EMPTY_COPY = {
  title: 'You’re All Caught Up',
  message: 'Check back soon for new people to meet.',
} as const;

/**
 * Discovery category chips. Categories outside `available` (from the backend, by tier) stay visible
 * with a lock; tapping one explains the upgrade instead of switching.
 */
export function CategorySelector({
  value,
  available,
  onChange,
}: {
  value: DiscoveryCategory;
  available: DiscoveryCategory[];
  onChange: (c: DiscoveryCategory) => void;
}) {
  const [lockedPick, setLockedPick] = useState<DiscoveryCategory | null>(null);
  return (
    <>
      <CategoryChips
        value={value}
        available={available}
        onPick={(option, open) => {
          if (!open) setLockedPick(option);
          else if (option !== value) onChange(option);
        }}
        trackAttrsFor={(option, open) =>
          open
            ? trackProps(UiElement.DISCOVER_CATEGORY_SELECT, { value: option.toLowerCase() })
            : trackProps(UiElement.DISCOVER_UPGRADE_OPEN)
        }
      />
      {lockedPick && (
        <UpgradeDialog
          feature={CATEGORY_LABELS[lockedPick] ?? lockedPick}
          detail="Narrow your deck to one kind of match: people who fit your preferences, Mr. OneHook's picks, or people like the ones you've liked."
          element={UiElement.DISCOVER_UPGRADE_OPEN}
          onClose={() => setLockedPick(null)}
        />
      )}
    </>
  );
}
