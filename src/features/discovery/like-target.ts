import type { LikeTargetType } from '../../api/rest';

export type { LikeTargetType } from '../../api/rest';

/**
 * A single likeable element of a candidate's profile, as surfaced by the comment affordances on the
 * discovery card. This is what the composer shows ("commenting on …") and what gets sent as
 * `likeTargetType` + `likeTargetRef` when the like is submitted.
 *
 * - `ref` is the value the backend persists as `likeTargetRef`: the media object key for
 *   PHOTO/VIDEO/VOICE, the promptId for PROMPT, the interest value for INTEREST. It is intentionally
 *   omitted for BIO (the server normalises BIO's ref to "bio").
 * - `label` is the short kind label shown in the composer header ("Photo", "Voice note", …).
 * - `preview` is an optional human-readable snippet of what is being commented on (a prompt answer,
 *   the bio text, the interest) so the composer can echo it back to the user.
 */
export interface LikeTarget {
  type: LikeTargetType;
  ref?: string;
  label: string;
  preview?: string;
}

const VIDEO_KEY_PATTERN = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i;

/**
 * Photos and videos share one media array on the profile; a key is treated as a VIDEO when its
 * object key ends in a known video extension, otherwise it is a PHOTO. This mirrors how the rest of
 * the app resolves the same `media/…` keys for display.
 */
export function isVideoKey(key: string): boolean {
  return VIDEO_KEY_PATTERN.test(key);
}

/** The likeTargetType for a media object key (PHOTO vs VIDEO). Voice is handled separately. */
export function mediaLikeType(key: string): LikeTargetType {
  return isVideoKey(key) ? 'VIDEO' : 'PHOTO';
}
