import React, { useState, useRef, useEffect } from 'react';
import { Heart, MapPin, CheckCircle2, Volume2, Play, Pause } from 'lucide-react';
import { MediaImage } from '../../components/common/MediaImage';
import { useMediaSrc } from '../../utils/media-url';
import { pictureTransformStyle } from '../../utils/photo-transform';
import { mediaLikeType, type LikeTarget } from './like-target';
import { trackMediaView, trackSectionView, trackPromptView } from '../../lib/analytics/analytics';

/**
 * DiscoveryCard — the canonical profile surface, matched to the iOS app (the UI source of truth,
 * ios/OneHook/DiscoverCardView.swift) so discovery looks and measures the same on every device.
 *
 * A SINGLE vertical scroll of consistent "element cards" INTERLEAVED — photo, vitals, prompt, photo,
 * bio, voice, photo, prompt, interests, photo, lifestyle, prompt, remaining media/prompts, then
 * causes/communities/qualities. Interleaving (rather than a photo carousel then homogeneous blocks)
 * is prioritised first by what a dater wants to see — alternating media with text sustains attention
 * and surfaces a commentable element (the only way to like) early and repeatedly — and second by
 * analytics: the scroll passes three section anchors (PHOTOS → BIO → INTERESTS) so `section_view`
 * reports consideration depth exactly as iOS's `reportVisibleSection`, each photo emits `media_view`
 * dwell, and each prompt emits `prompt_view`. All discovery signals carry `cardVariant: 'interleaved'`
 * (same design as iOS) plus the server-stamped platform, so metrics aggregate and segment correctly.
 */

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
  height?: number | string;
  prompts?: Array<{ promptId: string; answer: string }>;
  audioPrompt?: string;
  interests?: string[];
  languages?: string[];
  relationshipType?: string;
  wantsKids?: string;
  smokingStatus?: string;
  drinkingStatus?: string;
  cannabisStatus?: string;
  religion?: string;
  starSign?: string;
  exercise?: string;
  causes?: string[];
  communities?: string[];
  qualities?: string[];
  gender?: string;
  [key: string]: any;
}

export interface DiscoveryCardProps {
  key?: React.Key;
  candidate: DiscoveryProfileData;
  /** PASS the candidate (LEFT). The only non-comment action left on the deck. */
  onPass?: () => void;
  /** Open the comment composer for a specific element (Hinge-style comment-to-like). */
  onComment?: (target: LikeTarget) => void;
  /** Send a rose — a daily-limited super-like on the whole profile (mirrors iOS RoseButton). */
  onRose?: () => void;
  /** Remaining daily roses for the badge / desaturated "spent" state; null = not yet known. */
  rosesRemaining?: number | null;
  isPreview?: boolean;
  className?: string;
}

type Section = 'PHOTOS' | 'BIO' | 'INTERESTS';
const CARD_VARIANT = 'interleaved'; // matches the iOS discovery card design

const humanize = (v: string): string => v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const mediaTypeOf = (key: string): 'image' | 'video' => (mediaLikeType(key) === 'VIDEO' ? 'video' : 'image');

/** The single consistent surface every profile element renders in (mirrors iOS makeElementCard). */
function ElementCard({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface border border-border rounded-xl p-4 space-y-2 ${className}`}>
      {title && (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary block">
          {title}
        </span>
      )}
      {children}
    </div>
  );
}

/** A small "comment to like" affordance shown on/next to a likeable element. */
function CommentButton({
  onComment,
  target,
  displayName,
  label = 'Comment',
  className = '',
}: {
  onComment?: (t: LikeTarget) => void;
  target: LikeTarget;
  displayName: string;
  label?: string;
  className?: string;
}) {
  if (typeof onComment !== 'function') return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onComment(target);
      }}
      aria-label={`Comment on ${displayName}'s ${target.label.toLowerCase()} to like`}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold bg-surface-card text-text border border-border rounded-full px-3 py-1.5 hover:bg-surface-hover transition-colors cursor-pointer ${className}`}
    >
      <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> {label}
    </button>
  );
}

/**
 * A single inline photo (3:4) that reports `media_view` dwell: starts a clock when the photo is
 * ≥50% visible and emits the dwell when it scrolls out of view or the card unmounts (deck advance).
 */
function PhotoBlock({
  photoKey,
  index,
  candidateId,
  transform,
  isPreview,
  onComment,
  displayName,
}: {
  photoKey: string;
  index: number;
  candidateId?: string;
  transform?: string;
  isPreview: boolean;
  onComment?: (t: LikeTarget) => void;
  displayName: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (isPreview) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const flush = () => {
      if (startRef.current != null) {
        trackMediaView(photoKey, mediaTypeOf(photoKey), {
          dwellMs: Date.now() - startRef.current,
          index,
          viewedUserId: candidateId,
          context: 'discovery',
          cardVariant: CARD_VARIANT,
        });
        startRef.current = null;
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (startRef.current == null) startRef.current = Date.now();
          } else {
            flush();
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey, index, candidateId, isPreview]);

  return (
    <div ref={ref} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-surface group">
      <MediaImage
        src={photoKey}
        alt={displayName}
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
        style={pictureTransformStyle(transform)}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-3 right-3 z-10">
        <CommentButton
          onComment={onComment}
          displayName={displayName}
          label={mediaLikeType(photoKey) === 'VIDEO' ? 'Like video' : 'Like photo'}
          target={{
            type: mediaLikeType(photoKey),
            ref: photoKey,
            label: mediaLikeType(photoKey) === 'VIDEO' ? 'Video' : 'Photo',
          }}
        />
      </div>
    </div>
  );
}

/** A written prompt that reports `prompt_view` once when it first scrolls into view. */
function PromptBlock({
  prompt,
  candidateId,
  isPreview,
  onComment,
  displayName,
}: {
  prompt: { promptId: string; answer: string };
  candidateId?: string;
  isPreview: boolean;
  onComment?: (t: LikeTarget) => void;
  displayName: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    if (isPreview) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5 && !firedRef.current) {
            firedRef.current = true;
            trackPromptView(prompt.promptId, { viewedUserId: candidateId, cardVariant: CARD_VARIANT });
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.promptId, candidateId, isPreview]);

  return (
    <div ref={ref}>
      <ElementCard title={prompt.promptId}>
        <p className="text-sm text-text leading-snug font-medium">{prompt.answer}</p>
        <CommentButton
          onComment={onComment}
          displayName={displayName}
          label="Reply"
          target={{ type: 'PROMPT', ref: prompt.promptId, label: 'Prompt', preview: prompt.answer }}
        />
      </ElementCard>
    </div>
  );
}

/**
 * RoseIcon — the discovery rose (super-like) glyph, matched to iOS `RoseButton`: a stroked line-art
 * rose (a 2.5-turn spiral bloom, outer petal arcs, stem + two leaves) over a 4-stop rose-gold
 * metallic disc, desaturating to silver in the "spent" (no roses left) state.
 */
function RoseIcon({ spent = false, size = 40 }: { spent?: boolean; size?: number }) {
  const S = 44;
  const cx = S / 2;
  const cy = S / 2 - S * 0.06;
  const maxR = S * 0.24;
  const f = (n: number) => n.toFixed(2);
  let d = '';
  const turns = 2.5;
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * 2 * Math.PI;
    const r = maxR * t;
    d += `${i === 0 ? 'M' : 'L'}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))} `;
  }
  const petalR = maxR * 1.05;
  d += `M${f(cx - petalR)} ${f(cy)} `;
  d += `C${f(cx - petalR)} ${f(cy - petalR * 0.7)} ${f(cx - petalR * 0.6)} ${f(cy - petalR)} ${f(cx)} ${f(cy - petalR)} `;
  d += `C${f(cx + petalR * 0.6)} ${f(cy - petalR)} ${f(cx + petalR)} ${f(cy - petalR * 0.7)} ${f(cx + petalR)} ${f(cy)} `;
  const stemTop = cy + maxR * 0.9;
  const stemBottom = S - S * 0.1;
  d += `M${f(cx)} ${f(stemTop)} L${f(cx)} ${f(stemBottom)} `;
  const leafY = (stemTop + stemBottom) / 2;
  d += `M${f(cx)} ${f(leafY)} Q${f(cx - S * 0.1)} ${f(leafY - S * 0.1)} ${f(cx - S * 0.16)} ${f(leafY - S * 0.02)} `;
  d += `M${f(cx)} ${f(leafY + S * 0.04)} Q${f(cx + S * 0.1)} ${f(leafY - S * 0.04)} ${f(cx + S * 0.16)} ${f(leafY + S * 0.02)} `;

  const gid = spent ? 'ohRoseMetalSpent' : 'ohRoseMetal';
  const stops = spent
    ? ['#dbdbdb', '#b3b3b3', '#8c8c8c', '#c7c7c7']
    : ['#fce0d4', '#e8a899', '#c98080', '#f5cfc2'];
  const stroke = spent ? '#737373' : 'rgba(92,15,33,0.92)';
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.42" stopColor={stops[1]} />
          <stop offset="0.76" stopColor={stops[2]} />
          <stop offset="1" stopColor={stops[3]} />
        </linearGradient>
      </defs>
      <circle cx={S / 2} cy={S / 2} r={S / 2 - 1} fill={`url(#${gid})`} />
      <path d={d.trim()} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DiscoveryCard({
  candidate,
  onPass,
  onComment,
  onRose,
  rosesRemaining,
  isPreview = false,
  className = '',
}: DiscoveryCardProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  const audioKey = candidate.audioPrompt || '';
  const audioSrc = useMediaSrc(audioKey);
  const interests = (candidate.interests || []).filter((i) => !!i);

  // ── section_view: report the top-most visible section anchor as the user scrolls, with dwell
  // (mirrors iOS reportVisibleSection). No-op unless analytics is enabled + consented.
  const photosAnchor = useRef<HTMLDivElement>(null);
  const bioAnchor = useRef<HTMLDivElement>(null);
  const interestsAnchor = useRef<HTMLDivElement>(null);
  const currentSectionRef = useRef<Section>('PHOTOS');
  const sectionStartRef = useRef<number>(Date.now());
  useEffect(() => {
    if (isPreview) return;
    const anchors: Array<[Section, React.RefObject<HTMLDivElement>]> = [
      ['PHOTOS', photosAnchor],
      ['BIO', bioAnchor],
      ['INTERESTS', interestsAnchor],
    ];
    const THRESHOLD = 140;
    const report = () => {
      let current: Section = 'PHOTOS';
      for (const [name, ref] of anchors) {
        const el = ref.current;
        if (el && el.getBoundingClientRect().top <= THRESHOLD) current = name;
      }
      if (current !== currentSectionRef.current) {
        const now = Date.now();
        trackSectionView(currentSectionRef.current, {
          viewedUserId: candidate.id,
          dwellMs: now - sectionStartRef.current,
          context: 'discovery',
          cardVariant: CARD_VARIANT,
        });
        currentSectionRef.current = current;
        sectionStartRef.current = now;
      }
    };
    window.addEventListener('scroll', report, true);
    report();
    return () => {
      window.removeEventListener('scroll', report, true);
      trackSectionView(currentSectionRef.current, {
        viewedUserId: candidate.id,
        dwellMs: Date.now() - sectionStartRef.current,
        context: 'discovery',
        cardVariant: CARD_VARIANT,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id, isPreview]);

  const handleAudioTimeUpdate = () => audioRef.current && setPlaybackProgress(audioRef.current.currentTime);
  const handleAudioLoadedMetadata = () => audioRef.current && setAudioDuration(audioRef.current.duration);
  const formatAudioTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds === Infinity) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
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
        trackMediaView(audioKey, 'voice', { viewedUserId: candidate.id, context: 'discovery', cardVariant: CARD_VARIANT });
      }
    }
  };

  // ── Element builders (return JSX or null) ────────────────────────────────────
  const vitalsChips: string[] = [];
  if (candidate.work) vitalsChips.push(`💼 ${candidate.work}`);
  if (candidate.education) vitalsChips.push(`🎓 ${candidate.education}`);
  if (candidate.hometown) vitalsChips.push(`📍 ${candidate.hometown}`);
  if (candidate.height) vitalsChips.push(`📏 ${candidate.height}`);
  if (candidate.relationshipType) vitalsChips.push(humanize(String(candidate.relationshipType)));
  const chipRow = (items: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c, i) => (
        <span key={i} className="px-2.5 py-1 bg-surface-card border border-border rounded-full text-xs font-medium text-text-secondary">
          {c}
        </span>
      ))}
    </div>
  );

  const vitalsEl = vitalsChips.length > 0 ? <ElementCard>{chipRow(vitalsChips)}</ElementCard> : null;

  const bioEl = candidate.bio ? (
    <ElementCard title="Bio">
      <p className="text-sm text-text leading-relaxed">{candidate.bio}</p>
      <CommentButton onComment={onComment} displayName={displayName} label="Comment on bio" target={{ type: 'BIO', label: 'Bio', preview: candidate.bio }} />
    </ElementCard>
  ) : null;

  const voiceEl = audioKey ? (
    <ElementCard>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayAudio}
          className="w-10 h-10 rounded-full bg-ig-blue text-white flex items-center justify-center shrink-0 cursor-pointer hover:opacity-90"
          title={isPlayingAudio ? 'Pause Voice Note' : 'Play Voice Note'}
        >
          {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Voice Note
            </span>
            <span className="text-text-secondary font-mono text-[11px]">
              {formatAudioTime(playbackProgress)} / {formatAudioTime(audioDuration)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div className="h-full bg-ig-blue transition-all duration-100 ease-linear" style={{ width: `${audioDuration > 0 ? (playbackProgress / audioDuration) * 100 : 0}%` }} />
          </div>
        </div>
        <CommentButton onComment={onComment} displayName={displayName} label="Reply" target={{ type: 'VOICE', ref: audioKey, label: 'Voice note' }} className="!text-[11px] !py-1 !px-2.5" />
      </div>
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleAudioTimeUpdate}
        onLoadedMetadata={handleAudioLoadedMetadata}
        onEnded={() => {
          setIsPlayingAudio(false);
          setPlaybackProgress(0);
          if (!isPreview && audioKey) {
            trackMediaView(audioKey, 'voice', { viewedUserId: candidate.id, context: 'discovery', cardVariant: CARD_VARIANT, playedToCompletion: true });
          }
        }}
        className="hidden"
      />
    </ElementCard>
  ) : null;

  const interestsEl =
    interests.length > 0 ? (
      <ElementCard title="Interests">
        <div className="flex flex-wrap gap-2">
          {interests.map((interest, i) =>
            canComment ? (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onComment?.({ type: 'INTEREST', ref: interest, label: 'Interest', preview: interest });
                }}
                aria-label={`Comment on interest ${interest} to like`}
                className="px-3 py-1 border border-border rounded-full text-xs font-medium text-text-secondary bg-surface-card hover:bg-surface-hover transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Heart className="w-3 h-3 text-red-500" /> {interest}
              </button>
            ) : (
              <span key={i} className="px-3 py-1 border border-border rounded-full text-xs font-medium text-text-secondary bg-surface-card">
                #{interest}
              </span>
            )
          )}
        </div>
      </ElementCard>
    ) : null;

  const lifestyleValues: string[] = [];
  if (candidate.drinkingStatus) lifestyleValues.push(`🍷 ${humanize(candidate.drinkingStatus)}`);
  if (candidate.smokingStatus) lifestyleValues.push(`🚬 ${humanize(candidate.smokingStatus)}`);
  if (candidate.cannabisStatus) lifestyleValues.push(`🌿 ${humanize(candidate.cannabisStatus)}`);
  if (candidate.wantsKids) lifestyleValues.push(`👶 ${humanize(candidate.wantsKids)}`);
  if (candidate.religion) lifestyleValues.push(`🙏 ${humanize(candidate.religion)}`);
  if (candidate.starSign) lifestyleValues.push(`✨ ${humanize(candidate.starSign)}`);
  if (candidate.exercise) lifestyleValues.push(`🏃 ${humanize(candidate.exercise)}`);
  if (candidate.languages?.length) lifestyleValues.push(`🗣 ${candidate.languages.map(humanize).join(', ')}`);
  const lifestyleEl = lifestyleValues.length > 0 ? <ElementCard title="Lifestyle">{chipRow(lifestyleValues)}</ElementCard> : null;

  const pillsEl = (title: string, values?: string[]) => {
    const items = (values || []).filter((v) => !!v);
    if (items.length === 0) return null;
    return <ElementCard title={title}>{chipRow(items.map(humanize))}</ElementCard>;
  };

  // ── Interleave assembly (mirrors iOS renderAllSections order) ─────────────────
  const media = photos.map((k, i) => ({ k, i }));
  let mi = 0;
  const nextPhoto = () => (mi < media.length ? media[mi++] : null);
  const promptList = (candidate.prompts || []).filter((p) => p.answer && p.answer.trim().length > 0);
  let pi = 0;
  const nextPrompt = () => (pi < promptList.length ? promptList[pi++] : null);

  const photoNode = (m: { k: string; i: number } | null) =>
    m ? (
      <PhotoBlock
        photoKey={m.k}
        index={m.i}
        candidateId={candidate.id}
        transform={candidate.pictureTransforms?.[m.k]}
        isPreview={isPreview}
        onComment={onComment}
        displayName={displayName}
      />
    ) : null;
  const promptNode = () => {
    const p = nextPrompt();
    return p ? (
      <PromptBlock prompt={p} candidateId={candidate.id} isPreview={isPreview} onComment={onComment} displayName={displayName} />
    ) : null;
  };

  const entries: Array<{ node: React.ReactNode; marker?: Section }> = [];
  const placed = new Set<Section>();
  const add = (node: React.ReactNode | null, section?: Section) => {
    if (!node) return;
    let marker: Section | undefined;
    if (section && !placed.has(section)) {
      placed.add(section);
      marker = section;
    }
    entries.push({ node, marker });
  };

  add(photoNode(nextPhoto()), 'PHOTOS'); // 1. Photo 1
  add(vitalsEl, 'BIO'); // 2. Vitals (marks "about")
  add(promptNode()); // 3. Prompt 1
  add(photoNode(nextPhoto())); // 4. Photo 2
  add(bioEl, 'BIO'); // 5. Bio (marks about if there were no vitals)
  add(voiceEl); // 6. Voice
  add(photoNode(nextPhoto())); // 7. Photo 3
  add(promptNode()); // 8. Prompt 2
  add(interestsEl, 'INTERESTS'); // 9. Interests
  add(photoNode(nextPhoto())); // 10. Photo 4
  add(lifestyleEl); // 11. Lifestyle
  add(promptNode()); // 12. Prompt 3
  let takeMedia = true;
  while (mi < media.length || pi < promptList.length) {
    add(takeMedia ? photoNode(nextPhoto()) ?? promptNode() : promptNode() ?? photoNode(nextPhoto()));
    takeMedia = !takeMedia;
  }
  add(pillsEl('Causes', candidate.causes));
  add(pillsEl('Communities', candidate.communities));
  add(pillsEl('Qualities', candidate.qualities));

  const anchorRefFor = (s: Section) => (s === 'PHOTOS' ? photosAnchor : s === 'BIO' ? bioAnchor : interestsAnchor);

  return (
    <article className={`w-full max-w-[470px] mx-auto bg-surface-card sm:border sm:border-border sm:rounded-xl flex flex-col overflow-hidden select-none ${className}`}>
      {/* Recommendation banner */}
      {((candidate.score && candidate.score >= 0.9) || candidate.recommendationReason) && (
        <div className="bg-ig-blue/5 border-b border-border px-4 py-3 text-[11px] text-text-secondary leading-relaxed italic">
          {candidate.recommendationReason || 'Handpicked for you — high compatibility and shared vibe.'}
        </div>
      )}

      {/* Header (name / age / location + Rose super-like) — chrome, not a section. */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-border">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-text truncate">{displayName}</h2>
          <div className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
            {age && age > 0 ? <span>{age}</span> : null}
            {location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 shrink-0" /> {location}
              </span>
            )}
            {candidate.verified && <CheckCircle2 className="w-3.5 h-3.5 text-ig-blue shrink-0" />}
          </div>
        </div>
        {onRose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (rosesRemaining !== 0) onRose();
            }}
            disabled={rosesRemaining === 0}
            aria-label={rosesRemaining == null ? 'Send a rose' : `Send a rose, ${rosesRemaining} left today`}
            title={rosesRemaining == null ? 'Send a rose' : `Send a rose · ${rosesRemaining} left today`}
            className="relative shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RoseIcon spent={rosesRemaining === 0} size={40} />
            {rosesRemaining != null && rosesRemaining > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-black/75 text-[9px] font-bold text-white flex items-center justify-center">
                {rosesRemaining}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Interleaved element scroll */}
      <div className="p-4 space-y-4 flex-1">
        {entries.length === 0 ? (
          <p className="text-xs text-text-muted italic text-center py-8">Nothing shared here yet.</p>
        ) : (
          entries.map((e, idx) => (
            <React.Fragment key={idx}>
              {e.marker && <div ref={anchorRefFor(e.marker)} className="h-0" aria-hidden />}
              {e.node}
            </React.Fragment>
          ))
        )}

        {onPass ? (
          <div className="pt-2">
            <button
              type="button"
              onClick={onPass}
              className="w-full py-3.5 border border-border rounded-full text-sm font-semibold text-text hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Pass
            </button>
            <p className="pt-3 text-center text-[11px] text-text-muted">To like, comment on something above</p>
          </div>
        ) : isPreview ? (
          <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] font-semibold text-text-secondary">
            <span className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-red-500" /> Ready for matching
            </span>
            <span className="text-ig-blue font-mono">OneHook Feed Preview</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
