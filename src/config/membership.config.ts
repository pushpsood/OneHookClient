/**
 * Single source of truth for the PUBLIC membership catalogue shown on the website
 * (`/pricing`) and mirrored by the iOS membership comparison screen.
 *
 * ── Product strategy (why the matrix looks the way it does) ─────────────────────────────
 * Messaging is FREE FOREVER on every tier — unlimited end-to-end encrypted chat, read
 * receipts, disappearing messages, wallpapers, multi-device history recovery, the lot.
 * The intent is that a couple who met on OneHook keep using it as their everyday
 * messenger long after they stop dating; the free "Must" tier is a real, permanent home,
 * not a crippled trial.
 *
 * The paid tiers ("Super", "Infinity") serve a DIFFERENT person: someone actively
 * exploring dating who wants reach and discovery power (unlimited likes, rewind, see who
 * liked you, global mode, incognito, boosts, insights). Those are dating-discovery
 * upgrades layered on top of the always-free messenger.
 *
 * The one capacity that is deliberately gated is CONCURRENT CONNECTIONS ("hooks"): only
 * Infinity allows more than one at a time (3). Must and Super are both one-at-a-time by
 * design — OneHook's core promise is intentional, one-connection-at-a-time dating, and
 * paying for Super buys discovery reach, NOT the ability to juggle more people. Infinity
 * is the only tier that relaxes that, for the few who genuinely want it.
 *
 * ── Wire vs. display ────────────────────────────────────────────────────────────────────
 * The backend enum wire values are frozen (FREE / GOLD / PLATINUM) and must never change;
 * the marketing names are a presentation concern that lives here. This file is the
 * client-side mirror of `SubscriptionTier` in the backend `common` package — keep the
 * display names and default connection ceilings (1 / 1 / 3) in sync with it.
 *
 * There is NO in-app / on-web purchase flow. Memberships are applied to your account; the
 * only call-to-action anywhere in this surface is the app-download smart link.
 */

/** App-download smart link (302s to the right store by device). Primary + only CTA. */
export const APP_DOWNLOAD_URL = 'https://app.onehook.club';

/** Frozen backend enum wire values. Never rename — the server persists these. */
export type TierWireValue = 'FREE' | 'GOLD' | 'PLATINUM';

/** Public marketing names. Mirror of backend `SubscriptionTier.getDisplayName()`. */
export type TierDisplayName = 'Must' | 'Super' | 'Infinity';

export type BillingPeriod = 'monthly' | 'annual';

export interface TierPricing {
  /** Rupee price for a single month on the monthly plan. */
  readonly monthly: number;
  /** Rupee price for a full year on the annual plan (already discounted). */
  readonly annual: number;
}

export interface MembershipTier {
  readonly wire: TierWireValue;
  readonly displayName: TierDisplayName;
  /** Default concurrent-connection ceiling. Mirrors backend getDefaultMaxConnections(). */
  readonly maxConnections: number;
  /** One-line positioning shown under the tier name. */
  readonly tagline: string;
  readonly pricing: TierPricing;
  /** Free tier gets a human phrase instead of a number ("Free forever"). */
  readonly priceLabelOverride?: string;
  /** Exactly one tier is flagged the recommended / most-popular tier. */
  readonly mostPopular: boolean;
  /**
   * The tier this one builds on. Cards render "Everything in Super, plus …" instead of repeating the
   * lower tier's benefits, so each list carries only what is genuinely NEW at that price.
   */
  readonly inheritsFrom?: TierDisplayName;
  /** The single most compelling reason to be on this tier, shown prominently on the card. */
  readonly headline: string;
  /** ONLY what this tier adds over `inheritsFrom`, most prominent first. Never repeats inherited items. */
  readonly adds: readonly string[];
}

/**
 * The three tiers, ordered as shown on the page.
 *
 * Prices (INR):
 *   Must     — ₹0 (free forever)
 *   Super    — ₹499/mo  or ₹3,999/yr  (~33% off vs. 12 × ₹499 = ₹5,988)
 *   Infinity — ₹999/mo  or ₹7,999/yr  (~33% off vs. 12 × ₹999 = ₹11,988)
 */
export const MEMBERSHIP_TIERS: readonly MembershipTier[] = [
  {
    wire: 'FREE',
    displayName: 'Must',
    maxConnections: 1,
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
  {
    wire: 'GOLD',
    displayName: 'Super',
    maxConnections: 1,
    tagline: 'Full discovery reach for people actively dating.',
    pricing: { monthly: 499, annual: 3999 },
    mostPopular: true,
    inheritsFrom: 'Must',
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
  {
    wire: 'PLATINUM',
    displayName: 'Infinity',
    maxConnections: 3,
    tagline: 'Everything in Super, plus up to three connections at once.',
    pricing: { monthly: 999, annual: 7999 },
    mostPopular: false,
    inheritsFrom: 'Super',
    headline: 'Chat with 3 people at once',
    adds: [
      '3 connections at once — chat with up to 3 people',
      'Top priority in discovery',
      '3 boosts a month',
      '5 invites a month',
      'Early access to new features',
    ],
  },
] as const;

/** Convenience lookups. */
export const MOST_POPULAR_TIER: MembershipTier =
  MEMBERSHIP_TIERS.find((t) => t.mostPopular) ?? MEMBERSHIP_TIERS[1];

export function tierByWire(wire: TierWireValue): MembershipTier {
  const found = MEMBERSHIP_TIERS.find((t) => t.wire === wire);
  if (!found) throw new Error(`Unknown tier wire value: ${wire}`);
  return found;
}

/** Wire → display mapping, exposed as data for tests and callers. */
export const WIRE_TO_DISPLAY: Readonly<Record<TierWireValue, TierDisplayName>> = {
  FREE: 'Must',
  GOLD: 'Super',
  PLATINUM: 'Infinity',
};

/** ~33% saving on both paid tiers when billed annually. */
export const ANNUAL_DISCOUNT_LABEL = 'Save ~33%';

/**
 * A single feature row in the comparison matrix. `values` is keyed by wire value so the
 * table and the mobile stacked cards read from the same data.
 *
 * A boolean renders as a check / dash; a string renders verbatim.
 */
export type FeatureValue = boolean | string;

export interface FeatureRow {
  readonly label: string;
  readonly values: Readonly<Record<TierWireValue, FeatureValue>>;
  /**
   * Marks the always-free messaging guarantees. These MUST be `true` for every tier —
   * the free tier keeps unlimited messaging forever. Used by tests and (optionally) to
   * group the "everyday messenger" rows visually.
   */
  readonly alwaysFreeMessaging?: boolean;
}

export interface FeatureGroup {
  readonly title: string;
  readonly rows: readonly FeatureRow[];
}

/** The full benefit matrix, grouped for readability. */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    title: 'Connections',
    rows: [
      {
        label: 'Active connections (concurrent hooks)',
        values: { FREE: '1', GOLD: '1', PLATINUM: '3' },
      },
      {
        label: 'Simultaneous conversations',
        values: { FREE: '1', GOLD: '1', PLATINUM: '3' },
      },
    ],
  },
  {
    title: 'Messaging — free forever, every tier',
    rows: [
      {
        label: 'Unlimited end-to-end encrypted messaging',
        values: { FREE: true, GOLD: true, PLATINUM: true },
        alwaysFreeMessaging: true,
      },
      {
        label: 'Read receipts & typing indicators',
        values: { FREE: true, GOLD: true, PLATINUM: true },
        alwaysFreeMessaging: true,
      },
      {
        label: 'Disappearing messages',
        values: { FREE: true, GOLD: true, PLATINUM: true },
        alwaysFreeMessaging: true,
      },
      {
        label: 'Chat wallpaper & font size',
        values: { FREE: true, GOLD: true, PLATINUM: true },
        alwaysFreeMessaging: true,
      },
      {
        label: 'Multi-device history recovery',
        values: { FREE: true, GOLD: true, PLATINUM: true },
        alwaysFreeMessaging: true,
      },
      {
        label: 'Block & report, profile verification',
        values: { FREE: true, GOLD: true, PLATINUM: true },
        alwaysFreeMessaging: true,
      },
    ],
  },
  {
    title: 'Dating & discovery',
    rows: [
      {
        label: 'Daily likes',
        values: { FREE: '10/day', GOLD: '∞', PLATINUM: '∞' },
      },
      {
        label: 'Rewind last swipe',
        values: { FREE: false, GOLD: true, PLATINUM: true },
      },
      {
        label: 'See who liked you',
        values: { FREE: false, GOLD: true, PLATINUM: true },
      },
      {
        label: 'Discovery filters',
        values: {
          FREE: 'Age, distance, gender',
          GOLD: 'All filters',
          PLATINUM: 'All filters',
        },
      },
      {
        label: 'Global mode (match anywhere)',
        values: { FREE: false, GOLD: true, PLATINUM: true },
      },
      {
        label: 'Incognito browsing',
        values: { FREE: false, GOLD: true, PLATINUM: true },
      },
      {
        label: 'Discovery placement',
        values: { FREE: 'Standard', GOLD: 'Boosted', PLATINUM: 'Top priority' },
      },
    ],
  },
  {
    title: 'Extras',
    rows: [
      {
        label: 'Mr.OneHook AI',
        values: { FREE: '10 msgs/day', GOLD: '∞', PLATINUM: '∞' },
      },
      {
        label: 'Profile view insights',
        values: { FREE: false, GOLD: true, PLATINUM: true },
      },
      {
        label: 'Monthly invites',
        values: { FREE: '1', GOLD: '3', PLATINUM: '5' },
      },
      {
        label: 'Monthly boosts',
        values: { FREE: false, GOLD: '1', PLATINUM: '3' },
      },
      {
        label: 'Early access to new features',
        values: { FREE: false, GOLD: false, PLATINUM: true },
      },
    ],
  },
] as const;

/** Flat view of every feature row, when a group-agnostic list is more convenient. */
export const ALL_FEATURE_ROWS: readonly FeatureRow[] = FEATURE_GROUPS.flatMap(
  (g) => g.rows,
);

/** Format an INR amount as e.g. "₹499" / "₹3,999". */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * The price string to show for a tier at a given billing period.
 * Free tier returns its override ("Free forever"); paid tiers return "₹X/month" or
 * "₹X/year".
 */
export function priceLabel(tier: MembershipTier, period: BillingPeriod): string {
  if (tier.priceLabelOverride && tier.pricing.monthly === 0) {
    return tier.priceLabelOverride;
  }
  return period === 'monthly'
    ? `${formatInr(tier.pricing.monthly)}/month`
    : `${formatInr(tier.pricing.annual)}/year`;
}
