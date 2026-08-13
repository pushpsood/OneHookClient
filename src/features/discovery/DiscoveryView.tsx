import { useState } from 'react';
import { motion } from 'motion/react';
import { Heart, MapPin } from 'lucide-react';
import type { DiscoveryCandidate } from '../../types';
import type { ApiError } from '../../lib/api-client';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { getOptimizedProfileImageSrc } from '../../utils/profile-image';

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
  const safeIndex = Math.min(currentIndex, Math.max(candidates.length - 1, 0));
  const currentCandidate = candidates[safeIndex];

  const handleSwipe = async (direction: 'LEFT' | 'RIGHT') => {
    if (!currentCandidate) return;
    const swiped = await onSwipe(currentCandidate.id, direction);
    if (swiped) {
      setCurrentIndex((prev) => prev + 1);
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
      className="flex-1 flex items-center justify-center bg-[#F9F9F9] p-12 overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white border border-border flex flex-col shadow-sm">
        <div className="relative aspect-[4/5] overflow-hidden group">
          <img
            src={getOptimizedProfileImageSrc(currentCandidate.photos?.[0])}
            alt={currentCandidate.name}
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover grayscale transition-all duration-1000 group-hover:grayscale-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-40"></div>

          <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
            {currentCandidate.verified && (
              <div className="px-3 py-1 bg-white border border-accent text-[9px] font-bold uppercase tracking-widest">
                Verified
              </div>
            )}
            {currentCandidate.distance && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-border text-[9px] font-bold uppercase tracking-widest opacity-60 italic">
                <MapPin className="w-2.5 h-2.5" /> {currentCandidate.distance} km
              </div>
            )}
          </div>
        </div>

        <div className="p-10 space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-4xl font-serif italic uppercase tracking-tighter">
              {currentCandidate.name}
            </h2>
            <span className="text-sm opacity-40 italic">
              {currentCandidate.age > 0 ? `${currentCandidate.age}, ` : ''}
              {currentCandidate.location}
            </span>
          </div>
          <p className="text-sm opacity-70 leading-relaxed font-sans">{currentCandidate.bio}</p>
          {currentCandidate.interests && currentCandidate.interests.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {currentCandidate.interests.map((interest: string, i: number) => (
                <span
                  key={i}
                  className="px-3 py-1 border border-border text-[9px] uppercase tracking-[0.15em] font-bold opacity-50"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}

          <div className="pt-8 flex gap-4">
            <button
              onClick={() => handleSwipe('LEFT')}
              className="flex-1 py-4 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => handleSwipe('RIGHT')}
              className="flex-1 py-4 bg-accent text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Heart className="w-3.5 h-3.5" /> Hook
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
