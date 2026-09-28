import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DiscoveryCandidate } from '../../types';
import type { ApiError } from '../../lib/api-client';
import type { LikeTargetType } from '../../api/rest';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DiscoveryCard } from './DiscoveryCard';
import { CommentComposer } from './CommentComposer';
import type { LikeTarget } from './like-target';
import { trackCardImpression, trackCardSwipe } from '../../lib/analytics/analytics';

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
  onRetry: () => void;
  /** PASS the candidate (LEFT). */
  onPass: (targetId: string) => Promise<boolean>;
  /**
   * LIKE the candidate (RIGHT) with a comment attached to a specific element. Resolves true on
   * success (deck advances), rejects/throws on failure (deck must NOT advance).
   */
  onLike: (
    targetId: string,
    comment: string,
    likeTargetType: LikeTargetType,
    likeTargetRef?: string
  ) => Promise<boolean>;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // The element being commented on, once a comment affordance is tapped. Null = composer closed.
  const [activeTarget, setActiveTarget] = useState<LikeTarget | null>(null);

  const currentCandidate = currentIndex < candidates.length ? candidates[currentIndex] : null;

  // A new card is shown — record the impression (no-op unless analytics is enabled + consented).
  useEffect(() => {
    if (currentCandidate) {
      trackCardImpression(currentCandidate.id, currentIndex);
    }
  }, [currentCandidate?.id, currentIndex]);

  const advance = () => setCurrentIndex((prev) => prev + 1);

  const handlePass = async () => {
    if (!currentCandidate) return;
    const targetId = currentCandidate.id;
    // Passing is optimistic — advance immediately, fire in the background.
    trackCardSwipe('left', targetId);
    advance();
    try {
      await onPass(targetId);
    } catch (err) {
      console.warn('Pass error in background:', err);
    }
  };

  const handleSubmitComment = async (comment: string) => {
    if (!currentCandidate || !activeTarget) return;
    const targetId = currentCandidate.id;
    // On success we close the composer and advance. On failure the composer stays open, shows the
    // error, and the deck does NOT advance — so the throw must propagate to the composer.
    await onLike(targetId, comment, activeTarget.type, activeTarget.ref);
    trackCardSwipe('right', targetId);
    setActiveTarget(null);
    advance();
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9]"
      >
        <LoadingSpinner size="lg" />
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
            Discovery Unavailable
          </h2>
          <p className="text-xs opacity-60 leading-relaxed italic">{error.message}</p>
          <button
            onClick={onRetry}
            className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </motion.div>
    );
  }

  if (!currentCandidate) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12"
      >
        <div className="max-w-md w-full bg-white border border-border p-12 text-center space-y-8">
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
            You&rsquo;re All Caught Up
          </h2>
          <p className="text-xs opacity-60 leading-relaxed italic">
            Check back soon for new people to meet.
          </p>
        </div>
      </motion.div>
    );
  }

  const displayName =
    (currentCandidate as { displayName?: string }).displayName ||
    currentCandidate.name ||
    'this person';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-6 sm:p-12 overflow-y-auto"
    >
      <DiscoveryCard
        candidate={currentCandidate}
        onPass={handlePass}
        onComment={(target) => setActiveTarget(target)}
      />

      <AnimatePresence>
        {activeTarget && (
          <CommentComposer
            key="composer"
            targetName={displayName}
            target={activeTarget}
            onSubmit={handleSubmitComment}
            onCancel={() => setActiveTarget(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
