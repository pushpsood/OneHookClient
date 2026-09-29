import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DiscoveryCandidate, UserProfile } from '../../types';
import type { ApiError } from '../../lib/api-client';
import type { LikeTargetType } from '../../api/rest';
import { MatchingApi } from '../../api/matching';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DiscoveryCard } from './DiscoveryCard';
import { CommentComposer } from './CommentComposer';
import type { LikeTarget } from './like-target';
import { trackCardImpression, trackCardSwipe } from '../../lib/analytics/analytics';

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
}) {
  // The element being commented on (composer open). `kind` distinguishes a normal like from a rose.
  const [activeComposer, setActiveComposer] = useState<{
    candidateId: string;
    target: LikeTarget;
    displayName: string;
    kind: 'like' | 'rose';
  } | null>(null);

  // Acted-on candidate ids disappear from the deck — the only way to advance.
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [rosesRemaining, setRosesRemaining] = useState<number | null>(null);

  const visibleCandidates = candidates.filter((c) => !passedIds.has(c.id));
  const currentCandidate = visibleCandidates[0] || null;

  // Remaining daily roses for the badge / spent state (best-effort; unknown until it loads).
  useEffect(() => {
    let active = true;
    MatchingApi.rosesRemaining()
      .then((r) => active && setRosesRemaining(r.remaining))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Impression for the currently shown profile.
  useEffect(() => {
    if (currentCandidate) trackCardImpression(currentCandidate.id, 0);
  }, [currentCandidate?.id]);

  const nameOf = (c: DiscoveryCandidate) =>
    (c as { displayName?: string }).displayName || c.name || 'this person';

  const advance = (id: string) => setPassedIds((prev) => new Set(prev).add(id));

  const handlePass = async () => {
    if (!currentCandidate) return;
    const targetId = currentCandidate.id;
    trackCardSwipe('left', targetId);
    advance(targetId);
    try {
      await onPass(targetId);
    } catch (err) {
      console.warn('Pass error in background:', err);
    }
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

  const handleSubmitComment = async (comment: string) => {
    if (!activeComposer) return;
    const { candidateId, target, kind } = activeComposer;
    // Throws propagate to the composer so a rejected like/rose keeps it open and does NOT advance.
    await onLike(candidateId, comment, target.type, target.ref, kind === 'rose' ? 'ROSE' : 'LIKE');
    trackCardSwipe(kind === 'rose' ? 'up' : 'right', candidateId);
    if (kind === 'rose') {
      setRosesRemaining((n) => (typeof n === 'number' ? Math.max(0, n - 1) : n));
    }
    setActiveComposer(null);
    advance(candidateId);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg text-text">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-bg text-text p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <h2 className="text-lg font-semibold text-text">Couldn't load discovery</h2>
          <p className="text-sm text-text-secondary">{error.message}</p>
          <button
            onClick={onRetry}
            className="w-full py-3 bg-ig-blue text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!currentCandidate) {
    return (
      <div className="h-full flex items-center justify-center bg-bg text-text p-6">
        <div className="max-w-sm w-full text-center space-y-3">
          <h2 className="text-lg font-semibold text-text">You&rsquo;re All Caught Up</h2>
          <p className="text-sm text-text-secondary">Check back soon for new people to meet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-bg text-text">
      <div className="w-full max-w-[500px] mx-auto px-0 sm:px-4 py-4">
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
