import { sdkClient } from './sdk-client';
import { UserPreferences } from '../types';

/**
 * Matching preferences wrapper (`/matching/{userId}/preferences`).
 *
 * A Matching route: only called while the member's matching is ON. The PUT replaces the stored
 * preferences (fields left out are cleared), so callers send the full current set with their change
 * merged in (see `usePreferences`). `hidePastHooks` is INFINITY-only: the server answers 403
 * PREMIUM_REQUIRED to turn it on on another tier and ignores it after a downgrade.
 */
export const PreferencesApi = {
  get: async (userId: string): Promise<UserPreferences> => {
    return (await sdkClient.getPreferences({ userId })) as unknown as UserPreferences;
  },

  upsert: async (userId: string, prefs: Partial<UserPreferences>) => {
    // `currentSuggestion` is read-only (it comes with the GET); everything else round-trips.
    const { currentSuggestion: _readOnly, userId: _ignored, ...fields } = prefs;
    void _readOnly;
    void _ignored;
    return sdkClient.updatePreferences({ ...fields, userId });
  },
};
