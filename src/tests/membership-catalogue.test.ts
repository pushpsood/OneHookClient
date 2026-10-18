import { describe, expect, it } from 'vitest';
import { SubscriptionTier } from 'onehook-api-client';
import { SUBSCRIPTION_TIERS } from 'onehook-api-client/membership';
import {
  FEATURE_GROUPS,
  MEMBERSHIP_TIERS,
  MOST_POPULAR_TIER,
  PAID_TIER_NAMES,
  tierByWire,
  type FeatureRow,
} from '../config/membership.config';

/**
 * Guard rail for the public membership catalogue. The tiers come from the backend-owned
 * onehook-api-client catalogue; these assertions lock the web copy to it and encode the product's
 * non-negotiables:
 *  - the web tiers are exactly the SDK tiers, in SDK order, with SDK names and ceilings;
 *  - only the top tier allows more than one concurrent connection;
 *  - exactly one tier — the middle one — is the "Most popular" tier;
 *  - messaging is free forever: every messaging row is `true` for ALL tiers.
 */
describe('membership catalogue — mirrors onehook-api-client', () => {
  it('has exactly the SDK tiers in SDK order, with SDK display names and ceilings', () => {
    expect(MEMBERSHIP_TIERS.map(({ wire, displayName, maxConnections }) => ({ wire, displayName, maxConnections })))
      .toEqual(SUBSCRIPTION_TIERS.map((t) => ({ ...t })));
  });

  it('every tier inherits from the tier directly below it', () => {
    MEMBERSHIP_TIERS.forEach((t, i) => {
      expect(t.inheritsFrom).toBe(i === 0 ? undefined : MEMBERSHIP_TIERS[i - 1].displayName);
    });
  });

  it('every feature row has a value for every SDK tier and nothing else', () => {
    for (const row of FEATURE_GROUPS.flatMap((g) => g.rows)) {
      expect(Object.keys(row.values).sort(), row.label).toEqual(Object.values(SubscriptionTier).sort());
    }
  });
});

describe('membership catalogue — connection ceilings', () => {
  it('only the top tier allows more than one connection', () => {
    const multi = MEMBERSHIP_TIERS.filter((t) => t.maxConnections > 1);
    expect(multi.map((t) => t.wire)).toEqual([MEMBERSHIP_TIERS.at(-1)!.wire]);
  });

  it('the connections rows in the matrix equal the SDK ceilings', () => {
    const connectionRows = FEATURE_GROUPS.find((g) => g.title === 'Connections')?.rows ?? [];
    expect(connectionRows.length).toBeGreaterThan(0);
    for (const row of connectionRows) {
      for (const t of SUBSCRIPTION_TIERS) expect(row.values[t.wire]).toBe(String(t.maxConnections));
    }
  });
});

describe('membership catalogue — most popular', () => {
  it('flags the middle tier, and only it, as most popular', () => {
    expect(MEMBERSHIP_TIERS.filter((t) => t.mostPopular)).toHaveLength(1);
    expect(MOST_POPULAR_TIER.wire).toBe(SubscriptionTier.SUPER);
    expect(tierByWire(SubscriptionTier.SUPER).displayName).toBe(MOST_POPULAR_TIER.displayName);
  });

  it('PAID_TIER_NAMES lists every paid tier', () => {
    for (const t of MEMBERSHIP_TIERS.slice(1)) expect(PAID_TIER_NAMES).toContain(t.displayName);
    expect(PAID_TIER_NAMES).not.toContain(MEMBERSHIP_TIERS[0].displayName);
  });
});

describe('membership catalogue — messaging is free forever', () => {
  it('every always-free messaging row is true for ALL tiers', () => {
    const messagingRows: FeatureRow[] = FEATURE_GROUPS.flatMap((g) => g.rows).filter(
      (r) => r.alwaysFreeMessaging === true,
    );
    expect(messagingRows.length).toBeGreaterThan(0);
    for (const row of messagingRows) {
      for (const t of SUBSCRIPTION_TIERS) expect(row.values[t.wire], `${row.label} (${t.displayName})`).toBe(true);
    }
  });
});
