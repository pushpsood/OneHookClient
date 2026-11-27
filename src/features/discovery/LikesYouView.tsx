/**
 * Likes You & Likes Hub (mirrors iOS `LikesHubViewController` + `LikesYouViewController`):
 *  - Summary strip for held Hook Requests & Unarchive Requests + Received Likes count
 *  - Sort dropdown (`ReceivedLikesSort`: Recent, Oldest, Nearest, Roses first, Verified first, Age)
 *  - Compare mode (select up to 5 likers for side-by-side comparison on Super/Infinity, or Must teaser)
 *  - Tapping a liker opens `LikerProfileDialog` with Hinge-style Like Back flow
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Check,
  CheckCircle2,
  Columns3,
  Flower2,
  Heart,
  Image as ImageIcon,
  Inbox,
  MapPin,
  MessageSquareQuote,
  RefreshCw,
  Sparkles,
  Tag,
  Video,
  Volume2,
} from 'lucide-react';
import { ReceivedLikesSort } from 'onehook-api-client';
import { usePhotoLightbox } from '../../components/common/PhotoLightbox';
import { useReceivedLikes } from '../../hooks/use-api';
import { trackLikesYouView, Screen, UiElement, trackProps } from '../../lib/analytics/analytics';
import { ProfileApi } from '../../api/profile';
import { MediaImage } from '../../components/common/MediaImage';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import type { ReceivedLike } from '../../api/rest';
import { useAppStore } from '../../store/app-store';
import { ICON_SECTION } from '../../lib/icon-tokens';
import { totalPendingCount } from '../../lib/hook-forming-guard';
import type { MatchingProfile } from '../../types';
import { LikesCompareDialog } from './LikesCompareDialog';
import { LikerProfileDialog } from './LikerProfileDialog';

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

const LIKES_SORT_OPTIONS: ReadonlyArray<{ value: ReceivedLikesSort; label: string }> = [
  { value: ReceivedLikesSort.NEWEST, label: 'Most recent' },
  { value: ReceivedLikesSort.OLDEST, label: 'Oldest' },
  { value: ReceivedLikesSort.NEAREST, label: 'Nearest' },
  { value: ReceivedLikesSort.ROSES_FIRST, label: 'Roses first' },
  { value: ReceivedLikesSort.VERIFIED_FIRST, label: 'Verified first' },
  { value: ReceivedLikesSort.AGE_YOUNGEST, label: 'Youngest' },
  { value: ReceivedLikesSort.AGE_OLDEST, label: 'Eldest' },
];

interface LikerEntry {
  profile: MatchingProfile | null;
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

function sortLikesList(
  likes: readonly ReceivedLike[],
  sort: ReceivedLikesSort,
  profiles: Record<string, LikerEntry>
): ReceivedLike[] {
  const list = [...likes];
  const ts = (l: ReceivedLike) => {
    const t = Date.parse(l.createdAt);
    return Number.isNaN(t) ? 0 : t;
  };
  list.sort((a, b) => {
    switch (sort) {
      case ReceivedLikesSort.OLDEST:
        return ts(a) - ts(b);
      case ReceivedLikesSort.NEAREST: {
        const da = a.distanceKm;
        const db = b.distanceKm;
        if (da == null && db == null) return ts(b) - ts(a);
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      }
      case ReceivedLikesSort.ROSES_FIRST: {
        const ra = a.likeKind === 'ROSE' ? 0 : 1;
        const rb = b.likeKind === 'ROSE' ? 0 : 1;
        return ra !== rb ? ra - rb : ts(b) - ts(a);
      }
      case ReceivedLikesSort.VERIFIED_FIRST: {
        const va = profiles[a.fromUserId]?.profile?.verified ? 0 : 1;
        const vb = profiles[b.fromUserId]?.profile?.verified ? 0 : 1;
        return va !== vb ? va - vb : ts(b) - ts(a);
      }
      case ReceivedLikesSort.AGE_YOUNGEST: {
        const aa = profiles[a.fromUserId]?.profile?.age;
        const ab = profiles[b.fromUserId]?.profile?.age;
        if (aa == null && ab == null) return ts(b) - ts(a);
        if (aa == null) return 1;
        if (ab == null) return -1;
        return aa - ab;
      }
      case ReceivedLikesSort.AGE_OLDEST: {
        const aa = profiles[a.fromUserId]?.profile?.age;
        const ab = profiles[b.fromUserId]?.profile?.age;
        if (aa == null && ab == null) return ts(b) - ts(a);
        if (aa == null) return 1;
        if (ab == null) return -1;
        return ab - aa;
      }
      default:
        return ts(b) - ts(a);
    }
  });
  return list;
}

function LikeRow({
  like,
  entry,
  index,
  compareMode,
  selectedForCompare,
  onToggleCompare,
  onOpenProfile,
}: {
  key?: string;
  like: ReceivedLike;
  entry?: LikerEntry;
  index?: number;
  compareMode: boolean;
  selectedForCompare: boolean;
  onToggleCompare: () => void;
  onOpenProfile: () => void;
}) {
  const meta = (like.likeTargetType && TYPE_META[like.likeTargetType]) || {
    label: 'your profile',
    icon: Heart,
  };
  const name = entry?.displayName || like.fromUserId;
  const age = entry?.profile?.age;
  const isVerified = Boolean(entry?.profile?.verified);
  const isRose = like.likeKind === 'ROSE';

  const liker = usePhotoLightbox({
    photos: entry?.photo ? [entry.photo] : [],
    ownerName: name,
    trackContext: Screen.LIKES_YOU,
    viewedUserId: like.fromUserId,
  });
  const likedOwn = usePhotoLightbox({
    photos: like.likeTargetType === 'PHOTO' && like.likeTargetRef ? [like.likeTargetRef] : [],
    ownerName: 'Your photo',
  });
  const isMediaTarget =
    like.likeTargetType === 'PHOTO' || like.likeTargetType === 'VIDEO';

  const typeLabel = meta.label.replace(/^(a |an |the )/, 'your ');

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors select-none ${
        isRose ? 'bg-rose-500/5 border-l-2 border-l-rose-500' : ''
      }`}
    >
      {compareMode && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selectedForCompare}
          aria-label={`Select ${name} to compare`}
          onClick={onToggleCompare}
          // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_COMPARE_SELECT once enabled on web.
          data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.compare_select"
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer ${
            selectedForCompare ? 'bg-accent border-accent text-bg' : 'border-border bg-surface'
          }`}
        >
          {selectedForCompare && <Check className={ICON_SECTION.section.actionIcon} />}
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (entry?.photo) liker.open(0);
          else onOpenProfile();
        }}
        aria-label={`View ${name}'s photo full screen`}
        data-track-exempt="duplicate: opening profile uses likes_you.profile_open on the row action"
        className="w-12 h-12 shrink-0 rounded-full overflow-hidden bg-surface border border-border cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <MediaImage
          src={entry?.photo}
          alt={name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </button>
      {liker.lightbox}
      {likedOwn.lightbox}

      <button
        type="button"
        onClick={() => (compareMode ? onToggleCompare() : onOpenProfile())}
        {...trackProps(UiElement.LIKES_YOU_PROFILE_OPEN, {
          ...(index !== undefined ? { index } : {}),
          targetId: like.fromUserId,
        })}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <p className="text-sm text-text leading-snug flex items-center gap-1 flex-wrap">
          <span className="font-semibold text-text">
            {name}
            {age ? `, ${age}` : ''}
          </span>
          {isVerified && <CheckCircle2 className={`${ICON_SECTION.section.actionIcon} text-ig-blue`} />}
          {isRose && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-500 text-[10px] font-bold">
              <Flower2 className={ICON_SECTION.section.badgeIcon} /> Rose
            </span>
          )}
          <span className="text-text-secondary">
            {isRose ? 'sent a rose on' : 'liked'} {typeLabel}.
          </span>
          {like.distanceKm != null && (
            <span className="inline-flex items-center gap-0.5 text-text-muted text-xs">
              <MapPin className={ICON_SECTION.section.badgeIcon} /> {like.distanceKm} km
            </span>
          )}
          <span className="text-text-muted text-xs font-normal">{timeAgo(like.createdAt)}</span>
        </p>
        {like.comment && (
          <p className="text-sm text-text truncate mt-0.5 opacity-90">&ldquo;{like.comment}&rdquo;</p>
        )}
      </button>

      {isMediaTarget && like.likeTargetRef && (
        <button
          type="button"
          onClick={() => {
            if (like.likeTargetType === 'PHOTO') likedOwn.open(0);
            else onOpenProfile();
          }}
          aria-label={like.likeTargetType === 'PHOTO' ? 'View your liked photo full screen' : `Inspect ${name}`}
          {...(like.likeTargetType === 'PHOTO'
            ? trackProps(UiElement.LIKES_YOU_LIKED_ITEM_OPEN, index !== undefined ? { index } : {})
            : { 'data-track-exempt': 'duplicate: opens liker profile sheet' })}
          className="shrink-0 ml-1 w-11 h-11 rounded-lg overflow-hidden border border-border cursor-pointer"
        >
          <MediaImage
            src={like.likeTargetRef}
            alt="Liked media"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </button>
      )}
    </div>
  );
}

export function LikesYouView({
  embedded = false,
  onOpenRequests,
  onOpenArchives,
  onOpenUpgrade,
  onMatched,
}: {
  embedded?: boolean;
  onOpenRequests?: () => void;
  onOpenArchives?: () => void;
  onOpenUpgrade?: () => void;
  onMatched?: (matchId?: string) => Promise<void> | void;
} = {}) {
  const [sort, setSort] = useState<ReceivedLikesSort>(ReceivedLikesSort.NEWEST);
  const { likes, count, loading, error, refresh } = useReceivedLikes(true, sort);
  const userState = useAppStore((s) => s.userState);
  const tier = userState?.subscriptionTier;
  const pending = userState?.pending;
  const [profiles, setProfiles] = useState<Record<string, LikerEntry>>({});
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);

  const [portalNode, setPortalNode] = useState<HTMLElement | null>(() => {
    if (!embedded && typeof document !== 'undefined') {
      return document.getElementById('topbar-center-slot');
    }
    return null;
  });

  useEffect(() => {
    if (!embedded && !portalNode && typeof document !== 'undefined') {
      setPortalNode(document.getElementById('topbar-center-slot'));
    }
  }, [embedded, portalNode]);

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
      ids.map(async (id): Promise<[string, LikerEntry]> => {
        try {
          const p = await ProfileApi.getMatching(id);
          const photos: string[] = p?.pictures ?? [];
          return [id, { profile: p, displayName: p?.displayName, photo: photos[0] }];
        } catch {
          return [id, { profile: null }];
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

  const sortedLikes = useMemo(() => sortLikesList(likes, sort, profiles), [likes, sort, profiles]);

  const toggleCompareId = (userId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (prev.length >= 5) return prev;
      return [...prev, userId];
    });
  };

  const inspectedLike = useMemo(
    () => (inspectedUserId ? sortedLikes.find((l) => l.fromUserId === inspectedUserId) ?? null : null),
    [inspectedUserId, sortedLikes]
  );

  const compareEntries = useMemo(
    () =>
      compareIds
        .map((id) => {
          const like = sortedLikes.find((l) => l.fromUserId === id);
          if (!like) return null;
          return { like, profile: profiles[id]?.profile ?? null };
        })
        .filter((x): x is { like: ReceivedLike; profile: MatchingProfile | null } => Boolean(x)),
    [compareIds, sortedLikes, profiles]
  );

  if (loading && likes.length === 0) {
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
            {...trackProps(UiElement.LIKES_YOU_RETRY)}
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

  const isCustomSort = sort !== ReceivedLikesSort.NEWEST;
  const today: ReceivedLike[] = [];
  const thisWeek: ReceivedLike[] = [];
  const earlier: ReceivedLike[] = [];

  if (!isCustomSort) {
    sortedLikes.forEach((like) => {
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
  }

  const renderSection = (title: string, items: ReceivedLike[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <h3 className="px-4 py-2 text-sm font-bold text-text">{title}</h3>
        <div className="divide-y divide-border/40">
          {items.map((like, i) => (
            <LikeRow
              key={`${like.fromUserId}-${like.createdAt}-${i}`}
              like={like}
              entry={profiles[like.fromUserId]}
              index={i}
              compareMode={compareMode}
              selectedForCompare={compareIds.includes(like.fromUserId)}
              onToggleCompare={() => toggleCompareId(like.fromUserId)}
              onOpenProfile={() => setInspectedUserId(like.fromUserId)}
            />
          ))}
        </div>
      </div>
    );
  };

  const pendingReqCount = pending?.hookRequestsIn ?? 0;
  const pendingArchiveCount = pending?.archiveRequestsIn ?? 0;

  return (
    <div className="h-full bg-bg text-text overflow-y-auto">
      {!embedded && portalNode &&
        createPortal(
          <div className="relative group/refresh flex items-center">
            <button
              type="button"
              onClick={refresh}
              title="Refresh notifications"
              aria-label="Refresh notifications"
              {...trackProps(UiElement.LIKES_YOU_REFRESH)}
              className="h-9 px-3 flex items-center gap-2 rounded-xl text-text hover:bg-surface-hover transition-colors cursor-pointer text-sm font-semibold"
            >
              <RefreshCw className={`${ICON_SECTION.header.icon} ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover/refresh:opacity-100 transition-all duration-150 shadow-md z-50">
              Refresh notifications
            </div>
          </div>,
          portalNode
        )}

      <div className="max-w-[600px] mx-auto py-4 space-y-4">
        {/* Hub cards for held hook & unarchive requests */}
        {(pendingReqCount > 0 || pendingArchiveCount > 0) && (
          <div className="px-4 flex flex-wrap gap-2">
            {pendingReqCount > 0 && onOpenRequests && (
              <button
                type="button"
                onClick={onOpenRequests}
                // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_REQUEST_OPEN once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.request_open"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-semibold cursor-pointer"
              >
                <Inbox className={`${ICON_SECTION.toolbar.pillIcon} text-accent`} />
                <span>{pendingReqCount} Hook request{pendingReqCount === 1 ? '' : 's'}</span>
              </button>
            )}
            {pendingArchiveCount > 0 && onOpenArchives && (
              <button
                type="button"
                onClick={onOpenArchives}
                data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.request_open"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-accent/40 bg-accent/5 hover:bg-accent/10 text-xs font-semibold cursor-pointer"
              >
                <Archive className={`${ICON_SECTION.toolbar.pillIcon} text-accent`} />
                <span>{pendingArchiveCount} Unarchive request{pendingArchiveCount === 1 ? '' : 's'}</span>
              </button>
            )}
          </div>
        )}

        {/* Controls bar: Sort + Compare + inline refresh when embedded */}
        <div className="px-4 flex items-center justify-between gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ReceivedLikesSort)}
              aria-label="Sort likes"
              // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_SORT_SELECT once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.sort_select"
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs text-text font-medium outline-none focus:border-accent"
            >
              {LIKES_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            {likes.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setCompareMode((v) => !v);
                  setCompareIds([]);
                }}
                // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_COMPARE_MODE once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.compare_mode"
                className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                  compareMode ? 'bg-accent text-bg border-accent' : 'bg-surface border-border text-text'
                }`}
              >
                <Columns3 className={ICON_SECTION.toolbar.pillIcon} />
                {compareMode ? 'Done comparing' : 'Compare'}
              </button>
            )}
            {embedded && (
              <button
                type="button"
                onClick={refresh}
                aria-label="Refresh likes"
                {...trackProps(UiElement.LIKES_YOU_REFRESH)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-hover text-text cursor-pointer"
              >
                <RefreshCw className={`${ICON_SECTION.toolbar.pillIcon} ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {compareMode && (
          <div className="mx-4 p-3 rounded-xl border border-accent/40 bg-accent/5 flex items-center justify-between gap-2 text-xs">
            <span className="text-text-secondary">
              Select up to 5 likes ({compareIds.length}/5 selected)
            </span>
            <button
              type="button"
              disabled={compareIds.length < 2}
              onClick={() => setCompareOpen(true)}
              // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_COMPARE_OPEN once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.compare_open"
              className="px-3 py-1.5 rounded-lg bg-accent text-bg font-semibold disabled:opacity-40 cursor-pointer"
            >
              Compare ({compareIds.length})
            </button>
          </div>
        )}

        {sortedLikes.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center mx-auto mb-3 text-text-muted">
              <Heart className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-text mb-1">
              {totalPendingCount(pending) > 0 ? 'Pending Requests Waiting Above' : 'Activity On Your Profile'}
            </h3>
            <p className="text-text-secondary text-xs max-w-xs mx-auto">
              When someone likes or comments on your profile, you&rsquo;ll see it here.
            </p>
          </div>
        ) : isCustomSort ? (
          <div className="divide-y divide-border/40 pb-8">
            {sortedLikes.map((like, i) => (
              <LikeRow
                key={`${like.fromUserId}-${like.createdAt}-${i}`}
                like={like}
                entry={profiles[like.fromUserId]}
                index={i}
                compareMode={compareMode}
                selectedForCompare={compareIds.includes(like.fromUserId)}
                onToggleCompare={() => toggleCompareId(like.fromUserId)}
                onOpenProfile={() => setInspectedUserId(like.fromUserId)}
              />
            ))}
          </div>
        ) : (
          <div className="pb-8">
            {renderSection('Today', today)}
            {renderSection('This Week', thisWeek)}
            {renderSection('Earlier', earlier)}
          </div>
        )}
      </div>

      <LikerProfileDialog
        open={Boolean(inspectedLike)}
        onClose={() => setInspectedUserId(null)}
        like={inspectedLike}
        initialProfile={inspectedLike ? profiles[inspectedLike.fromUserId]?.profile : undefined}
        onMatched={onMatched}
        onActed={(uid) => {
          setCompareIds((prev) => prev.filter((x) => x !== uid));
          refresh();
        }}
      />

      <LikesCompareDialog
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        entries={compareEntries}
        tier={tier}
        onRemove={(uid) => setCompareIds((prev) => prev.filter((id) => id !== uid))}
        onInspect={(uid) => setInspectedUserId(uid)}
        onUpgrade={() => onOpenUpgrade?.()}
      />
    </div>
  );
}
