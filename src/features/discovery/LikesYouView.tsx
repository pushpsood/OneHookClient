import { useEffect, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
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
import { trackLikesYouView } from '../../lib/analytics/analytics';
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
  const name = profile?.displayName || like.fromUserId;
  const isMediaTarget =
    like.likeTargetType === 'PHOTO' || like.likeTargetType === 'VIDEO';

  const typeLabel = meta.label.replace(/^(a |an |the )/, 'your ');

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors select-none">
      <div className="w-11 h-11 shrink-0 rounded-full overflow-hidden bg-surface border border-border">
        <MediaImage
          src={profile?.photo}
          alt={name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-text leading-snug">
          <span className="font-semibold text-text">{name}</span>{' '}
          <span className="text-text-secondary">liked {typeLabel}.</span>{' '}
          <span className="text-text-muted text-xs font-normal">{timeAgo(like.createdAt)}</span>
        </p>
        {like.comment && (
          <p className="text-sm text-text truncate mt-0.5 opacity-90">
            "{like.comment}"
          </p>
        )}
      </div>

      {isMediaTarget && like.likeTargetRef && (
        <div className="shrink-0 ml-3 w-11 h-11 rounded-lg overflow-hidden border border-border">
          <MediaImage
            src={like.likeTargetRef}
            alt="Liked media"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </div>
  );
}

export function LikesYouView() {
  const { likes, count, loading, error, refresh } = useReceivedLikes();
  const [profiles, setProfiles] = useState<Record<string, LikerProfile>>({});

  const [portalNode, setPortalNode] = useState<HTMLElement | null>(() => {
    if (typeof document !== 'undefined') {
      return document.getElementById('topbar-center-slot');
    }
    return null;
  });

  useEffect(() => {
    if (!portalNode && typeof document !== 'undefined') {
      setPortalNode(document.getElementById('topbar-center-slot'));
    }
  }, [portalNode]);

  // Analytics: the received-likes ("Likes You") surface was viewed (engagement signal).
  useEffect(() => {
    if (!loading) trackLikesYouView({ count });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

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
  }, [likes]);

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
          <h2 className="text-lg font-semibold text-text">Likes Unavailable</h2>
          <p className="text-sm text-text-secondary">{error.message}</p>
          <button
            onClick={refresh}
            className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThisWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const today: ReceivedLike[] = [];
  const thisWeek: ReceivedLike[] = [];
  const earlier: ReceivedLike[] = [];

  likes.forEach((like) => {
    const time = Date.parse(like.createdAt);
    if (Number.isNaN(time)) {
      earlier.push(like);
    } else if (time >= startOfToday) {
      today.push(like);
    } else if (time >= startOfThisWeek) {
      thisWeek.push(like);
    } else {
      earlier.push(like);
    }
  });

  const Section = ({ title, items }: { title: string; items: ReceivedLike[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <h3 className="px-4 py-2 text-sm font-bold text-text">{title}</h3>
        <div className="divide-y divide-border/40">
          {items.map((like, i) => (
            <LikeRow
              key={`${like.fromUserId}-${like.createdAt}-${i}`}
              like={like}
              profile={profiles[like.fromUserId]}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-bg text-text overflow-y-auto">
      {/* ── REFRESH in Top Header Center ── */}
      {portalNode &&
        createPortal(
          <div className="relative group/refresh flex items-center">
            <button
              type="button"
              onClick={refresh}
              title="Refresh notifications"
              aria-label="Refresh notifications"
              className="h-9 px-3 flex items-center gap-2 rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer text-sm font-semibold"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2] ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/refresh:opacity-100 transition-all duration-150 shadow-md z-50">
              Refresh notifications
            </div>
          </div>,
          portalNode
        )}

      <div className="max-w-[600px] mx-auto py-4">

        {likes.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center mx-auto mb-3 text-text-muted">
              <Heart className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-text mb-1">Activity On Your Profile</h3>
            <p className="text-text-secondary text-xs max-w-xs mx-auto">
              When someone likes or comments on your profile, you'll see it here.
            </p>
          </div>
        ) : (
          <div className="pb-8">
            <Section title="Today" items={today} />
            <Section title="This Week" items={thisWeek} />
            <Section title="Earlier" items={earlier} />
          </div>
        )}
      </div>
    </div>
  );
}
