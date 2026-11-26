import { describe, expect, it } from 'vitest';
import { SubscriptionTier } from 'onehook-api-client';
import { SUBSCRIPTION_TIERS } from 'onehook-api-client/membership';
import {
  FEATURE_GROUPS,
  MEMBERSHIP_TIERS,
  MOST_POPULAR_TIER,
  PAID_TIER_NAMES,
  ANNUAL_DISCOUNT_LABEL,
  annualSavingPercent,
  priceLabel,
  tierByWire,
  type FeatureRow,
} from '../config/membership.config';

/**
 * Guard rail for the public membership catalogue. The tiers come from the backend-owned
 * onehook-api-client catalogue; these assertions lock the web copy to it and encode the product's
 * non-negotiables:
 *  - the web tiers are exactly the SDK tiers, in SDK order, with SDK names and ceilings;
 *  - every tier holds one connection at a time; only the top tier includes archived chats;
 *  - exactly one tier — the middle one — is the "Most popular" tier;
 *  - messaging is free forever: every messaging row is `true` for ALL tiers.
 */
describe('membership catalogue — mirrors onehook-api-client', () => {
  it('has exactly the SDK tiers in SDK order, with SDK display names and ceilings', () => {
    expect(
      MEMBERSHIP_TIERS.map(
        ({ wire, displayName, maxConnections, archivePlanAllowance, archiveValidityDays, includesMrOneHookPro }) => ({
          wire,
          displayName,
          maxConnections,
          archivePlanAllowance,
          archiveValidityDays,
          includesMrOneHookPro,
        }),
      ),
    ).toEqual(SUBSCRIPTION_TIERS.map((t) => ({ ...t })));
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
  it('every tier holds exactly one connection', () => {
    expect(MEMBERSHIP_TIERS.map((t) => t.maxConnections)).toEqual(MEMBERSHIP_TIERS.map(() => 1));
  });

  it('no tier copy promises more than one connection', () => {
    for (const t of MEMBERSHIP_TIERS) {
      const copy = [t.tagline, t.headline, ...t.adds].join('\n');
      expect(copy, t.displayName).not.toMatch(/connections at once|people at once/i);
    }
  });

  it('the connections rows in the matrix equal the SDK ceilings', () => {
    const connectionRows = FEATURE_GROUPS.find((g) => g.title === 'Connections')?.rows ?? [];
    expect(connectionRows.length).toBeGreaterThan(0);
    for (const row of connectionRows) {
      for (const t of SUBSCRIPTION_TIERS) expect(row.values[t.wire]).toBe(String(t.maxConnections));
    }
  });
});

describe('membership catalogue — archived chats and prices', () => {
  it('only the top tier includes archived chats, and its copy uses the SDK allowance and validity', () => {
    const withArchives = MEMBERSHIP_TIERS.filter((t) => t.archivePlanAllowance > 0);
    expect(withArchives.map((t) => t.wire)).toEqual([SubscriptionTier.INFINITY]);
    const infinity = tierByWire(SubscriptionTier.INFINITY);
    const phrase = `${infinity.archivePlanAllowance} archived chats, each kept ${infinity.archiveValidityDays} days`;
    expect(infinity.tagline).toContain(phrase);
    expect(infinity.headline).toContain(phrase);
    const row = FEATURE_GROUPS.flatMap((g) => g.rows).find((r) => r.label === 'Archived chats included');
    for (const t of SUBSCRIPTION_TIERS) {
      expect(row?.values[t.wire]).toBe(
        t.archivePlanAllowance > 0 ? `${t.archivePlanAllowance} · ${t.archiveValidityDays} days` : false,
      );
    }
  });

  it('prices: Super ₹499/month or ₹3,999/year, Infinity ₹1,500/month or ₹14,999/year', () => {
    expect(priceLabel(tierByWire(SubscriptionTier.SUPER), 'monthly')).toBe('₹499/month');
    expect(priceLabel(tierByWire(SubscriptionTier.SUPER), 'annual')).toBe('₹3,999/year');
    expect(priceLabel(tierByWire(SubscriptionTier.INFINITY), 'monthly')).toBe('₹1,500/month');
    expect(priceLabel(tierByWire(SubscriptionTier.INFINITY), 'annual')).toBe('₹14,999/year');
    expect(annualSavingPercent(tierByWire(SubscriptionTier.SUPER))).toBe(33);
    expect(annualSavingPercent(tierByWire(SubscriptionTier.INFINITY))).toBe(17);
    expect(ANNUAL_DISCOUNT_LABEL).toBe('Save up to ~33%');
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
