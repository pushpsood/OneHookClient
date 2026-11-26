import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MrOneHookProStatus, ProSubscription } from 'onehook-mr-onehook-client';
import {
  includesMrOneHookPro,
  MR_ONEHOOK_PRO_TIERS,
  subscriptionTierDisplayName,
  SUBSCRIPTION_TIERS,
} from 'onehook-api-client/membership';
import {
  buildProScreenModel,
  formatMinorInr,
  formatProDate,
  mrOneHookPlanContext,
  FREE_PLAN_FALLBACK_LIMITS,
} from '../lib/mr-onehook-pro';
import { MrOneHookProContent } from '../components/chat/MrOneHookProSheet';
import { AskMrOneHookButton, composerSendLabel } from '../components/chat/MrOneHookAttachments';
import { ALL_FEATURE_ROWS, MR_ONEHOOK_PRO_TIER, tierByWire } from '../config/membership.config';

/**
 * The Mr OneHook Pro screen for every plan source: Free, a subscription (active, paused for the
 * membership, refund), a membership that includes Pro (with and without an end date), a kept plan
 * (SCHEDULED) and the complimentary period.
 */

const TOP_TIER_NAME = subscriptionTierDisplayName(MR_ONEHOOK_PRO_TIER);

const offers = [
  { billingPeriod: 'YEARLY' as const, priceMinor: 599900, currency: 'INR' },
  { billingPeriod: 'MONTHLY' as const, priceMinor: 79900, currency: 'INR' },
];

const freeLimits = {
  dailyMessages: 10,
  maxSessions: 1,
  attachmentsAllowed: false,
  maxAttachmentBytes: 5242880,
  maxAttachmentsPerMessage: 3,
};
const proLimits = {
  maxSessions: 3,
  attachmentsAllowed: true,
  maxAttachmentBytes: 5242880,
  maxAttachmentsPerMessage: 3,
};

const status = (over: Partial<MrOneHookProStatus>): MrOneHookProStatus => ({
  plan: 'FREE',
  source: 'NONE',
  canPurchase: true,
  offers,
  limits: freeLimits,
  notices: [],
  ...over,
});

const sub = (over: Partial<ProSubscription>): ProSubscription => ({
  status: 'ACTIVE',
  billingPeriod: 'MONTHLY',
  autoRenew: true,
  priceMinor: 79900,
  currency: 'INR',
  pausedForMembership: false,
  currentPeriodStart: '2026-11-01T00:00:00Z',
  currentPeriodEnd: '2026-12-01T00:00:00Z',
  nextChargeAt: '2026-12-01T00:00:00Z',
  createdAt: '2026-11-01T00:00:00Z',
  ...over,
});

const html = (
  s: MrOneHookProStatus,
  ctx: { membershipEndsAt?: number; pendingUpgrade?: boolean; tierName?: string } = {}
) => renderToStaticMarkup(<MrOneHookProContent status={s} {...ctx} />);

describe('prices', () => {
  it('formats paise with the INR helper', () => {
    expect(formatMinorInr(79900)).toBe('₹799');
    expect(formatMinorInr(599900)).toBe('₹5,999');
  });
});

describe('Pro screen states', () => {
  it('Free: offers (monthly first) and Buy buttons', () => {
    const m = buildProScreenModel(status({}));
    expect(m.headline).toBe('FREE');
    expect(m.canBuy).toBe(true);
    expect(m.offers.map((o) => o.priceLabel)).toEqual(['₹799/month', '₹5,999/year']);
    const out = html(status({}));
    expect(out).toContain('data-testid="pro-offers"');
    expect(out).toContain('Buy · ₹799/month');
    expect(out).toContain('Buy · ₹5,999/year');
  });

  it('Free without canPurchase shows no Buy button', () => {
    expect(buildProScreenModel(status({ canPurchase: false })).canBuy).toBe(false);
    expect(html(status({ canPurchase: false }))).not.toContain('Buy ·');
  });

  it('SUBSCRIPTION active: period end, next charge, auto-renew switch', () => {
    const s = status({
      plan: 'PRO',
      source: 'SUBSCRIPTION',
      canPurchase: false,
      limits: proLimits,
      subscription: sub({}),
    });
    const m = buildProScreenModel(s);
    expect(m.headline).toBe('SUBSCRIPTION');
    expect(m.canBuy).toBe(false);
    expect(m.subscription).toMatchObject({
      statusLabel: 'Active',
      periodLine: `Pro until ${formatProDate('2026-12-01T00:00:00Z')}`,
      nextChargeLine: `Next charge ${formatProDate('2026-12-01T00:00:00Z')}: ₹799/month`,
      canToggleAutoRenew: true,
      autoRenew: true,
    });
    const out = html(s);
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).not.toContain('Buy ·');
  });

  it('SUBSCRIPTION with auto-renew off says it will not renew', () => {
    const s = status({
      plan: 'PRO',
      source: 'SUBSCRIPTION',
      canPurchase: false,
      subscription: sub({ autoRenew: false, nextChargeAt: undefined }),
    });
    const m = buildProScreenModel(s);
    expect(m.subscription?.statusLabel).toBe('Active, not renewing');
    expect(m.subscription?.nextChargeLine).toBeUndefined();
  });

  it('paused for the membership: explains it and hides the switch, with the refund', () => {
    const s = status({
      plan: 'PRO',
      source: 'MEMBERSHIP',
      canPurchase: false,
      subscription: sub({
        billingPeriod: 'YEARLY',
        priceMinor: 599900,
        autoRenew: false,
        pausedForMembership: true,
        nextChargeAt: undefined,
        refund: {
          status: 'SCHEDULED',
          amountMinor: 449900,
          currency: 'INR',
          dueAt: '2026-12-01T00:00:00Z',
        },
      }),
    });
    const m = buildProScreenModel(s, { tierName: TOP_TIER_NAME });
    expect(m.headline).toBe('MEMBERSHIP');
    expect(m.subscription?.canToggleAutoRenew).toBe(false);
    expect(m.subscription?.pausedLine).toMatch(/doesn’t renew/);
    expect(m.subscription?.refundLine).toBe(
      `Refund of ₹4,499 scheduled for ${formatProDate('2026-12-01T00:00:00Z')}`
    );
    const out = html(s, { tierName: TOP_TIER_NAME });
    expect(out).toContain('data-testid="pro-refund"');
    expect(out).not.toContain('role="switch"');
  });

  it('refund issued and cancelled', () => {
    const issued = buildProScreenModel(
      status({
        subscription: sub({
          status: 'ENDED',
          endedReason: 'REFUNDED',
          refund: {
            status: 'ISSUED',
            amountMinor: 449900,
            currency: 'INR',
            dueAt: '2026-12-01T00:00:00Z',
            issuedAt: '2026-12-02T00:00:00Z',
          },
        }),
      })
    );
    expect(issued.subscription?.statusLabel).toBe('Ended: the unused months were refunded');
    expect(issued.subscription?.refundLine).toBe(
      `Refunded ₹4,499 on ${formatProDate('2026-12-02T00:00:00Z')}`
    );
    expect(issued.subscription?.periodLine).toBeUndefined();
    const cancelled = buildProScreenModel(
      status({
        plan: 'PRO',
        source: 'SUBSCRIPTION',
        canPurchase: false,
        subscription: sub({
          billingPeriod: 'YEARLY',
          refund: { status: 'CANCELLED', amountMinor: 1, currency: 'INR', dueAt: 'x' },
        }),
      })
    );
    expect(cancelled.subscription?.refundLine).toBe('Refund cancelled: your yearly plan continues');
  });

  it('MEMBERSHIP: included, no buy button, no keep card while the membership renews', () => {
    const s = status({ plan: 'PRO', source: 'MEMBERSHIP', canPurchase: false, limits: proLimits });
    const m = buildProScreenModel(s, { tierName: TOP_TIER_NAME });
    expect(m.summary).toBe(`Included with your ${TOP_TIER_NAME} membership`);
    expect(m.canBuy).toBe(false);
    expect(m.keepPro).toBeUndefined();
    const out = html(s, { tierName: TOP_TIER_NAME });
    expect(out).not.toContain('Buy ·');
    expect(out).not.toContain('data-testid="pro-keep"');
  });

  it('MEMBERSHIP with membershipEndsAt: "Keep Mr OneHook Pro after <date>" with both periods', () => {
    const endsAt = Date.parse('2027-01-15T00:00:00Z') / 1000;
    const s = status({ plan: 'PRO', source: 'MEMBERSHIP', canPurchase: false, limits: proLimits });
    const m = buildProScreenModel(s, { membershipEndsAt: endsAt });
    expect(m.keepPro?.title).toBe(`Keep Mr OneHook Pro after ${formatProDate(endsAt)}`);
    const out = html(s, { membershipEndsAt: endsAt });
    expect(out).toContain('data-testid="pro-keep"');
    expect(out).toContain('Keep · ₹799/month');
    expect(out).toContain('Keep · ₹5,999/year');
  });

  it('SCHEDULED (kept plan): starts on a date, first charge then, Withdraw', () => {
    const endsAt = Date.parse('2027-01-15T00:00:00Z') / 1000;
    const s = status({
      plan: 'PRO',
      source: 'MEMBERSHIP',
      canPurchase: false,
      subscription: sub({
        status: 'SCHEDULED',
        scheduledStartAt: '2027-01-15T00:00:00Z',
        currentPeriodEnd: undefined,
        nextChargeAt: '2027-01-15T00:00:00Z',
      }),
    });
    const m = buildProScreenModel(s, { membershipEndsAt: endsAt });
    expect(m.keepPro).toBeUndefined();
    expect(m.scheduled?.line).toBe(
      `Starts ${formatProDate('2027-01-15T00:00:00Z')}, first charge then: ₹799/month`
    );
    const out = html(s, { membershipEndsAt: endsAt });
    expect(out).toContain('data-testid="pro-scheduled"');
    expect(out).toContain('Withdraw');
  });

  it('COMPLIMENTARY: free until the kept plan starts', () => {
    const s = status({
      plan: 'PRO',
      source: 'COMPLIMENTARY',
      canPurchase: false,
      subscription: sub({ status: 'SCHEDULED', scheduledStartAt: '2027-01-15T00:00:00Z' }),
    });
    const m = buildProScreenModel(s);
    expect(m.headline).toBe('COMPLIMENTARY');
    expect(m.summary).toBe(`Free until ${formatProDate('2027-01-15T00:00:00Z')}`);
    expect(m.scheduled).toBeDefined();
    expect(html(s)).toContain('Withdraw');
  });

  it('pendingSubscriptionTier: "Activating your membership", and no buying meanwhile', () => {
    const m = buildProScreenModel(status({}), { pendingUpgrade: true });
    expect(m.activating).toBe(true);
    expect(m.canBuy).toBe(false);
    expect(html(status({}), { pendingUpgrade: true })).toContain('Activating your membership');
  });

  it('notices with dismiss, and the file allowance with its warning', () => {
    const s = status({
      plan: 'PRO',
      source: 'SUBSCRIPTION',
      canPurchase: false,
      subscription: sub({}),
      attachmentUsage: { usedPercent: 85, warning: true, resetsAt: '2026-12-01T00:00:00Z' },
      notices: [
        {
          noticeId: 'n1',
          kind: 'PRO_REFUND_SCHEDULED',
          createdAt: 'x',
          amountMinor: 449900,
          currency: 'INR',
          at: '2026-12-01T00:00:00Z',
        },
        { noticeId: 'n2', kind: 'ATTACHMENT_USAGE_WARNING', createdAt: 'x' },
      ],
    });
    const m = buildProScreenModel(s);
    expect(m.notices.map((n) => n.text)).toEqual([
      `A refund of ₹4,499 is scheduled for ${formatProDate('2026-12-01T00:00:00Z')}.`,
      'You have used most of this month’s file processing.',
    ]);
    expect(m.usage).toMatchObject({ usedPercent: 85, warning: true });
    const out = html(s);
    expect(out).toContain('data-testid="pro-notices"');
    expect(out).toContain('data-testid="pro-usage"');
    expect((out.match(/aria-label="Dismiss"/g) || []).length).toBe(2);
  });
});

describe('plan context', () => {
  it('until the status is read, or when Pro is off: Free limits and no Pro entry points', () => {
    expect(mrOneHookPlanContext(null, 'loading')).toEqual({
      plan: 'FREE',
      limits: FREE_PLAN_FALLBACK_LIMITS,
      proVisible: false,
    });
    expect(mrOneHookPlanContext(null, 'off').proVisible).toBe(false);
    const ready = mrOneHookPlanContext(status({ plan: 'PRO', limits: proLimits }), 'ready');
    expect(ready).toEqual({ plan: 'PRO', limits: proLimits, proVisible: true });
  });
});

describe('Free vs Pro gating of "Ask Mr OneHook" and the composer', () => {
  it('Free with files selected: "Get Mr OneHook Pro", enabled', () => {
    const out = renderToStaticMarkup(
      <AskMrOneHookButton plan="FREE" selectedCount={2} fileCount={1} onClick={() => undefined} />
    );
    expect(out).toContain('Get Mr OneHook Pro');
    expect(out).toContain('data-action="get_pro"');
    expect(out).not.toContain('disabled=""');
  });

  it('Free with only messages selected: "Ask Mr OneHook" (messages are not a Pro feature)', () => {
    const out = renderToStaticMarkup(
      <AskMrOneHookButton plan="FREE" selectedCount={2} fileCount={0} onClick={() => undefined} />
    );
    expect(out).toContain('Ask Mr OneHook');
    expect(out).toContain('data-action="ask"');
    expect(out).not.toContain('disabled=""');
  });

  it('Pro: "Ask Mr OneHook", disabled until something is selected', () => {
    const none = renderToStaticMarkup(
      <AskMrOneHookButton plan="PRO" selectedCount={0} fileCount={0} onClick={() => undefined} />
    );
    expect(none).toContain('Ask Mr OneHook');
    expect(none).toContain('disabled=""');
    const some = renderToStaticMarkup(
      <AskMrOneHookButton plan="PRO" selectedCount={1} fileCount={1} onClick={() => undefined} />
    );
    expect(some).toContain('data-action="ask"');
    expect(some).not.toContain('disabled=""');
  });

  it('composer labels', () => {
    expect(composerSendLabel('GET_PRO')).toBe('Get Mr OneHook Pro');
    expect(composerSendLabel('WAIT')).toBe('Reading files…');
    expect(composerSendLabel('SEND')).toBeUndefined();
  });
});

describe('membership matrix', () => {
  it('the tiers that include Pro (SDK) list it as included; the others get the Free plan', () => {
    const row = ALL_FEATURE_ROWS.find((r) => r.label === 'Mr.OneHook AI');
    for (const t of SUBSCRIPTION_TIERS) {
      expect(row?.values[t.wire], t.displayName).toBe(
        includesMrOneHookPro(t.wire) ? 'Mr OneHook Pro included' : '10 msgs/day'
      );
    }
    // Today only the top tier (Infinity) includes Pro.
    expect(MR_ONEHOOK_PRO_TIERS).toEqual([SUBSCRIPTION_TIERS.at(-1)!.wire]);
    expect(MR_ONEHOOK_PRO_TIER).toBe(MR_ONEHOOK_PRO_TIERS[0]);
    expect(tierByWire(MR_ONEHOOK_PRO_TIER).includesMrOneHookPro).toBe(true);
    expect(tierByWire(MR_ONEHOOK_PRO_TIER).adds).toContain('Mr OneHook Pro included');
    for (const t of SUBSCRIPTION_TIERS.slice(0, -1)) {
      expect(tierByWire(t.wire).adds.join(' ')).not.toMatch(/Unlimited Mr\.?\s?OneHook/i);
    }
  });
});
