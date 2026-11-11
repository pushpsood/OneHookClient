import { useEffect } from 'react';
import { batchRefresher, setViewPassRefresher, viewPasses } from '../lib/view-pass';
import { StateApi } from '../api/state';
import { MatchingApi } from '../api/matching';
import { refreshUserStateInStore } from './use-api';

/**
 * Registers how expired or missing view passes are re-fetched (lib/view-pass.ts):
 *
 *  - chat passes from State: re-read `GET /state/{me}` (every hook partner); a target it does not name
 *    may be the sender of an unlocked request, so the incoming requests are re-read too.
 *  - matching passes from Matching: `POST /matching/view-passes` — only while matching is ON, because
 *    a chat-only member must never call Matching. Turning matching off drops the matching passes.
 */
export function useViewPassRefreshers(matchingOn: boolean) {
  useEffect(() => {
    setViewPassRefresher(
      'profile.chat',
      batchRefresher(async (targetIds) => {
        await refreshUserStateInStore();
        if (targetIds.some((id) => !viewPasses.passFor('profile.chat', id))) {
          await StateApi.listIncomingRequests().catch(() => undefined);
        }
      })
    );
    return () => setViewPassRefresher('profile.chat', undefined);
  }, []);

  useEffect(() => {
    if (!matchingOn) {
      setViewPassRefresher('profile.matching', undefined);
      viewPasses.clear('profile.matching');
      return;
    }
    setViewPassRefresher(
      'profile.matching',
      batchRefresher((targetIds) => MatchingApi.issueViewPasses(targetIds))
    );
    return () => setViewPassRefresher('profile.matching', undefined);
  }, [matchingOn]);
}
