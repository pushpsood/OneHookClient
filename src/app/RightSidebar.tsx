import { MediaImage } from '../components/common/MediaImage';
import type { DiscoveryCandidate, UserProfile } from '../types';

interface RightSidebarProps {
  currentUser: UserProfile;
  suggestions: DiscoveryCandidate[];
  onSelectCandidate: (candidate: DiscoveryCandidate) => void;
  onOpenProfile: () => void;
}

export function RightSidebar({
  currentUser,
  suggestions,
  onSelectCandidate,
  onOpenProfile,
}: RightSidebarProps) {
  const userPhoto = currentUser.photos?.[0] || (currentUser as any).pictures?.[0];
  const list = suggestions.slice(0, 5);

  return (
    <aside className="hidden xl:block w-80 shrink-0 pl-8 pt-6 pr-4 select-none">
      {/* Current User Card */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onOpenProfile}>
          <div className="w-11 h-11 rounded-full overflow-hidden border border-border bg-surface shrink-0">
            {userPhoto ? (
              <MediaImage
                src={userPhoto}
                alt={currentUser.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-xs">
                {currentUser.name?.[0] || 'U'}
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-text truncate">
              {currentUser.name}
            </span>
            <span className="text-xs text-text-secondary truncate">
              {currentUser.hometown || currentUser.currentLocation || 'OneHook Member'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenProfile}
          className="text-xs font-semibold text-ig-blue hover:text-accent cursor-pointer"
        >
          View
        </button>
      </div>

      {/* Suggested for you header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-text-secondary">
          Suggested for you
        </span>
        <button
          type="button"
          className="text-xs font-semibold text-text hover:text-text-secondary cursor-pointer"
        >
          See All
        </button>
      </div>

      {/* Suggestions List */}
      <div className="flex flex-col gap-3 mb-8">
        {list.map((candidate) => {
          const photo = candidate.photos?.[0] || (candidate as any).pictures?.[0];
          const name = candidate.name || (candidate as any).displayName || 'Suggested';
          const distance =
            candidate.distanceKm != null
              ? `${candidate.distanceKm.toFixed(1)} km away`
              : candidate.distance != null
              ? `${candidate.distance} km away`
              : 'Compatible vibe';

          return (
            <div key={candidate.id} className="flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                onClick={() => onSelectCandidate(candidate)}
              >
                <div className="w-9 h-9 rounded-full overflow-hidden border border-border bg-surface shrink-0">
                  {photo ? (
                    <MediaImage
                      src={photo}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-semibold">
                      {name[0]}
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-text truncate">
                    {name}
                  </span>
                  <span className="text-[11px] text-text-secondary truncate">
                    {distance}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectCandidate(candidate)}
                className="text-xs font-semibold text-ig-blue hover:text-text cursor-pointer shrink-0"
              >
                Connect
              </button>
            </div>
          );
        })}
      </div>

      {/* Instagram-style desktop footer links */}
      <footer className="text-[11px] text-text-muted leading-relaxed space-y-3">
        <nav className="flex flex-wrap gap-x-2 gap-y-1">
          <a href="/about" className="hover:underline">About</a>
          <span>·</span>
          <a href="/help" className="hover:underline">Help</a>
          <span>·</span>
          <a href="/press" className="hover:underline">Press</a>
          <span>·</span>
          <a href="/api" className="hover:underline">API</a>
          <span>·</span>
          <a href="/careers" className="hover:underline">Careers</a>
          <span>·</span>
          <a href="/privacy" className="hover:underline">Privacy</a>
          <span>·</span>
          <a href="/terms" className="hover:underline">Terms</a>
          <span>·</span>
          <a href="/locations" className="hover:underline">Locations</a>
        </nav>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">
          © 2026 ONEHOOK CLUB
        </p>
      </footer>
    </aside>
  );
}
