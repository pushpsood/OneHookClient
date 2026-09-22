import { useEffect, useState, type ComponentType } from 'react';
import { motion } from 'motion/react';
import {
  Heart,
  Image as ImageIcon,
  Video,
  Volume2,
  MessageSquareQuote,
  Sparkles,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { useReceivedLikes } from '../../hooks/use-api';
import { ProfileApi } from '../../api/profile';
import { MediaImage } from '../../components/common/MediaImage';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import type { ReceivedLike } from '../../api/rest';

const TYPE_META: Record<
  string,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  PHOTO: { label: 'a photo', icon: ImageIcon },
  VIDEO: { label: 'a video', icon: Video },
  VOICE: { label: 'a voice note', icon: Volume2 },
  PROMPT: { label: 'a prompt', icon: MessageSquareQuote },
  INTEREST: { label: 'an interest', icon: Tag },
  BIO: { label: 'the bio', icon: Sparkles },
};

/** Compact hydrated view of a liker: display name + first photo, best-effort. */
interface LikerProfile {
  displayName?: string;
  photo?: string;
}

function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(then).toLocaleDateString();
}

function LikeRow({ like, profile }: { key?: string; like: ReceivedLike; profile?: LikerProfile }) {
  const meta = (like.likeTargetType && TYPE_META[like.likeTargetType]) || {
    label: 'your profile',
    icon: Heart,
  };
  const Icon = meta.icon;
  const name = profile?.displayName || like.fromUserId;
  const isMediaTarget =
    like.likeTargetType === 'PHOTO' || like.likeTargetType === 'VIDEO';

  // For PROMPT/INTEREST the ref is human-readable (promptId / interest value); surface it.
  const refDetail =
    (like.likeTargetType === 'PROMPT' || like.likeTargetType === 'INTEREST') && like.likeTargetRef
      ? like.likeTargetRef
      : null;

  return (
    <div className="flex gap-4 p-5 border border-border bg-white">
      <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden border border-border bg-border">
        <MediaImage
          src={profile?.photo}
          alt={name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-serif italic tracking-tight text-foreground truncate">
            {name}
          </h3>
          <span className="text-[9px] font-mono uppercase tracking-widest opacity-40 shrink-0">
            {timeAgo(like.createdAt)}
          </span>
        </div>

        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-accent flex items-center gap-1.5">
          <Icon className="w-3 h-3" /> Liked {meta.label}
          {refDetail ? <span className="opacity-60 normal-case tracking-normal">· {refDetail}</span> : null}
        </span>

        {like.comment ? (
          <p className="text-sm opacity-80 leading-relaxed font-serif italic border-l-2 border-accent/40 pl-3 py-0.5">
            “{like.comment}”
          </p>
        ) : (
          <p className="text-xs opacity-40 italic">Liked you</p>
        )}

        {isMediaTarget && like.likeTargetRef && (
          <div className="pt-1">
            <MediaImage
              src={like.likeTargetRef}
              alt="Liked media"
              loading="lazy"
              decoding="async"
              className="w-16 h-20 object-cover border border-border"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function LikesYouView() {
  const { likes, count, loading, error, refresh } = useReceivedLikes();
  const [profiles, setProfiles] = useState<Record<string, LikerProfile>>({});

  // Best-effort hydration of the liker's name/photo (the read side returns only fromUserId). Mirrors
  // how discovery hydrates candidate cards; failures fall back to the raw id.
  useEffect(() => {
    let active = true;
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const l of likes) {
      const id = l.fromUserId;
      if (id && !seen.has(id) && profiles[id] === undefined) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (ids.length === 0) return;
    void Promise.all(
      ids.map(async (id): Promise<[string, LikerProfile]> => {
        try {
          const p: any = await ProfileApi.get(id);
          const photos: string[] =
            (p?.pictures && p.pictures.length > 0 ? p.pictures : p?.photos) || [];
          return [id, { displayName: p?.displayName || p?.name, photo: photos[0] }];
        } catch {
          return [id, {}];
        }
      })
    ).then((entries) => {
      if (!active) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const [id, prof] of entries) next[id] = prof;
        return next;
      });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likes]);

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
          <h2 className="text-4xl font-serif italic uppercase tracking-tighter">Likes Unavailable</h2>
          <p className="text-xs opacity-60 leading-relaxed italic">{error.message}</p>
          <button
            onClick={refresh}
            className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 bg-[#F9F9F9] overflow-y-auto"
    >
      <div className="max-w-[560px] mx-auto p-6 sm:p-10 space-y-6">
        <div className="flex items-end justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-serif italic uppercase tracking-tighter flex items-center gap-2">
              <Heart className="w-5 h-5 text-accent" /> Likes You
            </h2>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-40">
              {count} {count === 1 ? 'person' : 'people'} commented to like you
            </p>
          </div>
          <button
            onClick={refresh}
            aria-label="Refresh likes"
            title="Refresh"
            className="w-9 h-9 border border-border flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {likes.length === 0 ? (
          <div className="bg-white border border-border p-12 text-center space-y-4">
            <h3 className="text-xl font-serif italic uppercase tracking-tight">No Likes Yet</h3>
            <p className="text-xs opacity-60 leading-relaxed italic">
              When someone comments on your photos, prompts or bio to like you, they&rsquo;ll show up
              here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {likes.map((like, i) => (
              <LikeRow key={`${like.fromUserId}-${like.createdAt}-${i}`} like={like} profile={profiles[like.fromUserId]} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
