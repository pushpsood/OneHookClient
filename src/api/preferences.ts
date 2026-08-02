import { sdkClient } from './sdk-client';
import { UserPreferences } from '../types';

/**
 * Matching preferences wrapper.
 *
 * The backend preferences contract is intentionally small: age range, distance,
 * and interested-in genders. Anything else (relationship type, lifestyle, etc.)
 * lives on the PROFILE, not on preferences. The former "filter log" and
 * "filter rule set" concepts are backend-internal ranking details and are NOT
 * exposed to clients.
 */
export const PreferencesApi = {
  get: async (userId: string): Promise<UserPreferences> => {
    return (await sdkClient.getPreferences({ userId })) as unknown as UserPreferences;
  },

  upsert: async (userId: string, prefs: Partial<UserPreferences>) => {
    return sdkClient.updatePreferences({
      userId,
      minAge: prefs.minAge,
      maxAge: prefs.maxAge,
      maxDistanceKm: prefs.maxDistanceKm,
      genders: prefs.genders,
    });
  },
};
