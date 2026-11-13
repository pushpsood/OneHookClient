/**
 * Mapping the split profile (docs/chat-only-profiles.md §8.1, §9.2) onto what the UI renders.
 *
 * Every account has a CHAT profile (display name, avatar, birth date). A MATCHING profile exists only
 * once the member starts one (DRAFT) and becomes ACTIVE when they turn matching on. `GET /profile`
 * returns both for the owner; another member's chat profile is read with a State view pass and is
 * all a hook partner ever sees in chat.
 */
import type { ChatProfile, MatchingProfile, MyProfileResponse, UserProfile } from '../types';

/**
 * The signed-in member: chat fields over matching fields (the chat profile owns name and birth date;
 * the matching profile owns the optional birth time and place).
 */
export function toUserProfile(res: MyProfileResponse): UserProfile {
  const chat: ChatProfile = res.chat ?? ({ userId: '' } as ChatProfile);
  const matching: MatchingProfile | undefined = res.matching ?? undefined;
  const { status: matchingStatus, userId: _matchingUserId, ...matchingFields } = matching ?? ({} as MatchingProfile);
  void _matchingUserId;
  const userId = String(chat.userId || matching?.userId || '');
  const displayName = chat.displayName || matching?.displayName || '';
  const pictures = matching?.pictures ?? [];
  return {
    ...matchingFields,
    userId,
    id: userId,
    displayName,
    name: displayName,
    avatarKey: chat.avatarKey || undefined,
    age: chat.age ?? matching?.age,
    // The chat profile owns the birth date; the optional birth time and place belong to the
    // matching profile (owner only) and are erased with it.
    birthDetails: chat.birthDetails,
    birthDateOnFile: chat.birthDateOnFile,
    birthTimePlace: matching?.birthTimePlace,
    pictures,
    photos: pictures,
    moderationStatus: matching?.moderationStatus ?? chat.moderationStatus,
    // Chat-owned fields (displayName, avatarKey) carry the chat profile's moderation state.
    fieldModerationStatus: { ...(matching?.fieldModerationStatus ?? {}), ...(chat.fieldModerationStatus ?? {}) },
    matchingStatus: matching ? (matchingStatus ?? 'DRAFT') : undefined,
    draftExpiresAt: matching?.draftExpiresAt,
    lastEditedAt: matching?.lastEditedAt,
  };
}

/** The member's own avatar for chrome (top bar, tab bar): the chat avatar, else the first picture. */
export function ownAvatar(user: Pick<UserProfile, 'avatarKey' | 'photos' | 'pictures'> | null | undefined): string | undefined {
  if (!user) return undefined;
  return user.avatarKey || user.photos?.[0] || user.pictures?.[0] || undefined;
}

/** A hook partner (or a request sender) as chat shows them: their chat profile only (E51, E66). */
export interface PartnerProfile {
  id: string;
  name: string;
  displayName?: string;
  avatarKey?: string;
  age?: number;
}

export function toPartnerProfile(p: ChatProfile, fallbackId: string): PartnerProfile {
  const id = String(p.userId || fallbackId);
  return {
    id,
    name: p.displayName || 'Your Match',
    displayName: p.displayName || undefined,
    avatarKey: p.avatarKey || undefined,
    age: p.age ?? undefined,
  };
}
