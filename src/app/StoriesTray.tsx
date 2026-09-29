import { Plus } from 'lucide-react';
import { MediaImage } from '../components/common/MediaImage';
import type { DiscoveryCandidate, UserProfile } from '../types';

interface StoriesTrayProps {
  currentUser: UserProfile;
  candidates: DiscoveryCandidate[];
  onSelectCandidate: (candidate: DiscoveryCandidate) => void;
  onOpenMyStory?: () => void;
}

export function StoriesTray({
  currentUser,
  candidates,
  onSelectCandidate,
  onOpenMyStory,
}: StoriesTrayProps) {
  const userPhoto = currentUser.photos?.[0] || (currentUser as any).pictures?.[0];
  const storiesList = candidates.slice(0, 10);

  return (
    <div className="w-full bg-surface-card border-b border-border py-3 px-2 sm:px-4 overflow-x-auto no-scrollbar select-none">
      <div className="flex items-center gap-4 min-w-max">
        {/* Current User "Your Story" */}
        <button
          type="button"
          onClick={onOpenMyStory}
          className="flex flex-col items-center gap-1.5 focus:outline-none group cursor-pointer"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-full p-[2px] border-2 border-dashed border-border group-hover:border-accent transition-colors">
              <div className="w-full h-full rounded-full overflow-hidden bg-surface">
                {userPhoto ? (
                  <MediaImage
                    src={userPhoto}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-text-secondary">
                    You
                  </div>
                )}
              </div>
            </div>
            <span className="absolute bottom-0 right-0 w-4 h-4 bg-ig-blue text-white rounded-full flex items-center justify-center border-2 border-surface-card">
              <Plus className="w-3 h-3 stroke-[3]" />
            </span>
          </div>
          <span className="text-[11px] text-text-secondary group-hover:text-text truncate w-16 text-center">
            Your story
          </span>
        </button>

        {/* Stories from candidates / matches */}
        {storiesList.map((candidate) => {
          const photo = candidate.photos?.[0] || (candidate as any).pictures?.[0];
          const name = candidate.name || (candidate as any).displayName || 'Match';
          const firstName = name.split(' ')[0];

          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSelectCandidate(candidate)}
              className="flex flex-col items-center gap-1.5 focus:outline-none group cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] group-hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full p-[2px] bg-surface-card">
                  <div className="w-full h-full rounded-full overflow-hidden bg-surface">
                    {photo ? (
                      <MediaImage
                        src={photo}
                        alt={name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-text-secondary">
                        {firstName[0]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-text group-hover:opacity-80 truncate w-16 text-center font-normal">
                {firstName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
