/**
 * PUBLIC membership catalogue shown on the website (`/pricing`) and mirrored by the iOS membership
 * comparison screen.
 *
 * ── Source of truth ─────────────────────────────────────────────────────────────────────
 * The tiers themselves — their wire values, order, display names (Must / Super / Infinity) and
 * connection ceilings — are owned by the backend Smithy model (`club.onehook.common#SubscriptionTier`)
 * and consumed ONLY from `onehook-api-client` (`SubscriptionTier` + `onehook-api-client/membership`).
 * This file adds web marketing copy (price, tagline, benefit lists, feature matrix) keyed by that
 * enum and must never re-declare a tier name or ceiling. `membership-source-of-truth.test.ts`
 * enforces this.
 *
 * ── Product strategy (why the matrix looks the way it does) ─────────────────────────────
 * Messaging is free forever on every tier — unlimited end-to-end encrypted chat, read receipts,
 * disappearing messages, wallpapers, multi-device history recovery, the lot. A couple who met on
 * OneHook keep using it as their everyday messenger long after they stop dating; the free tier is a
 * real, permanent home, not a crippled trial.
 *
 * The paid tiers serve a DIFFERENT person: someone actively exploring dating who wants reach and
 * discovery power (unlimited likes, rewind, see who liked you, global mode, incognito, boosts,
 * insights). Those are dating-discovery upgrades layered on top of the always-free messenger.
 *
 * The one capacity that is deliberately gated is CONCURRENT CONNECTIONS ("hooks"): only the top tier
 * allows more than one at a time. Paying for the middle tier buys discovery reach, NOT the ability to
 * juggle more people.
 *
 * There is NO in-app / on-web purchase flow. Memberships are applied to your account; the only
 * call-to-action anywhere in this surface is the app-download smart link.
 */
import { SubscriptionTier } from 'onehook-api-client';
import {
  PAID_SUBSCRIPTION_TIERS,
  SUBSCRIPTION_TIERS,
  subscriptionTierInfo,
  type SubscriptionTierDisplayName,
} from 'onehook-api-client/membership';

/** App-download smart link (302s to the right store by device). Primary + only CTA. */
export const APP_DOWNLOAD_URL = 'https://app.onehook.club';

export type BillingPeriod = 'monthly' | 'annual';

export interface TierPricing {
  /** Rupee price for a single month on the monthly plan. */
  readonly monthly: number;
  /** Rupee price for a full year on the annual plan (already discounted). */
  readonly annual: number;
}

/** Web marketing copy for one tier. Identity/ceilings are NOT here — they come from the SDK. */
interface TierCopy {
  /** One-line positioning shown under the tier name. */
  readonly tagline: string;
  readonly pricing: TierPricing;
  /** Free tier gets a human phrase instead of a number ("Free forever"). */
  readonly priceLabelOverride?: string;
  /** Exactly one tier is flagged the recommended / most-popular tier. */
  readonly mostPopular: boolean;
  /** The single most compelling reason to be on this tier, shown prominently on the card. */
  readonly headline: string;
  /** ONLY what this tier adds over the tier below it, most prominent first. */
  readonly adds: readonly string[];
}

export interface MembershipTier extends TierCopy {
  /** Frozen wire value (from the SDK). */
  readonly wire: SubscriptionTier;
  /** Customer-facing brand name (from the SDK). */
  readonly displayName: SubscriptionTierDisplayName;
  /** Default concurrent-connection ceiling (from the SDK). */
  readonly maxConnections: number;
  /**
   * Display name of the tier this one builds on (the next-lower tier in SDK order). Cards render
   * "Everything in X, plus …" instead of repeating the lower tier's benefits.
   */
  readonly inheritsFrom?: SubscriptionTierDisplayName;
}

/**
 * Prices (INR): free ₹0; middle ₹499/mo or ₹3,999/yr (~33% off vs 12 × ₹499 = ₹5,988);
 * top ₹999/mo or ₹7,999/yr (~33% off vs 12 × ₹999 = ₹11,988).
 */
const TIER_COPY: Readonly<Record<SubscriptionTier, TierCopy>> = {
  [SubscriptionTier.MUST]: {
    tagline: 'Your everyday encrypted messenger — free forever.',
    pricing: { monthly: 0, annual: 0 },
    priceLabelOverride: 'Free forever',
    mostPopular: false,
    headline: 'Unlimited encrypted messaging, free forever',
    adds: [
      'Unlimited end-to-end encrypted messaging',
      'One connection at a time',
      'Read receipts, typing indicators & disappearing messages',
      'Chat wallpaper & font size',
      'Multi-device history recovery',
      'Block & report, profile verification',
      '10 likes a day',
      'Mr.OneHook AI — 10 messages a day',
      '1 invite a month',
    ],
  },
  [SubscriptionTier.SUPER]: {
    tagline: 'Full discovery reach for people actively dating.',
    pricing: { monthly: 499, annual: 3999 },
    mostPopular: true,
    headline: 'See who liked you',
    adds: [
      'See who liked you',
      'Unlimited likes',
      'Every discovery filter',
      'Incognito browsing',
      'Global mode — match anywhere',
      'Rewind your last swipe',
      'Boosted discovery placement',
      'Unlimited Mr.OneHook AI',
      'Profile view insights',
      '3 invites a month, 1 boost a month',
    ],
  },
  [SubscriptionTier.INFINITY]: {
    tagline: `Everything in ${subscriptionTierInfo(SubscriptionTier.SUPER).displayName}, plus up to ${
      subscriptionTierInfo(SubscriptionTier.INFINITY).maxConnections
    } connections at once.`,
    pricing: { monthly: 999, annual: 7999 },
    mostPopular: false,
    headline: `Chat with ${subscriptionTierInfo(SubscriptionTier.INFINITY).maxConnections} people at once`,
    adds: [
      `${subscriptionTierInfo(SubscriptionTier.INFINITY).maxConnections} connections at once — chat with up to ${
        subscriptionTierInfo(SubscriptionTier.INFINITY).maxConnections
      } people`,
      'Top priority in discovery',
      '3 boosts a month',
      '5 invites a month',
      'Early access to new features',
    ],
  },
};

/** The tiers, in SDK order (lowest first), joined with their web copy. */
export const MEMBERSHIP_TIERS: readonly MembershipTier[] = SUBSCRIPTION_TIERS.map((info, i) => ({
  ...TIER_COPY[info.wire],
  wire: info.wire,
  displayName: info.displayName,
  maxConnections: info.maxConnections,
  inheritsFrom: i > 0 ? SUBSCRIPTION_TIERS[i - 1].displayName : undefined,
}));

/** Convenience lookups. */
export const MOST_POPULAR_TIER: MembershipTier =
  MEMBERSHIP_TIERS.find((t) => t.mostPopular) ?? MEMBERSHIP_TIERS[1];

/** Paid tier names joined for copy, e.g. "Super or Infinity". */
export const PAID_TIER_NAMES: string = PAID_SUBSCRIPTION_TIERS.map((t) => t.displayName)
  .join(', ')
  .replace(/, ([^,]*)$/, ' or $1');

export function tierByWire(wire: SubscriptionTier): MembershipTier {
  const found = MEMBERSHIP_TIERS.find((t) => t.wire === wire);
  if (!found) throw new Error(`Unknown tier wire value: ${wire}`);
  return found;
}

/** ~33% saving on both paid tiers when billed annually. */
export const ANNUAL_DISCOUNT_LABEL = 'Save ~33%';

/**
 * A single feature row in the comparison matrix. `values` is keyed by the SDK wire value so the
 * table and the mobile stacked cards read from the same data.
 *
 * A boolean renders as a check / dash; a string renders verbatim.
 */
export type FeatureValue = boolean | string;

export interface FeatureRow {
  readonly label: string;
  readonly values: Readonly<Record<SubscriptionTier, FeatureValue>>;
  /**
   * Marks the always-free messaging guarantees. These MUST be `true` for every tier —
   * the free tier keeps unlimited messaging forever.
   */
  readonly alwaysFreeMessaging?: boolean;
}

export interface FeatureGroup {
  readonly title: string;
  readonly rows: readonly FeatureRow[];
}

const { MUST, SUPER, INFINITY } = SubscriptionTier;

/** Same value for every tier. */
const all = (value: FeatureValue): Record<SubscriptionTier, FeatureValue> =>
  Object.fromEntries(SUBSCRIPTION_TIERS.map((t) => [t.wire, value])) as Record<SubscriptionTier, FeatureValue>;

/** Connection ceilings straight from the SDK. */
const connections = (): Record<SubscriptionTier, FeatureValue> =>
  Object.fromEntries(SUBSCRIPTION_TIERS.map((t) => [t.wire, String(t.maxConnections)])) as Record<
    SubscriptionTier,
    FeatureValue
  >;

/** The full benefit matrix, grouped for readability. */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    title: 'Connections',
    rows: [
      { label: 'Active connections (concurrent hooks)', values: connections() },
      { label: 'Simultaneous conversations', values: connections() },
    ],
  },
  {
    title: 'Messaging — free forever, every tier',
    rows: [
      { label: 'Unlimited end-to-end encrypted messaging', values: all(true), alwaysFreeMessaging: true },
      { label: 'Read receipts & typing indicators', values: all(true), alwaysFreeMessaging: true },
      { label: 'Disappearing messages', values: all(true), alwaysFreeMessaging: true },
      { label: 'Chat wallpaper & font size', values: all(true), alwaysFreeMessaging: true },
      { label: 'Multi-device history recovery', values: all(true), alwaysFreeMessaging: true },
      { label: 'Block & report, profile verification', values: all(true), alwaysFreeMessaging: true },
    ],
  },
  {
    title: 'Dating & discovery',
    rows: [
      { label: 'Daily likes', values: { [MUST]: '10/day', [SUPER]: '∞', [INFINITY]: '∞' } },
      { label: 'Rewind last swipe', values: { [MUST]: false, [SUPER]: true, [INFINITY]: true } },
      { label: 'See who liked you', values: { [MUST]: false, [SUPER]: true, [INFINITY]: true } },
      {
        label: 'Discovery filters',
        values: { [MUST]: 'Age, distance, gender', [SUPER]: 'All filters', [INFINITY]: 'All filters' },
      },
      { label: 'Global mode (match anywhere)', values: { [MUST]: false, [SUPER]: true, [INFINITY]: true } },
      { label: 'Incognito browsing', values: { [MUST]: false, [SUPER]: true, [INFINITY]: true } },
      {
        label: 'Discovery placement',
        values: { [MUST]: 'Standard', [SUPER]: 'Boosted', [INFINITY]: 'Top priority' },
      },
    ],
  },
  {
    title: 'Extras',
    rows: [
      { label: 'Mr.OneHook AI', values: { [MUST]: '10 msgs/day', [SUPER]: '∞', [INFINITY]: '∞' } },
      { label: 'Profile view insights', values: { [MUST]: false, [SUPER]: true, [INFINITY]: true } },
      { label: 'Monthly invites', values: { [MUST]: '1', [SUPER]: '3', [INFINITY]: '5' } },
      { label: 'Monthly boosts', values: { [MUST]: false, [SUPER]: '1', [INFINITY]: '3' } },
      { label: 'Early access to new features', values: { [MUST]: false, [SUPER]: false, [INFINITY]: true } },
    ],
  },
];

/** Flat view of every feature row, when a group-agnostic list is more convenient. */
export const ALL_FEATURE_ROWS: readonly FeatureRow[] = FEATURE_GROUPS.flatMap((g) => g.rows);

/** Format an INR amount as e.g. "₹499" / "₹3,999". */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * The price string to show for a tier at a given billing period.
 * Free tier returns its override ("Free forever"); paid tiers return "₹X/month" or "₹X/year".
 */
export function priceLabel(tier: MembershipTier, period: BillingPeriod): string {
  if (tier.priceLabelOverride && tier.pricing.monthly === 0) {
    return tier.priceLabelOverride;
  }
  return period === 'monthly'
    ? `${formatInr(tier.pricing.monthly)}/month`
    : `${formatInr(tier.pricing.annual)}/year`;
}
