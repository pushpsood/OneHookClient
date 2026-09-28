import React, { useState, useRef, useEffect } from 'react';
import {
  Heart,
  MapPin,
  Sparkles,
  CheckCircle2,
  Briefcase,
  GraduationCap,
  Volume2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { MediaImage } from '../../components/common/MediaImage';
import { useMediaSrc } from '../../utils/media-url';
import { pictureTransformStyle } from '../../utils/photo-transform';
import { mediaLikeType, type LikeTarget } from './like-target';
import { trackMediaView } from '../../lib/analytics/analytics';

export interface DiscoveryProfileData {
  id?: string;
  name?: string;
  displayName?: string;
  age?: number | string;
  location?: string | { lat?: number; lng?: number; geohash?: string };
  currentLocation?: string;
  hometown?: string;
  distance?: number;
  distanceKm?: number;
  verified?: boolean;
  score?: number;
  recommendationReason?: string;
  photos?: string[];
  pictures?: string[];
  pictureTransforms?: Record<string, string>;
  bio?: string;
  work?: string;
  education?: string;
  prompts?: Array<{ promptId: string; answer: string }>;
  audioPrompt?: string;
  interests?: string[];
  languages?: string[];
  relationshipType?: string;
  wantsKids?: string;
  smokingStatus?: string;
  drinkingStatus?: string;
  religion?: string;
  starSign?: string;
  height?: number | string;
  gender?: string;
  [key: string]: any;
}

export interface DiscoveryCardProps {
  key?: string;
  candidate: DiscoveryProfileData;
  /** PASS the candidate (LEFT). The only non-comment action left on the deck. */
  onPass?: () => void;
  /**
   * Open the comment composer for a specific element. Liking is Hinge-style: it ALWAYS happens by
   * commenting on one element (photo, video, voice, prompt, interest or bio) — there is no like
   * button and no right-swipe like anymore.
   */
  onComment?: (target: LikeTarget) => void;
  isPreview?: boolean;
  className?: string;
}

export function DiscoveryCard({
  candidate,
  onPass,
  onComment,
  isPreview = false,
  className = '',
}: DiscoveryCardProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live discovery = we can like (comment). Preview surfaces pass a candidate only, so the comment
  // affordances stay hidden there.
  const canComment = typeof onComment === 'function';

  const photos =
    candidate.photos && candidate.photos.length > 0
      ? candidate.photos
      : candidate.pictures && candidate.pictures.length > 0
      ? candidate.pictures
      : [];

  const displayName = candidate.displayName || candidate.name || 'Anonymous';

  const age = candidate.age ? Number(candidate.age) : null;
  const location =
    typeof candidate.location === 'string'
      ? candidate.location
      : candidate.currentLocation ||
        (candidate.distanceKm != null
          ? `${candidate.distanceKm.toFixed(1)} km away`
          : candidate.distance != null
          ? `${candidate.distance} km away`
          : candidate.hometown || '');

  const distanceDisplay =
    candidate.distance != null
      ? `${candidate.distance} km`
      : candidate.distanceKm != null
      ? `${candidate.distanceKm.toFixed(1)} km`
      : null;

  const audioKey = candidate.audioPrompt || '';
  const audioSrc = useMediaSrc(audioKey);

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setPlaybackProgress(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const formatAudioTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds === Infinity) return '00:00';
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  const togglePlayAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
      if (!isPreview && audioKey) {
        trackMediaView(audioKey, 'voice', { viewedUserId: candidate.id, context: 'discovery' });
      }
    }
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (photos.length <= 1) return;
    setPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const currentPhoto = photos[photoIndex] || photos[0];

  const mediaTypeOf = (key: string): 'image' | 'video' =>
    mediaLikeType(key) === 'VIDEO' ? 'video' : 'image';
  const shownPhotoRef = useRef<{ key: string; index: number; start: number } | null>(null);
  
  const emitPhotoDwell = () => {
    if (isPreview) return;
    const prev = shownPhotoRef.current;
    if (prev && prev.key) {
      trackMediaView(prev.key, mediaTypeOf(prev.key), {
        dwellMs: Date.now() - prev.start,
        index: prev.index,
        viewedUserId: candidate.id,
        context: 'discovery',
      });
    }
  };
  
  useEffect(() => {
    if (isPreview) return;
    emitPhotoDwell();
    shownPhotoRef.current = currentPhoto
      ? { key: currentPhoto, index: photoIndex, start: Date.now() }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIndex]);
  
  useEffect(() => {
    return () => emitPhotoDwell();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prompts =
    (candidate.prompts as Array<{ promptId: string; answer: string }> | undefined) || [];
  const interests = candidate.interests || [];

  const CommentButton = ({
    target,
    className: btnClass = '',
    label = 'Comment',
  }: {
    target: LikeTarget;
    className?: string;
    label?: string;
  }) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onComment?.(target);
      }}
      aria-label={`Comment on ${displayName}'s ${target.label.toLowerCase()} to like`}
      title={`Comment on ${target.label.toLowerCase()} to like`}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold bg-white/95 text-gray-900 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-100 transition-colors cursor-pointer shadow-sm ${btnClass}`}
    >
      <Heart className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return (
    <div className={`w-full max-w-[600px] mx-auto bg-white sm:border sm:border-border sm:rounded-lg sm:my-4 flex flex-col overflow-hidden ${className}`}>
      {/* Post header row */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2.5">
          {photos.length > 0 ? (
            <MediaImage
              src={photos[0]}
              alt={displayName}
              loading="eager"
              decoding="async"
              style={pictureTransformStyle(candidate.pictureTransforms?.[photos[0]])}
              className="w-8 h-8 rounded-full object-cover border border-gray-100"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
              <span className="text-[10px] text-gray-400">No pic</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-gray-900">{displayName}</span>
            {candidate.verified && (
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500" strokeWidth={3} color="white" />
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500 font-medium">
          {age && `${age} • `}{location}
        </div>
      </div>

      {/* Primary Photo & Carousel Container (4:5) */}
      <div className="relative aspect-[4/5] overflow-hidden group bg-gray-50">
        {currentPhoto ? (
          <MediaImage
            src={currentPhoto}
            alt={displayName}
            loading="eager"
            decoding="async"
            style={pictureTransformStyle(candidate.pictureTransforms?.[currentPhoto])}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-sm font-medium">No Photo</span>
          </div>
        )}

        {/* Stories / Photo Index Bars */}
        {photos.length > 1 && (
          <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoIndex(i);
                }}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i === photoIndex ? 'bg-white shadow' : 'bg-white/40 hover:bg-white/70'
                }`}
                title={`Photo ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Previous / Next Arrow Controls */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevPhoto}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextPhoto}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-20"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Comment-to-like overlay on the currently shown photo */}
        {canComment && currentPhoto && (
          <div className="absolute bottom-4 right-4 z-20">
            <CommentButton
              label="Comment"
              target={{
                type: mediaLikeType(currentPhoto),
                ref: currentPhoto,
                label: mediaLikeType(currentPhoto) === 'VIDEO' ? 'Video' : 'Photo',
              }}
            />
          </div>
        )}
      </div>

      {/* Action bar below photo */}
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {canComment && currentPhoto && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onComment?.({
                  type: mediaLikeType(currentPhoto),
                  ref: currentPhoto,
                  label: mediaLikeType(currentPhoto) === 'VIDEO' ? 'Video' : 'Photo',
                });
              }}
              className="text-gray-900 hover:text-gray-500 transition-colors"
            >
              <Heart className="w-6 h-6" />
            </button>
          )}
          {onPass && (
            <button
              type="button"
              onClick={onPass}
              className="text-gray-900 hover:text-gray-500 transition-colors"
            >
              <X className="w-7 h-7" />
            </button>
          )}
        </div>
        {distanceDisplay && (
          <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
            <MapPin className="w-3.5 h-3.5" /> {distanceDisplay}
          </div>
        )}
      </div>

      {/* Content below action bar */}
      <div className="px-3 pb-5 space-y-4">
        {/* Caption (Name, Age, Bio) */}
        <div className="text-sm">
          <span className="font-semibold text-gray-900 mr-2">
            {displayName} {age && <span>{age}</span>}
          </span>
          {candidate.bio && (
            <span className="text-gray-900">
              {candidate.bio}
            </span>
          )}
          {canComment && candidate.bio && (
            <div className="mt-2">
              <CommentButton
                target={{ type: 'BIO', label: 'Bio', preview: candidate.bio }}
                label="Reply to bio"
                className="!text-[11px] !py-1 !px-2.5"
              />
            </div>
          )}
        </div>

        {/* Work & Education */}
        {(candidate.work || candidate.education || candidate.hometown) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            {candidate.work && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> {candidate.work}
              </span>
            )}
            {candidate.education && (
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" /> {candidate.education}
              </span>
            )}
            {candidate.hometown && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {candidate.hometown}
              </span>
            )}
          </div>
        )}

        {/* Voice Note Player */}
        {audioKey && (
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlayAudio}
                className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm shrink-0 cursor-pointer"
              >
                {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" /> Voice Note
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatAudioTime(playbackProgress)} / {formatAudioTime(audioDuration)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-100 ease-linear"
                    style={{
                      width: `${audioDuration > 0 ? (playbackProgress / audioDuration) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <audio
                ref={audioRef}
                src={audioSrc}
                onTimeUpdate={handleAudioTimeUpdate}
                onLoadedMetadata={handleAudioLoadedMetadata}
                onEnded={() => {
                  setIsPlayingAudio(false);
                  setPlaybackProgress(0);
                }}
                className="hidden"
              />
            </div>
            {canComment && (
              <CommentButton
                target={{ type: 'VOICE', ref: audioKey, label: 'Voice note' }}
                label="Reply to voice note"
                className="!text-[11px] !py-1 !px-2.5"
              />
            )}
          </div>
        )}

        {/* Written Prompts */}
        {prompts.length > 0 && (
          <div className="space-y-3">
            {prompts.map((p, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-1.5">
                <span className="text-xs font-semibold text-gray-500 block">
                  {p.promptId}
                </span>
                <p className="text-sm text-gray-900 leading-relaxed font-medium">
                  {p.answer}
                </p>
                {canComment && (
                  <div className="pt-1">
                    <CommentButton
                      target={{
                        type: 'PROMPT',
                        ref: p.promptId,
                        label: 'Prompt',
                        preview: p.answer,
                      }}
                      label="Reply"
                      className="!text-[11px] !py-1 !px-2.5"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Lifestyle & Vibe Badges */}
        {(candidate.relationshipType ||
          candidate.starSign ||
          candidate.religion ||
          candidate.wantsKids ||
          candidate.smokingStatus ||
          candidate.drinkingStatus) && (
          <div className="flex flex-wrap gap-2">
            {candidate.relationshipType && (
              <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                {candidate.relationshipType.replace(/_/g, ' ')}
              </span>
            )}
            {candidate.starSign && (
              <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                ⭐ {candidate.starSign}
              </span>
            )}
            {candidate.religion && (
              <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                {candidate.religion}
              </span>
            )}
            {candidate.wantsKids && (
              <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                Kids: {candidate.wantsKids}
              </span>
            )}
            {candidate.smokingStatus && (
              <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                Smoke: {candidate.smokingStatus}
              </span>
            )}
            {candidate.drinkingStatus && (
              <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                Drink: {candidate.drinkingStatus}
              </span>
            )}
          </div>
        )}

        {/* Interests */}
        {interests.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {interests.map((interest: string, i: number) =>
                canComment ? (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onComment?.({
                        type: 'INTEREST',
                        ref: interest,
                        label: 'Interest',
                        preview: interest,
                      });
                    }}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full text-xs font-medium text-gray-700 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {interest}
                  </button>
                ) : (
                  <span
                    key={i}
                    className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700"
                  >
                    {interest}
                  </span>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

