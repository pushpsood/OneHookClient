import React, { useState, useMemo } from 'react';
import { Search, X, CheckCircle2, MapPin, Sparkles, Volume2 } from 'lucide-react';
import { MediaImage } from '../components/common/MediaImage';
import type { DiscoveryCandidate } from '../types';

interface SearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: DiscoveryCandidate[];
  onSelectCandidate: (candidate: DiscoveryCandidate) => void;
}

type FilterType = 'ALL' | 'VERIFIED' | 'NEARBY' | 'AUDIO';

export function SearchDrawer({
  isOpen,
  onClose,
  candidates,
  onSelectCandidate,
}: SearchDrawerProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');

  const filtered = useMemo(() => {
    let result = candidates;

    if (filter === 'VERIFIED') {
      result = result.filter((c) => c.verified);
    } else if (filter === 'NEARBY') {
      result = result.filter(
        (c) => (c.distanceKm != null && c.distanceKm < 15) || (c.distance != null && c.distance < 15)
      );
    } else if (filter === 'AUDIO') {
      result = result.filter((c) => Boolean((c as any).audioPrompt));
    }

    if (!query.trim()) return result;

    const q = query.toLowerCase().trim();
    return result.filter((c) => {
      const name = ((c as any).displayName || c.name || '').toLowerCase();
      const bio = (c.bio || '').toLowerCase();
      const loc = (
        typeof c.location === 'string' ? c.location : (c as any).currentLocation || c.hometown || ''
      ).toLowerCase();
      const interests = (c.interests || []).map((i) => i.toLowerCase()).join(' ');
      return name.includes(q) || bio.includes(q) || loc.includes(q) || interests.includes(q);
    });
  }, [candidates, query, filter]);

  if (!isOpen) return null;

  const filterItems: Array<{
    id: FilterType;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'ALL', label: 'All' },
    { id: 'VERIFIED', label: 'Verified', icon: CheckCircle2 },
    { id: 'NEARBY', label: 'Nearby', icon: MapPin },
    { id: 'AUDIO', label: 'Voice Notes', icon: Volume2 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-[397px] h-full bg-surface-card border-r border-border flex flex-col z-10 shadow-2xl animate-in slide-in-from-left duration-250 ease-out select-none">
        {/* Drawer Header */}
        <div className="p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-text">Search</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
              title="Close search"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, interests, location..."
              className="w-full pl-10 pr-9 py-2.5 bg-surface text-text placeholder:text-text-muted text-sm rounded-xl border border-transparent focus:border-border focus:bg-surface-card focus:outline-none transition-all"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 w-4 h-4 rounded-full bg-surface-hover text-text-muted hover:text-text flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 mt-4 overflow-x-auto no-scrollbar">
            {filterItems.map((item) => {
              const active = filter === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-accent text-bg shadow-sm'
                      : 'bg-surface text-text-secondary hover:text-text hover:bg-surface-hover'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              {query.trim() ? `Results (${filtered.length})` : 'Suggested Profiles'}
            </span>
            {query.trim() && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-semibold text-ig-blue hover:opacity-80 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-text-muted space-y-2">
              <Sparkles className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs">Try searching by a different name, city, or interest.</p>
            </div>
          ) : (
            filtered.map((candidate) => {
              const photo = candidate.photos?.[0] || (candidate as any).pictures?.[0];
              const name = (candidate as any).displayName || candidate.name || 'Member';
              const loc =
                typeof candidate.location === 'string'
                  ? candidate.location
                  : (candidate as any).currentLocation ||
                    candidate.hometown ||
                    (candidate.distanceKm != null ? `${candidate.distanceKm.toFixed(1)} km away` : '');

              return (
                <div
                  key={candidate.id}
                  onClick={() => {
                    onSelectCandidate(candidate);
                    onClose();
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer group"
                >
                  {/* Avatar with Story Ring */}
                  <div className="p-[1.5px] rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shrink-0">
                    <div className="p-[1px] rounded-full bg-surface-card">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-surface">
                        {photo ? (
                          <MediaImage
                            src={photo}
                            alt={name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-sm text-text-secondary">
                            {name[0]}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-text truncate group-hover:text-ig-blue transition-colors">
                        {name}
                      </span>
                      {candidate.verified && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-ig-blue fill-ig-blue" strokeWidth={3} color="white" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary truncate">
                      {candidate.age && <span>{candidate.age}</span>}
                      {candidate.age && loc && <span>•</span>}
                      {loc && <span className="truncate">{loc}</span>}
                    </div>
                    {candidate.bio && (
                      <p className="text-[11px] text-text-muted truncate mt-0.5">
                        {candidate.bio}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
