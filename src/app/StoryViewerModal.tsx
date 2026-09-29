import { useState, useEffect } from 'react';
import { X, Heart, Send, Pause, Play, CheckCircle2 } from 'lucide-react';
import { MediaImage } from '../components/common/MediaImage';
import type { DiscoveryCandidate } from '../types';

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: DiscoveryCandidate | null;
  onLikeStory?: (targetId: string, comment: string, mediaRef?: string) => Promise<boolean>;
  onNextStory?: () => void;
  onPrevStory?: () => void;
}

export function StoryViewerModal({
  isOpen,
  onClose,
  candidate,
  onLikeStory,
  onNextStory,
  onPrevStory,
}: StoryViewerModalProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [heartAnim, setHeartAnim] = useState(false);

  const photos: string[] = candidate?.photos?.length
    ? candidate.photos
    : (candidate as any)?.pictures?.length
    ? (candidate as any).pictures
    : [];

  const totalPhotos = Math.max(photos.length, 1);

  // Auto-advance timer (5s per story item)
  useEffect(() => {
    if (!isOpen || isPaused || totalPhotos === 0) return;

    const timer = setInterval(() => {
      setPhotoIndex((prev) => {
        if (prev < totalPhotos - 1) {
          return prev + 1;
        } else {
          // Finished photos for this candidate -> advance to next candidate
          if (onNextStory) onNextStory();
          return 0;
        }
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [isOpen, isPaused, totalPhotos, onNextStory]);

  // Reset photo index when candidate changes
  useEffect(() => {
    setPhotoIndex(0);
    setReplyText('');
  }, [candidate?.id]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, photoIndex, totalPhotos]);

  if (!isOpen || !candidate) return null;

  const handleNext = () => {
    if (photoIndex < totalPhotos - 1) {
      setPhotoIndex((prev) => prev + 1);
    } else if (onNextStory) {
      onNextStory();
    }
  };

  const handlePrev = () => {
    if (photoIndex > 0) {
      setPhotoIndex((prev) => prev - 1);
    } else if (onPrevStory) {
      onPrevStory();
    }
  };

  const currentPhoto = photos[photoIndex] || photos[0];
  const name = (candidate as any).displayName || candidate.name || 'Member';

  const handleSendReply = async () => {
    if (!replyText.trim() || !candidate.id) return;
    setIsSubmitting(true);
    try {
      if (onLikeStory) {
        await onLikeStory(candidate.id, replyText.trim(), currentPhoto);
      }
      setReplyText('');
      setHeartAnim(true);
      setTimeout(() => setHeartAnim(false), 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHeartClick = async () => {
    if (!candidate.id) return;
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 1200);
    if (onLikeStory) {
      await onLikeStory(candidate.id, '❤️ Sent a like on your story', currentPhoto);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md select-none">
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 text-white/80 hover:text-white p-2 z-50 cursor-pointer"
        title="Close story"
      >
        <X className="w-7 h-7" />
      </button>

      {/* Story Stage Container (9:16 Instagram Story Ratio) */}
      <div className="relative w-full max-w-[420px] h-[92vh] max-h-[860px] bg-neutral-900 rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-white/10">
        {/* Top Progress Bars */}
        <div className="absolute top-3 left-3 right-3 flex items-center gap-1.5 z-30">
          {Array.from({ length: totalPhotos }).map((_, idx) => (
            <div
              key={idx}
              className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden"
            >
              <div
                className={`h-full bg-white transition-all duration-100 ${
                  idx < photoIndex
                    ? 'w-full'
                    : idx === photoIndex
                    ? isPaused
                      ? 'w-1/2'
                      : 'w-full transition-all duration-[5000ms] ease-linear'
                    : 'w-0'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Story Header */}
        <div className="absolute top-6 left-3 right-3 flex items-center justify-between z-30 pointer-events-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]">
              <div className="w-full h-full rounded-full overflow-hidden bg-black">
                {photos[0] ? (
                  <MediaImage
                    src={photos[0]}
                    alt={name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                    {name[0]}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white text-sm font-semibold truncate drop-shadow">
                {name}
              </span>
              {candidate.verified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-ig-blue fill-ig-blue drop-shadow" color="white" />
              )}
              <span className="text-white/60 text-xs ml-1">• 2h</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            className="text-white/80 hover:text-white p-1 cursor-pointer"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>

        {/* Media Photo Container */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {currentPhoto ? (
            <MediaImage
              src={currentPhoto}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-white/60 text-sm">No photo available</div>
          )}

          {/* Double-tap / send animated heart burst */}
          {heartAnim && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 animate-out zoom-out-150 duration-700">
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl animate-bounce" />
            </div>
          )}

          {/* Left / Right Click Nav Zones */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1/3 z-20 cursor-pointer"
            onClick={handlePrev}
            title="Previous"
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-2/3 z-20 cursor-pointer"
            onClick={handleNext}
            title="Next"
          />

          {/* Prompt / Bio pill overlay if available */}
          {candidate.bio && (
            <div className="absolute bottom-20 left-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 z-20 pointer-events-none">
              <p className="text-white text-xs leading-relaxed line-clamp-2">
                &ldquo;{candidate.bio}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Story Bottom Reply & Heart Bar */}
        <div className="p-3 bg-gradient-to-t from-black via-black/80 to-transparent z-30 flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendReply();
              }}
              onFocus={() => setIsPaused(true)}
              onBlur={() => setIsPaused(false)}
              placeholder={`Send message to ${name}...`}
              className="w-full pl-4 pr-10 py-2.5 bg-white/15 text-white placeholder:text-white/60 text-xs rounded-full border border-white/20 focus:border-white focus:bg-white/25 focus:outline-none transition-all"
            />
            {replyText.trim() && (
              <button
                type="button"
                onClick={handleSendReply}
                disabled={isSubmitting}
                className="absolute right-2 text-white hover:opacity-80 p-1 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleHeartClick}
            className="p-2 text-white hover:text-red-500 transition-colors cursor-pointer shrink-0"
            title="Like story"
          >
            <Heart className="w-6 h-6 hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
