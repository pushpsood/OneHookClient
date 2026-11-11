/**
 * Turning matching on and off (docs/chat-only-profiles.md §7.7, §7.9, §7.10).
 *
 *  - On: the member builds a matching profile (`PUT /profile/matching`, a DRAFT), then
 *    `POST /state/matching/enable`. State checks the profile with Profile first and answers 409
 *    MATCHING_PROFILE_INCOMPLETE with `gaps` when something is missing.
 *  - Off: `POST /state/matching/disable {confirm: "ERASE_MATCHING"}` → 202 ERASING. Everything Matching
 *    holds about the member is erased; hooks, chats, blocks and requests are kept in State, and come
 *    back into discovery if the member turns matching on again.
 */
import { useCallback, useState } from 'react';
import { StateApi } from '../../api/state';
import { errorCode, errorGaps, errorStatus } from '../../lib/api-errors';

/** What Profile's readiness check can report missing (ProfileConstants GAP_*; State's NO_MATCHING_PROFILE). */
const GAP_COPY: Record<string, string> = {
  PHOTOS: 'Add at least 3 photos to your matching profile.',
  GENDER: 'Choose your gender.',
  INTERESTED_IN: 'Choose who you are interested in.',
  NO_CHAT_PROFILE: 'Finish your chat profile first.',
  NO_MATCHING_PROFILE: 'Create your matching profile first.',
};

export function gapCopy(gap: string): string {
  return GAP_COPY[gap] ?? 'Finish your matching profile.';
}

export const MATCHING_COPY = {
  offTitle: 'Matching is off',
  offBody:
    'You use OneHook for chats only. Turn matching on to build a matching profile and find someone new in Discover.',
  onTitle: 'Matching is on',
  onBody: 'You appear in Discover while you have a free hook slot.',
  erasingTitle: 'Turning matching off',
  erasingBody: 'Your matching data is being removed. This usually takes a few minutes; your chats are not affected.',
  disableDialogTitle: 'Turn matching off?',
  disableDialogBody:
    'Your matching profile, photos, likes, roses and discovery data are erased. Only your chats are kept: your hooks and conversations carry on as they are. Your blocks and connection history are kept too, and everything comes back into matching if you turn it on again. You would only need to build a new matching profile.',
  disableConfirm: 'Turn off and erase',
  erasingConflict: 'Your matching data is still being removed. Try again in a few minutes.',
} as const;

/** Copy for the matching-profile draft clock (R25). Epoch seconds in. */
export function draftNotice(draftExpiresAt: number | undefined, locale?: string): string {
  const base =
    'Draft: nobody can see it until you turn matching on. A draft is removed after 30 days without changes; we remind you 3 days before.';
  if (!draftExpiresAt) return base;
  const day = new Date(draftExpiresAt * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${base} Edit it before ${day} to keep it.`;
}

export type EnableResult =
  | { ok: true }
  | { ok: false; gaps: string[]; message: string };

/** Interprets a failed enable: gaps to fix, or a message. Pure, for tests. */
export function enableFailure(err: unknown): { gaps: string[]; message: string } {
  const code = errorCode(err);
  if (errorStatus(err) === 409 && code === 'MATCHING_PROFILE_INCOMPLETE') {
    const gaps = errorGaps(err);
    return { gaps, message: 'Your matching profile needs a few more things.' };
  }
  if (code === 'MATCHING_ERASING') return { gaps: [], message: MATCHING_COPY.erasingConflict };
  if (code === 'NOT_READY') return { gaps: [], message: 'Finish setting up your profile first.' };
  return { gaps: [], message: "We couldn't turn matching on. Please try again." };
}

export function useMatchingMode(onChanged: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false);
  const [gaps, setGaps] = useState<string[]>([]);

  const enable = useCallback(async (): Promise<EnableResult> => {
    setBusy(true);
    try {
      await StateApi.enableMatching();
      setGaps([]);
      await onChanged();
      return { ok: true };
    } catch (err) {
      const failure = enableFailure(err);
      setGaps(failure.gaps);
      return { ok: false, ...failure };
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const disable = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      await StateApi.disableMatching();
      setGaps([]);
      await onChanged();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  return { busy, gaps, enable, disable };
}
