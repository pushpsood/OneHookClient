import { describe, expect, it } from 'vitest';
import {
  FEATURE_GROUPS,
  MEMBERSHIP_TIERS,
  MOST_POPULAR_TIER,
  WIRE_TO_DISPLAY,
  tierByWire,
  type FeatureRow,
} from '../config/membership.config';

/**
 * Guard rail for the public membership catalogue. These assertions encode the product's
 * non-negotiables so the matrix can't silently drift:
 *  - the three marketing names map to the frozen backend wire values;
 *  - only Infinity (PLATINUM) allows 3 concurrent connections, Must/Super stay at 1;
 *  - exactly one tier — Super — is the "Most popular" tier;
 *  - messaging is free forever: every messaging row is `true` for ALL three tiers.
 */
describe('membership catalogue — display names', () => {
  it('maps the three wire values to Must / Super / Infinity', () => {
    expect(WIRE_TO_DISPLAY).toEqual({
      FREE: 'Must',
      GOLD: 'Super',
      PLATINUM: 'Infinity',
    });
  });

  it('exposes exactly three tiers with those display names in order', () => {
    expect(MEMBERSHIP_TIERS.map((t) => t.displayName)).toEqual(['Must', 'Super', 'Infinity']);
  });
});

describe('membership catalogue — connection ceilings', () => {
  it('only Infinity allows 3 connections; Must and Super allow 1', () => {
    expect(tierByWire('FREE').maxConnections).toBe(1);
    expect(tierByWire('GOLD').maxConnections).toBe(1);
    expect(tierByWire('PLATINUM').maxConnections).toBe(3);

    const allowingMoreThanOne = MEMBERSHIP_TIERS.filter((t) => t.maxConnections > 1);
    expect(allowingMoreThanOne.map((t) => t.displayName)).toEqual(['Infinity']);
  });

  it('the connections rows in the matrix are 1 / 1 / 3', () => {
    const connectionRows = FEATURE_GROUPS.find((g) => g.title === 'Connections')?.rows ?? [];
    expect(connectionRows.length).toBeGreaterThan(0);
    for (const row of connectionRows) {
      expect(row.values.FREE).toBe('1');
      expect(row.values.GOLD).toBe('1');
      expect(row.values.PLATINUM).toBe('3');
    }
  });
});

describe('membership catalogue — most popular', () => {
  it('flags Super, and only Super, as the most-popular tier', () => {
    expect(MOST_POPULAR_TIER.displayName).toBe('Super');
    const popular = MEMBERSHIP_TIERS.filter((t) => t.mostPopular);
    expect(popular).toHaveLength(1);
    expect(popular[0].wire).toBe('GOLD');
  });
});

describe('membership catalogue — messaging is free forever', () => {
  it('every always-free messaging row is true for ALL three tiers', () => {
    const messagingRows: FeatureRow[] = FEATURE_GROUPS.flatMap((g) => g.rows).filter(
      (r) => r.alwaysFreeMessaging === true,
    );
    expect(messagingRows.length).toBeGreaterThan(0);
    for (const row of messagingRows) {
      expect(row.values.FREE, `${row.label} (Must)`).toBe(true);
      expect(row.values.GOLD, `${row.label} (Super)`).toBe(true);
      expect(row.values.PLATINUM, `${row.label} (Infinity)`).toBe(true);
    }
  });

  it('the free tier keeps unlimited encrypted messaging', () => {
    const row = FEATURE_GROUPS.flatMap((g) => g.rows).find(
      (r) => r.label === 'Unlimited end-to-end encrypted messaging',
    );
    expect(row?.values.FREE).toBe(true);
  });
});
