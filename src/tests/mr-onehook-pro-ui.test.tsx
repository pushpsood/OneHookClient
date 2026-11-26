// @vitest-environment jsdom
/**
 * The Mr OneHook Pro screen, rendered in a DOM (jsdom + Testing Library). The store's network actions
 * are replaced with spies; everything else (screen model, sheet open/close, store state) is real.
 *
 *   - the plan is shown (Free with offers; Pro by subscription);
 *   - Buy monthly / yearly call the purchase with the right billing period;
 *   - the auto-renew switch turns it off and on;
 *   - "Keep Mr OneHook Pro" after the membership, and withdrawing a kept plan;
 *   - dismissing a notice;
 *   - the sheet: screen view, Close, Escape and "Try again" (refresh);
 *   - every control reports its `mr_onehook_pro.*` id with a valid value (as the click listener does).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MrOneHookProStatus, ProSubscription } from 'onehook-mr-onehook-client';
import { MrOneHookProContent, MrOneHookProSheet } from '../components/chat/MrOneHookProSheet';
import {
  dismissMrOneHookProNotice,
  keepMrOneHookProAfterMembership,
  loadMrOneHookPro,
  purchaseMrOneHookPro,
  setMrOneHookProAutoRenew,
  useMrOneHookProStore,
  withdrawMrOneHookProContinuation,
} from '../store/mr-onehook-pro-store';
import { trackScreenView, trackUi } from '../lib/analytics/analytics';
import { uiInteractionFromTarget } from '../lib/analytics/uiTracking';
import { formatProDate } from '../lib/mr-onehook-pro';

vi.mock('../store/mr-onehook-pro-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/mr-onehook-pro-store')>()),
  purchaseMrOneHookPro: vi.fn(async () => ({ ok: true })),
  setMrOneHookProAutoRenew: vi.fn(async () => ({ ok: true })),
  keepMrOneHookProAfterMembership: vi.fn(async () => ({ ok: true })),
  withdrawMrOneHookProContinuation: vi.fn(async () => ({ ok: true })),
  dismissMrOneHookProNotice: vi.fn(async () => ({ ok: true })),
  loadMrOneHookPro: vi.fn(async () => {}),
}));

vi.mock('../lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics/analytics')>()),
  trackUi: vi.fn(),
  trackScreenView: vi.fn(),
}));

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
const proLimits = { maxSessions: 3, attachmentsAllowed: true, maxAttachmentBytes: 5242880, maxAttachmentsPerMessage: 3 };

const status = (over: Partial<MrOneHookProStatus> = {}): MrOneHookProStatus => ({
  plan: 'FREE',
  source: 'NONE',
  canPurchase: true,
  offers,
  limits: freeLimits,
  notices: [],
  ...over,
});
const sub = (over: Partial<ProSubscription> = {}): ProSubscription => ({
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
const subscribed = (over: Partial<ProSubscription> = {}) =>
  status({ plan: 'PRO', source: 'SUBSCRIPTION', canPurchase: false, limits: proLimits, subscription: sub(over) });

const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  useMrOneHookProStore.setState({ sheetOpen: false, status: null, availability: 'unknown', userId: undefined });
});

describe('the plan', () => {
  it('Free: the plan, what Pro adds, and both offers', () => {
    render(<MrOneHookProContent status={status()} />);
    expect(screen.getByTestId('pro-summary').textContent).toBeTruthy();
    expect(screen.getByText('Unlimited messages with Mr OneHook')).toBeTruthy();
    const offersBox = screen.getByTestId('pro-offers');
    expect(within(offersBox).getByRole('button', { name: 'Buy · ₹799/month' })).toBeTruthy();
    expect(within(offersBox).getByRole('button', { name: 'Buy · ₹5,999/year' })).toBeTruthy();
    expect(screen.queryByText('Mr OneHook Pro is on')).toBeNull();
  });

  it('Pro by subscription: "Mr OneHook Pro is on", the period and no Buy buttons', () => {
    render(<MrOneHookProContent status={subscribed()} />);
    expect(screen.getByText('Mr OneHook Pro is on')).toBeTruthy();
    expect(screen.getByText(`Pro until ${formatProDate('2026-12-01T00:00:00Z')}`)).toBeTruthy();
    expect(screen.queryByTestId('pro-offers')).toBeNull();
  });
});

describe('buy', () => {
  it('Buy monthly purchases MONTHLY and reports mr_onehook_pro.buy = monthly', async () => {
    render(<MrOneHookProContent status={status()} />);
    const monthly = screen.getByTestId('pro-buy_monthly');
    expect(uiInteractionFromTarget(monthly)).toEqual({ elementId: 'mr_onehook_pro.buy', action: 'tap', value: 'monthly' });
    await press(monthly);
    expect(purchaseMrOneHookPro).toHaveBeenCalledWith('MONTHLY');
  });

  it('Buy yearly purchases YEARLY and reports mr_onehook_pro.buy = yearly', async () => {
    render(<MrOneHookProContent status={status()} />);
    const yearly = screen.getByTestId('pro-buy_yearly');
    expect(uiInteractionFromTarget(yearly)).toEqual({ elementId: 'mr_onehook_pro.buy', action: 'tap', value: 'yearly' });
    await press(yearly);
    expect(purchaseMrOneHookPro).toHaveBeenCalledWith('YEARLY');
  });

  it('while a purchase runs the buttons are disabled; "coming soon" disables them after', async () => {
    let finish!: (v: { ok: false; problem: 'COMING_SOON' }) => void;
    vi.mocked(purchaseMrOneHookPro).mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );
    render(<MrOneHookProContent status={status()} />);
    await press(screen.getByTestId('pro-buy_monthly'));
    expect(screen.getByTestId('pro-buy_monthly').textContent).toBe('Working…');
    expect((screen.getByTestId('pro-buy_yearly') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ok: false, problem: 'COMING_SOON' }));
    expect(screen.getByText(/Coming soon/)).toBeTruthy();
    expect((screen.getByTestId('pro-buy_monthly') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('auto-renew', () => {
  it('the switch turns auto-renew off (value off)', async () => {
    render(<MrOneHookProContent status={subscribed({ autoRenew: true })} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(uiInteractionFromTarget(toggle)).toEqual({
      elementId: 'mr_onehook_pro.auto_renew_toggle',
      action: 'toggle',
      value: 'off',
    });
    await press(toggle);
    expect(setMrOneHookProAutoRenew).toHaveBeenCalledWith(false);
  });

  it('and back on (value on)', async () => {
    render(<MrOneHookProContent status={subscribed({ autoRenew: false, nextChargeAt: undefined })} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(uiInteractionFromTarget(toggle)).toMatchObject({ value: 'on' });
    await press(toggle);
    expect(setMrOneHookProAutoRenew).toHaveBeenCalledWith(true);
  });
});

describe('keep after membership', () => {
  const endsAt = Date.parse('2027-01-15T00:00:00Z') / 1000;
  const included = status({ plan: 'PRO', source: 'MEMBERSHIP', canPurchase: false, limits: proLimits });

  it('Keep monthly / yearly schedule the plan and report keep_after_membership', async () => {
    render(<MrOneHookProContent status={included} membershipEndsAt={endsAt} />);
    const keep = screen.getByTestId('pro-keep');
    expect(keep.textContent).toContain(`Keep Mr OneHook Pro after ${formatProDate(endsAt)}`);
    const yearly = screen.getByTestId('pro-keep_yearly');
    expect(uiInteractionFromTarget(yearly)).toEqual({
      elementId: 'mr_onehook_pro.keep_after_membership',
      action: 'tap',
      value: 'yearly',
    });
    await press(yearly);
    expect(keepMrOneHookProAfterMembership).toHaveBeenCalledWith('YEARLY');
    await press(screen.getByTestId('pro-keep_monthly'));
    expect(keepMrOneHookProAfterMembership).toHaveBeenLastCalledWith('MONTHLY');
    expect(purchaseMrOneHookPro).not.toHaveBeenCalled();
  });

  it('a kept plan can be withdrawn (keep_withdraw)', async () => {
    const kept = status({
      plan: 'PRO',
      source: 'MEMBERSHIP',
      canPurchase: false,
      subscription: sub({ status: 'SCHEDULED', scheduledStartAt: '2027-01-15T00:00:00Z', currentPeriodEnd: undefined }),
    });
    render(<MrOneHookProContent status={kept} membershipEndsAt={endsAt} />);
    const withdraw = within(screen.getByTestId('pro-scheduled')).getByRole('button', { name: 'Withdraw' });
    expect(uiInteractionFromTarget(withdraw)).toEqual({ elementId: 'mr_onehook_pro.keep_withdraw', action: 'tap' });
    await press(withdraw);
    expect(withdrawMrOneHookProContinuation).toHaveBeenCalledTimes(1);
  });
});

describe('notices', () => {
  it('Dismiss removes the notice through the store and reports notice_dismiss', async () => {
    const withNotice = {
      ...subscribed(),
      notices: [{ noticeId: 'n2', kind: 'ATTACHMENT_USAGE_WARNING', createdAt: 'x' }],
    } as MrOneHookProStatus;
    render(<MrOneHookProContent status={withNotice} />);
    const notices = screen.getByTestId('pro-notices');
    expect(notices.textContent).toContain('You have used most of this month’s file processing.');
    const dismiss = within(notices).getByRole('button', { name: 'Dismiss' });
    expect(uiInteractionFromTarget(dismiss)).toEqual({ elementId: 'mr_onehook_pro.notice_dismiss', action: 'tap' });
    await press(dismiss);
    expect(dismissMrOneHookProNotice).toHaveBeenCalledWith('n2');
  });
});

describe('the sheet', () => {
  const open = (over: Partial<ReturnType<typeof useMrOneHookProStore.getState>> = {}) =>
    act(() => {
      useMrOneHookProStore.setState({
        userId: 'u1',
        sheetOpen: true,
        status: status(),
        availability: 'ready',
        ...over,
      });
    });

  it('reports the MR_ONEHOOK_PRO screen view when it opens', () => {
    render(<MrOneHookProSheet />);
    expect(trackScreenView).not.toHaveBeenCalled();
    open();
    expect(screen.getByTestId('mr-onehook-pro')).toBeTruthy();
    expect(trackScreenView).toHaveBeenCalledWith('MR_ONEHOOK_PRO');
  });

  it('Close (tap) closes it', async () => {
    render(<MrOneHookProSheet />);
    open();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(uiInteractionFromTarget(close)).toEqual({ elementId: 'mr_onehook_pro.close', action: 'tap' });
    await press(close);
    expect(useMrOneHookProStore.getState().sheetOpen).toBe(false);
    expect(screen.queryByTestId('mr-onehook-pro')).toBeNull();
  });

  it('Escape and the backdrop close it as a dismiss', async () => {
    render(<MrOneHookProSheet />);
    open();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(useMrOneHookProStore.getState().sheetOpen).toBe(false);
    expect(trackUi).toHaveBeenCalledWith('mr_onehook_pro.close', { action: 'dismiss' });

    vi.mocked(trackUi).mockClear();
    open();
    await press(screen.getByTestId('mr-onehook-pro').parentElement!);
    expect(useMrOneHookProStore.getState().sheetOpen).toBe(false);
    expect(trackUi).toHaveBeenCalledWith('mr_onehook_pro.close', { action: 'dismiss' });
  });

  it('"Try again" after a failed read refreshes the status (mr_onehook_pro.refresh)', async () => {
    render(<MrOneHookProSheet />);
    open({ status: null, availability: 'error' });
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(uiInteractionFromTarget(retry)).toEqual({ elementId: 'mr_onehook_pro.refresh', action: 'tap' });
    await press(retry);
    expect(loadMrOneHookPro).toHaveBeenCalledWith('u1', true);
  });
});
