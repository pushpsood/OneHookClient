import { describe, expect, it } from 'vitest';
import { ACCOUNTS, DOMAINS, PRODUCTION_HOSTED_ZONE_ID } from '../../infra/stacks/constants';

/**
 * Guards the ownership model so a future edit can't silently drift it:
 *   - the production frontend stack and the onehook.club zone live in the frontend account
 *     (851725215059);
 *   - the backend account (627367419734) owns only the API zones;
 *   - there is a single deployed site (production onehook.club) — the former gamma.onehook.club
 *     frontend website has been removed.
 *
 * These are pure constants with no CDK/AWS imports, so the test stays hermetic and fast.
 */
describe('infra ownership model', () => {
  it('places the frontend resources in the frontend account and API zones in the backend', () => {
    expect(ACCOUNTS.frontend).toBe('851725215059');
    expect(ACCOUNTS.backend).toBe('627367419734');
  });

  it('models the production domain and exact frontend-owned production zone', () => {
    expect(DOMAINS.prod).toBe('onehook.club');
    expect(PRODUCTION_HOSTED_ZONE_ID).toBe('Z0711151B3O279W1TQZ0');
  });

  it('no longer exposes a gamma frontend site domain', () => {
    expect(DOMAINS).not.toHaveProperty('gamma');
  });
});
