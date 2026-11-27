/**
 * Full profile sheet for someone who liked you, with Hinge-style like-back via CommentComposer
 * and HookFormingGuard confirmation (mirrors iOS `LikeBackFlow.swift` + `ProfileDetailViewController`).
 */
import { useEffect, useState } from 'react';
import { Flower2, Heart, MapPin, Sparkles, X } from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../components/common/Toast';
import { ProfileApi } from '../../api/profile';
import { MatchingApi } from '../../api/matching';
import type { LikeTargetType, ReceivedLike } from '../../api/rest';
import type { CurrentHookAction, MatchingProfile } from '../../types';
import { useAppStore } from '../../store/app-store';
import { useArchiveStore } from '../../store/archive-store';
import { refreshUserStateInStore } from '../../hooks/use-api';
import { buildHookFormingPrompt, type HookFormingPromptSpec } from '../../lib/hook-forming-guard';
import { HookFormingGuardDialog } from '../chat/LetHookGoDialog';
import { DiscoveryCard, type DiscoveryProfileData } from './DiscoveryCard';
import { CommentComposer } from './CommentComposer';
import type { LikeTarget } from './like-target';
import { ICON_SECTION } from '../../lib/icon-tokens';

function toCandidateData(like: ReceivedLike, p: MatchingProfile | null | undefined): DiscoveryProfileData {
  const photos = p?.pictures ?? [];
  return {
    id: like.fromUserId,
    displayName: p?.displayName || like.fromUserId,
    name: p?.displayName || like.fromUserId,
    age: p?.age,
    distanceKm: like.distanceKm ?? undefined,
    verified: Boolean(p?.verified),
    bio: p?.bio,
    work: p?.work,
    education: p?.education,
    hometown: p?.hometown,
    currentLocation: p?.currentLocation,
    height: p?.height,
    photos,
    pictures: photos,
    pictureTransforms: p?.pictureTransforms,
    prompts: p?.prompts?.map((pr) => ({ promptId: pr.promptId, answer: pr.answer })),
    audioPrompt: p?.audioPrompt,
    interests: p?.interests,
    languages: p?.languages,
    relationshipType: p?.relationshipType,
    wantsKids: p?.wantsKids,
    smokingStatus: p?.smokingStatus,
    drinkingStatus: p?.drinkingStatus,
    cannabisStatus: p?.cannabisStatus,
    religion: p?.religion,
    starSign: p?.starSign,
    exercise: p?.exercise,
    causes: p?.causes,
    communities: p?.communities,
    qualities: p?.qualities,
    gender: p?.gender,
  };
}

export function LikerProfileDialog({
  open,
  onClose,
  like,
  initialProfile,
  onMatched,
  onActed,
}: {
  open: boolean;
  onClose: () => void;
  like: ReceivedLike | null;
  initialProfile?: MatchingProfile | null;
  onMatched?: (matchId?: string) => Promise<void> | void;
  onActed?: (userId: string) => void;
}) {
  const { showToast } = useToast();
  const userState = useAppStore((s) => s.userState);
  const allowance = useArchiveStore((s) => s.list?.allowance);
  const [profile, setProfile] = useState<MatchingProfile | null | undefined>(initialProfile);
  const [loading, setLoading] = useState(false);
  const [rosesRemaining, setRosesRemaining] = useState<number | null>(null);
  const [composer, setComposer] = useState<{ target: LikeTarget; kind: 'like' | 'rose' } | null>(null);
  const [guardPrompt, setGuardPrompt] = useState<HookFormingPromptSpec | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<{
    comment: string;
    likeTargetType: LikeTargetType;
    likeTargetRef?: string;
    likeKind: 'LIKE' | 'ROSE';
  } | null>(null);
  const [guardBusy, setGuardBusy] = useState(false);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile, like?.fromUserId]);

  useEffect(() => {
    if (!open || !like?.fromUserId) return;
    let active = true;
    if (!initialProfile) {
      setLoading(true);
      ProfileApi.getMatching(like.fromUserId)
        .then((p) => {
          if (active) setProfile(p);
        })
        .catch(() => {
          if (active) setProfile(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    MatchingApi.rosesRemaining()
      .then((r) => {
        if (active) setRosesRemaining(r.remaining);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open, like?.fromUserId, initialProfile]);

  if (!like) return null;

  const displayName = profile?.displayName || like.fromUserId;
  const candidate = toCandidateData(like, profile);
  const isRose = like.likeKind === 'ROSE';

  const executeLike = async (payload: {
    comment: string;
    likeTargetType: LikeTargetType;
    likeTargetRef?: string;
    likeKind: 'LIKE' | 'ROSE';
  }) => {
    const res = await MatchingApi.like({
      targetId: like.fromUserId,
      comment: payload.comment,
      likeTargetType: payload.likeTargetType,
      likeTargetRef: payload.likeTargetRef,
      likeKind: payload.likeKind,
    });
    window.dispatchEvent(new CustomEvent('onehook:likes-updated'));
    await refreshUserStateInStore();
    onActed?.(like.fromUserId);
    if (res.matched) {
      showToast(`You matched with ${displayName}!`, 'success');
      setComposer(null);
      onClose();
      await onMatched?.(res.matchId);
    } else {
      showToast('Like sent!', 'success');
      setComposer(null);
      onClose();
    }
  };

  const handleComposerSubmit = async (comment: string) => {
    if (!composer) return;
    const payload = {
      comment,
      likeTargetType: composer.target.type,
      likeTargetRef: composer.target.ref,
      likeKind: composer.kind === 'rose' ? ('ROSE' as const) : ('LIKE' as const),
    };
    const prompt = buildHookFormingPrompt('likeBack', userState, allowance, displayName);
    if (prompt) {
      setPendingSubmit(payload);
      setGuardPrompt(prompt);
      return;
    }
    await executeLike(payload);
  };

  const handleGuardConfirm = async (currentHook?: CurrentHookAction) => {
    if (!pendingSubmit) return;
    setGuardBusy(true);
    try {
      void currentHook;
      await executeLike(pendingSubmit);
      setGuardPrompt(null);
      setPendingSubmit(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not complete like back.', 'error');
    } finally {
      setGuardBusy(false);
    }
  };

  const handlePass = async () => {
    try {
      await MatchingApi.pass(like.fromUserId);
      window.dispatchEvent(new CustomEvent('onehook:likes-updated'));
      onActed?.(like.fromUserId);
      onClose();
    } catch {
      showToast('Could not pass right now. Please try again.', 'error');
    }
  };

  return (
    <>
      <ModalDialog open={open} onClose={onClose} labelledBy="liker-profile-title" className="max-w-lg w-full">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 id="liker-profile-title" className="text-base font-bold text-text truncate flex items-center gap-1.5">
              {displayName}
              {isRose && (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 text-[10px] font-bold">
                  <Flower2 className={ICON_SECTION.section.badgeIcon} /> Rose
                </span>
              )}
            </h2>
            {like.distanceKm != null && (
              <p className="text-xs text-text-secondary flex items-center gap-1">
                <MapPin className={ICON_SECTION.section.badgeIcon} /> {like.distanceKm} km away
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setComposer({
                  target: { type: 'BIO', label: 'Profile', preview: profile?.bio },
                  kind: 'like',
                })
              }
              // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_LIKE_BACK once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.like_back"
              className="h-8 px-3 rounded-full bg-accent text-bg text-xs font-semibold flex items-center gap-1 hover:opacity-90 cursor-pointer"
            >
              <Heart className={`${ICON_SECTION.toolbar.pillIcon} fill-current`} /> Like back
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              // TODO(telemetry-parity): switch to UiElement.LIKES_YOU_CLOSE once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for likes_you.close"
              className={ICON_SECTION.modalHeader.button}
            >
              <X className={ICON_SECTION.modalHeader.icon} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[82vh]">
          {like.comment && (
            <div className="p-3.5 rounded-2xl border border-accent/40 bg-accent/5 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-accent flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Note on your {like.likeTargetType?.toLowerCase() ?? 'profile'}
              </p>
              <p className="text-sm italic text-text">&ldquo;{like.comment}&rdquo;</p>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <DiscoveryCard
              candidate={candidate}
              onPass={() => void handlePass()}
              onComment={(target) => setComposer({ target, kind: 'like' })}
              onRose={() =>
                setComposer({
                  target: { type: 'BIO', label: 'Profile', preview: profile?.bio },
                  kind: 'rose',
                })
              }
              rosesRemaining={rosesRemaining}
            />
          )}
        </div>
      </ModalDialog>

      {composer && (
        <CommentComposer
          targetName={displayName}
          target={composer.target}
          kind={composer.kind}
          onSubmit={handleComposerSubmit}
          onCancel={() => setComposer(null)}
        />
      )}

      <HookFormingGuardDialog
        prompt={guardPrompt}
        busy={guardBusy}
        onConfirm={(choice) => void handleGuardConfirm(choice)}
        onCancel={() => {
          setGuardPrompt(null);
          setPendingSubmit(null);
        }}
      />
    </>
  );
}
