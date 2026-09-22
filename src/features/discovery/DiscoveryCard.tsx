import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { MediaImage } from '../../components/common/MediaImage';
import { useMediaSrc } from '../../utils/media-url';
import { pictureTransformStyle } from '../../utils/photo-transform';
import { mediaLikeType, type LikeTarget } from './like-target';

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

  const prompts =
    (candidate.prompts as Array<{ promptId: string; answer: string }> | undefined) || [];
  const interests = candidate.interests || [];

  /** Small "comment to like" affordance shown next to a likeable element in live discovery. */
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
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-accent border border-accent/40 bg-white/95 px-2.5 py-1 hover:bg-accent hover:text-white transition-colors cursor-pointer ${btnClass}`}
    >
      <Heart className="w-3 h-3" /> {label}
    </button>
  );

  return (
    <div
      className={`w-full max-w-[460px] mx-auto bg-white border border-border flex flex-col shadow-sm select-none ${className}`}
    >
      {/* Recommendation / Handpicked Banner */}
      {((candidate.score && candidate.score >= 0.9) || candidate.recommendationReason) && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3.5 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
              Handpicked For You
            </h3>
            <p className="text-[11px] text-amber-900/80 leading-relaxed italic">
              {candidate.recommendationReason ||
                'Selected based on exceptionally high compatibility and shared vibe.'}
            </p>
          </div>
        </div>
      )}

      {/* Primary Photo & Carousel Container */}
      {/* 3:4 portrait — the single canonical photo ratio used across the app (profile editor,
          onboarding, matches, chat and discovery) so a photo is never cropped differently per screen. */}
      <div className="relative aspect-[3/4] overflow-hidden group bg-black/5">
        {currentPhoto ? (
          <MediaImage
            src={currentPhoto}
            alt={displayName}
            loading="eager"
            decoding="async"
            style={pictureTransformStyle(candidate.pictureTransforms?.[currentPhoto])}
            className="w-full h-full object-cover grayscale transition-all duration-1000 group-hover:grayscale-0"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground opacity-40">
            <span className="text-xs font-mono uppercase tracking-widest">No Photo</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-black/20 pointer-events-none" />

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
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextPhoto}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-20"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Comment-to-like on the currently shown photo / video */}
        {canComment && currentPhoto && (
          <div className="absolute bottom-16 right-4 z-20">
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

        {/* Photo Badges */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            {candidate.verified && (
              <div className="px-3 py-1 bg-white border border-accent text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-green-600" /> Verified
              </div>
            )}
          </div>
          {distanceDisplay && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/95 backdrop-blur-sm border border-border text-[9px] font-bold uppercase tracking-widest opacity-80 italic shadow-sm">
              <MapPin className="w-2.5 h-2.5" /> {distanceDisplay}
            </div>
          )}
        </div>
      </div>

      {/* Main Profile Info Section */}
      <div className="p-6 sm:p-7 space-y-5 flex-1">
        {/* Name, Age, Location */}
        <div className="flex items-baseline justify-between border-b border-border pb-3.5">
          <h2 className="text-2xl sm:text-3xl font-serif italic uppercase tracking-tighter text-foreground">
            {displayName}
          </h2>
          <span className="text-xs sm:text-sm opacity-50 font-serif italic">
            {age && age > 0 ? `${age}, ` : ''}
            {location}
          </span>
        </div>

        {/* Work & Education */}
        {(candidate.work || candidate.education || candidate.hometown) && (
          <div className="flex flex-wrap items-center gap-4 text-xs opacity-60">
            {candidate.work && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" /> {candidate.work}
              </span>
            )}
            {candidate.education && (
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> {candidate.education}
              </span>
            )}
            {candidate.hometown && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> {candidate.hometown}
              </span>
            )}
          </div>
        )}

        {/* Bio / Story */}
        {candidate.bio && (
          <div className="space-y-2">
            <p className="text-sm opacity-75 leading-relaxed font-serif italic border-l-2 border-accent/40 pl-4 py-0.5">
              "{candidate.bio}"
            </p>
            {canComment && (
              <CommentButton
                target={{ type: 'BIO', label: 'Bio', preview: candidate.bio }}
                label="Comment on bio"
              />
            )}
          </div>
        )}

        {/* Voice Note Player */}
        {audioKey && (
          <div className="space-y-2">
            <div className="p-4 border border-border bg-[#FAFAFA] flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow hover:bg-accent/90 shrink-0 cursor-pointer"
                  title={isPlayingAudio ? 'Pause Voice Note' : 'Play Voice Note'}
                >
                  {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> Voice Note
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatAudioTime(playbackProgress)} / {formatAudioTime(audioDuration)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-100 ease-linear"
                      style={{
                        width: `${audioDuration > 0 ? (playbackProgress / audioDuration) * 100 : 0}%`,
                      }}
                    />
                  </div>
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
                label="Comment on voice"
              />
            )}
          </div>
        )}

        {/* Written Prompts */}
        {prompts.length > 0 && (
          <div className="space-y-3 pt-2">
            {prompts.map((p, idx) => (
              <div key={idx} className="p-4 border border-border/80 bg-[#FAFAFA] space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent block">
                  {p.promptId}
                </span>
                <p className="text-xs font-serif italic text-foreground/90 leading-relaxed">
                  "{p.answer}"
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
                      label="Comment"
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
          <div className="flex flex-wrap gap-1.5 pt-1">
            {candidate.relationshipType && (
              <span className="px-2.5 py-1 bg-accent/5 border border-border text-[9px] uppercase tracking-wider font-bold opacity-70">
                {candidate.relationshipType.replace(/_/g, ' ')}
              </span>
            )}
            {candidate.starSign && (
              <span className="px-2.5 py-1 bg-accent/5 border border-border text-[9px] uppercase tracking-wider font-bold opacity-70">
                ⭐ {candidate.starSign}
              </span>
            )}
            {candidate.religion && (
              <span className="px-2.5 py-1 bg-accent/5 border border-border text-[9px] uppercase tracking-wider font-bold opacity-70">
                {candidate.religion}
              </span>
            )}
            {candidate.wantsKids && (
              <span className="px-2.5 py-1 bg-accent/5 border border-border text-[9px] uppercase tracking-wider font-bold opacity-70">
                Kids: {candidate.wantsKids}
              </span>
            )}
            {candidate.smokingStatus && (
              <span className="px-2.5 py-1 bg-accent/5 border border-border text-[9px] uppercase tracking-wider font-bold opacity-70">
                Smoke: {candidate.smokingStatus}
              </span>
            )}
            {candidate.drinkingStatus && (
              <span className="px-2.5 py-1 bg-accent/5 border border-border text-[9px] uppercase tracking-wider font-bold opacity-70">
                Drink: {candidate.drinkingStatus}
              </span>
            )}
          </div>
        )}

        {/* Interests & Passions — each is a like target in live discovery */}
        {interests.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/60">
            {canComment && (
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40 block">
                Tap an interest to comment & like
              </span>
            )}
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
                    aria-label={`Comment on interest ${interest} to like`}
                    title={`Comment on "${interest}" to like`}
                    className="px-3 py-1 border border-border text-[9px] uppercase tracking-[0.15em] font-bold opacity-70 bg-white hover:border-accent hover:text-accent transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Heart className="w-3 h-3" /> {interest}
                  </button>
                ) : (
                  <span
                    key={i}
                    className="px-3 py-1 border border-border text-[9px] uppercase tracking-[0.15em] font-bold opacity-60 bg-white"
                  >
                    {interest}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {/* Actions: live PASS (like is comment-only, above) or preview footer */}
        {onPass ? (
          <div className="pt-6">
            <button
              type="button"
              onClick={onPass}
              className="w-full py-4 border border-border text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-bg transition-colors cursor-pointer"
            >
              Pass
            </button>
            <p className="pt-3 text-center text-[10px] uppercase tracking-[0.2em] opacity-40">
              To like, comment on something above
            </p>
          </div>
        ) : isPreview ? (
          <div className="pt-4 border-t border-border/80">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5 opacity-60">
                <Heart className="w-3.5 h-3.5 text-accent" /> Ready for matching
              </span>
              <span className="text-accent font-mono text-[9px]">OneHook Feed Preview</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
