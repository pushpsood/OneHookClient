import { useEffect, useState } from 'react';
import { Eye, Maximize2 } from 'lucide-react';
import { getMyPhotoStats, type PhotoStats } from '../../api/analytics';

/**
 * Loads the caller's own photo stats once (owner derived from the JWT server-side). Failures leave
 * the map empty — stats are informational and never block the profile editor.
 */
export function useMyPhotoStats(refreshKey?: unknown): Record<string, PhotoStats> {
  const [stats, setStats] = useState<Record<string, PhotoStats>>({});
  useEffect(() => {
    let alive = true;
    getMyPhotoStats()
      .then((s) => alive && setStats(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return stats;
}

const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Owner-only overlay on a photo: unique viewers + full-screen opens, with a repeat-viewer breakdown. */
export function PhotoStatsBadge({ stats }: { stats?: PhotoStats }) {
  const s = stats ?? {
    uniqueViewers: 0,
    fullscreenViewers: 0,
    viewersMoreThanOnce: 0,
    viewersMoreThan10: 0,
    viewersMoreThan100: 0,
  };
  const detail =
    `Seen by ${s.uniqueViewers} ${s.uniqueViewers === 1 ? 'person' : 'people'}; ` +
    `opened full screen by ${s.fullscreenViewers}. ` +
    `Viewed more than once by ${s.viewersMoreThanOnce}, more than 10 times by ${s.viewersMoreThan10}, ` +
    `more than 100 times by ${s.viewersMoreThan100}. Only you can see this.`;
  return (
    <div
      className="absolute bottom-2 right-2 z-10 flex items-center gap-2 px-2 py-1 rounded bg-black/70 text-white text-[10px] font-semibold shadow"
      title={detail}
      aria-label={detail}
      role="note"
      data-testid="photo-stats"
    >
      <span className="flex items-center gap-0.5">
        <Eye className="w-3 h-3" aria-hidden="true" />
        {fmt(s.uniqueViewers)}
      </span>
      <span className="flex items-center gap-0.5">
        <Maximize2 className="w-3 h-3" aria-hidden="true" />
        {fmt(s.fullscreenViewers)}
      </span>
    </div>
  );
}
