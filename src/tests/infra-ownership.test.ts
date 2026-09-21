import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS,
  DOMAINS,
  PRODUCTION_HOSTED_ZONE_ID,
  APP_LINK_SUBDOMAIN,
  APP_STORE_LINKS as INFRA_STORE_LINKS,
} from '../../infra/stacks/constants';
import { APP_STORE_LINKS as CLIENT_STORE_LINKS } from '../config/signup.config';

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

  describe('app install smart link (app.onehook.club)', () => {
    it('serves the smart link from the app subdomain of the production domain', () => {
      expect(APP_LINK_SUBDOMAIN).toBe('app');
      expect(`${APP_LINK_SUBDOMAIN}.${DOMAINS.prod}`).toBe('app.onehook.club');
    });

    it('keeps the infra store links identical to the ones the web UI links to', () => {
      // Infra cannot import from `src` (separate tsconfig), so the two lists are duplicated on
      // purpose. This test is what stops them drifting apart.
      expect(INFRA_STORE_LINKS.ios).toBe(CLIENT_STORE_LINKS.ios);
      expect(INFRA_STORE_LINKS.android).toBe(CLIENT_STORE_LINKS.android);
    });

    it('sends devices that cannot install the app to the marketing page, not a store', () => {
      expect(INFRA_STORE_LINKS.fallback).toBe('https://onehook.club/app');
      expect(INFRA_STORE_LINKS.fallback).not.toContain('apps.apple.com');
      expect(INFRA_STORE_LINKS.fallback).not.toContain('play.google.com');
    });
  });
});
