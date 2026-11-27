/**
 * Compare Likes side-by-side table & Must teaser (mirrors iOS `LikesCompareViewController.swift`).
 */
import { CheckCircle2, Flower2, MapPin, Sparkles, X } from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { MediaImage } from '../../components/common/MediaImage';
import type { ReceivedLike } from '../../api/rest';
import { SubscriptionTier, type MatchingProfile } from '../../types';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

export interface CompareLikeEntry {
  like: ReceivedLike;
  profile?: MatchingProfile | null;
}

export function LikesCompareDialog({
  open,
  onClose,
  entries,
  tier,
  onRemove,
  onInspect,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  entries: readonly CompareLikeEntry[];
  tier?: SubscriptionTier;
  onRemove: (userId: string) => void;
  onInspect: (userId: string) => void;
  onUpgrade: () => void;
}) {
  const locked = tier === SubscriptionTier.MUST;
  const shown = entries.slice(0, 5);

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="compare-likes-title" className="max-w-4xl w-full">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 id="compare-likes-title" className="text-base font-serif italic font-bold text-text">
          Compare likes ({shown.length})
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close compare likes"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>

      {locked ? (
        <div className="p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent mx-auto flex items-center justify-center">
            <Sparkles className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-serif italic font-bold text-text">
            Compare admirers side by side
          </h3>
          <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Pick up to 5 people who liked your profile and compare their bio, prompts, distance, and comments together on Super and Infinity.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onUpgrade();
            }}
            // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_COMPARE_UPGRADE once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.compare_upgrade"
            className="px-6 py-2.5 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            Compare Super &amp; Infinity
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-secondary">
          Select at least 2 likes to compare them side by side.
        </div>
      ) : (
        <div className="p-5 overflow-x-auto">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(200px, 1fr))` }}>
            {shown.map(({ like, profile }) => {
              const name = profile?.displayName || like.fromUserId;
              const photo = profile?.pictures?.[0] || FALLBACK_PROFILE_IMAGE;
              const isRose = like.likeKind === 'ROSE';
              return (
                <div
                  key={like.fromUserId}
                  className={`rounded-2xl border p-3.5 bg-surface flex flex-col justify-between gap-3 ${
                    isRose ? 'border-rose-400/60' : 'border-border'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="relative aspect-[4/5] rounded-xl overflow-hidden border border-border bg-bg">
                      <MediaImage src={photo} alt={name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemove(like.fromUserId)}
                        aria-label={`Remove ${name} from comparison`}
                        // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_COMPARE_REMOVE once enabled on web.
                        data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.compare_remove"
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black cursor-pointer"
                      >
                        <X className={ICON_SECTION.section.actionIcon} />
                      </button>
                      {isRose && (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                          <Flower2 className={ICON_SECTION.section.badgeIcon} /> Rose
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-text truncate">
                          {name}
                          {profile?.age ? `, ${profile.age}` : ''}
                        </h3>
                        {profile?.verified && (
                          <CheckCircle2 className={`${ICON_SECTION.section.actionIcon} text-ig-blue`} />
                        )}
                      </div>
                      {like.distanceKm != null && (
                        <p className="text-[11px] text-text-secondary flex items-center gap-1 mt-0.5">
                          <MapPin className={ICON_SECTION.section.badgeIcon} /> {like.distanceKm} km away
                        </p>
                      )}
                    </div>

                    {like.comment && (
                      <div className="p-2.5 rounded-xl bg-bg border border-border/70">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-accent mb-0.5">
                          Their note
                        </p>
                        <p className="text-xs italic text-text line-clamp-3">&ldquo;{like.comment}&rdquo;</p>
                      </div>
                    )}

                    {profile?.bio && (
                      <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">
                        {profile.bio}
                      </p>
                    )}

                    {profile?.work && (
                      <p className="text-[11px] text-text-muted truncate">{profile.work}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onInspect(like.fromUserId);
                    }}
                    // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_LIKE_BACK once enabled on web.
                    data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.like_back"
                    className="w-full py-2.5 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
                  >
                    View &amp; Like Back
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ModalDialog>
  );
}
