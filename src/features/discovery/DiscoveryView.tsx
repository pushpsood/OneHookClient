import { useState } from 'react';
import { motion } from 'motion/react';
import type { DiscoveryCandidate } from '../../types';
import type { ApiError } from '../../lib/api-client';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { DiscoveryCard } from './DiscoveryCard';

export function DiscoveryView({
  candidates,
  loading,
  error,
  onRetry,
  onSwipe,
}: {
  key?: string;
  candidates: DiscoveryCandidate[];
  loading: boolean;
  error?: ApiError | null;
  onRetry: () => void;
  onSwipe: (targetId: string, direction: 'LEFT' | 'RIGHT') => Promise<boolean>;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentCandidate = currentIndex < candidates.length ? candidates[currentIndex] : null;

  const handleSwipe = async (direction: 'LEFT' | 'RIGHT') => {
    if (!currentCandidate) return;
    const targetId = currentCandidate.id;
    setCurrentIndex((prev) => prev + 1);
    try {
      await onSwipe(targetId, direction);
    } catch (err) {
      console.warn('Swipe error in background:', err);
    }
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-6 sm:p-12 overflow-y-auto"
    >
      <DiscoveryCard
        candidate={currentCandidate}
        onSwipeLeft={() => handleSwipe('LEFT')}
        onSwipeRight={() => handleSwipe('RIGHT')}
      />
    </motion.div>
  );
}

