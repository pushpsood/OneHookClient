import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { ProBillingPeriod, type MrOneHookProStatus } from 'onehook-mr-onehook-client';
import { subscriptionTierDisplayName } from 'onehook-api-client/membership';
import { useAppStore } from '../../store/app-store';
import {
  closeMrOneHookPro,
  dismissMrOneHookProNotice,
  keepMrOneHookProAfterMembership,
  loadMrOneHookPro,
  purchaseMrOneHookPro,
  setMrOneHookProAutoRenew,
  useActivatingMembershipPoll,
  useMrOneHookProStore,
  withdrawMrOneHookProContinuation,
  type ProActionResult,
} from '../../store/mr-onehook-pro-store';
import { buildProScreenModel, type ProScreenModel } from '../../lib/mr-onehook-pro';
import { proProblemCopy, type ProProblem } from '../../lib/mr-onehook-contract';
import { trackProps, UiElement } from '../../lib/analytics/analytics';

/** What Pro adds over Free, shown on the screen. */
export const PRO_BENEFITS: readonly string[] = [
  'Unlimited messages with Mr OneHook',
  'Keep up to 3 chats',
  'Send files: photos, documents, voice notes and videos (up to 3 per message, 5 MB each)',
  'Ask Mr OneHook about photos and files from your chats',
];

const PRO = UiElement.CHAT_MR_ONEHOOK_UPGRADE_OPEN;

/**
 * The Mr OneHook Pro screen: plan, offers and purchase, the subscription (auto-renew, pause, refund),
 * "Keep Mr OneHook Pro" for a membership that includes it, notices and the file allowance. Mounted once
 * by AppContent; opened with `openMrOneHookPro()` from the Mr OneHook chat and Settings.
 */
export function MrOneHookProSheet() {
  const open = useMrOneHookProStore((s) => s.sheetOpen);
  const status = useMrOneHookProStore((s) => s.status);
  const availability = useMrOneHookProStore((s) => s.availability);
  const userId = useMrOneHookProStore((s) => s.userId);
  const userState = useAppStore((s) => s.userState);
  const pending = Boolean(userState?.pendingSubscriptionTier);
  useActivatingMembershipPoll(open && pending, userId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMrOneHookPro();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || availability === 'off') return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      data-track-exempt="backdrop: closing is tracked by the Close button"
      onClick={closeMrOneHookPro}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mr-onehook-pro-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-border p-5 space-y-4 text-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: only stops clicks inside the dialog from closing it"
        data-testid="mr-onehook-pro"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="mr-onehook-pro-title" className="text-base font-black flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" /> Mr OneHook Pro
          </h2>
          <button
            type="button"
            onClick={closeMrOneHookPro}
            {...trackProps(PRO, { action: 'dismiss', targetId: 'close' })}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text/60 hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {status ? (
          <MrOneHookProContent
            status={status}
            membershipEndsAt={userState?.membershipEndsAt}
            pendingUpgrade={pending}
            tierName={
              userState?.subscriptionTier
                ? subscriptionTierDisplayName(userState.subscriptionTier)
                : undefined
            }
          />
        ) : availability === 'error' ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Mr OneHook Pro couldn&rsquo;t be loaded.</p>
            <button
              type="button"
              onClick={() => userId && void loadMrOneHookPro(userId, true)}
              {...trackProps(UiElement.CHAT_RETRY)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="text-sm text-text-secondary flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
          </p>
        )}
      </div>
    </div>
  );
}

/** The screen's body for a loaded status. Exported for render tests. */
export function MrOneHookProContent({
  status,
  membershipEndsAt,
  pendingUpgrade,
  tierName,
}: {
  status: MrOneHookProStatus;
  membershipEndsAt?: number;
  pendingUpgrade?: boolean;
  tierName?: string;
}) {
  const model: ProScreenModel = buildProScreenModel(status, {
    membershipEndsAt,
    pendingUpgrade,
    tierName,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ProProblem | null>(null);
  const [comingSoon, setComingSoon] = useState(false);

  const run = async (key: string, action: () => Promise<ProActionResult>) => {
    if (busy) return;
    setBusy(key);
    setProblem(null);
    try {
      const result = await action();
      if (result.ok === false) {
        if (result.problem === 'COMING_SOON') setComingSoon(true);
        else setProblem(result.problem);
      }
    } finally {
      setBusy(null);
    }
  };

  const offerButtons = (kind: 'buy' | 'keep') =>
    model.offers.map((offer) => {
      const key = `${kind}_${offer.billingPeriod === ProBillingPeriod.YEARLY ? 'yearly' : 'monthly'}`;
      return (
        <button
          key={offer.billingPeriod}
          type="button"
          disabled={Boolean(busy) || comingSoon}
          onClick={() =>
            void run(key, () =>
              kind === 'buy'
                ? purchaseMrOneHookPro(offer.billingPeriod)
                : keepMrOneHookProAfterMembership(offer.billingPeriod)
            )
          }
          {...trackProps(PRO, { targetId: key })}
          className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
        >
          {busy === key ? 'Working…' : `${kind === 'buy' ? 'Buy' : 'Keep'} · ${offer.priceLabel}`}
        </button>
      );
    });

  return (
    <div className="space-y-4" data-headline={model.headline}>
      {model.activating && (
        <div
          role="status"
          className="rounded-xl border border-accent/40 bg-accent/5 p-3 text-xs flex items-center gap-2"
          data-testid="pro-activating"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Activating your
          membership…
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-semibold" data-testid="pro-summary">
          {model.summary}
        </p>
        {model.headline !== 'FREE' && (
          <p className="inline-flex items-center gap-1.5 text-xs text-green-600 font-semibold">
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Mr OneHook Pro is on
          </p>
        )}
      </div>

      <ul className="space-y-1.5 text-xs text-text-secondary">
        {PRO_BENEFITS.map((b) => (
          <li key={b} className="flex gap-2">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />{' '}
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {model.canBuy && (
        <div className="space-y-2" data-testid="pro-offers">
          <div className="flex gap-2">{offerButtons('buy')}</div>
          {comingSoon && (
            <p className="text-xs text-text-secondary">
              Coming soon: buying Mr OneHook Pro isn&rsquo;t open yet.
            </p>
          )}
        </div>
      )}

      {model.subscription && (
        <div
          className="rounded-xl border border-border p-3 space-y-1.5 text-xs"
          data-testid="pro-subscription"
        >
          <p className="font-semibold text-text">{model.subscription.statusLabel}</p>
          {model.subscription.periodLine && (
            <p className="text-text-secondary">{model.subscription.periodLine}</p>
          )}
          {model.subscription.nextChargeLine && (
            <p className="text-text-secondary">{model.subscription.nextChargeLine}</p>
          )}
          {model.subscription.pausedLine && (
            <p className="text-text-secondary">{model.subscription.pausedLine}</p>
          )}
          {model.subscription.refundLine && (
            <p className="text-text-secondary" data-testid="pro-refund">
              {model.subscription.refundLine}
            </p>
          )}
          {model.subscription.canToggleAutoRenew && (
            <button
              type="button"
              role="switch"
              aria-checked={model.subscription.autoRenew}
              disabled={Boolean(busy)}
              onClick={() => {
                const next = !model.subscription!.autoRenew;
                void run('auto_renew', () => setMrOneHookProAutoRenew(next));
              }}
              {...trackProps(PRO, {
                targetId: model.subscription.autoRenew ? 'auto_renew_off' : 'auto_renew_on',
              })}
              className="mt-1 w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 cursor-pointer disabled:opacity-40"
            >
              <span>Auto-renew</span>
              <span
                className={`font-semibold ${model.subscription.autoRenew ? 'text-green-600' : 'text-text-secondary'}`}
              >
                {model.subscription.autoRenew ? 'On' : 'Off'}
              </span>
            </button>
          )}
        </div>
      )}

      {model.keepPro && (
        <div
          className="rounded-xl border border-border p-3 space-y-2 text-xs"
          data-testid="pro-keep"
        >
          <p className="font-semibold text-text">{model.keepPro.title}</p>
          <p className="text-text-secondary">
            Your membership ends on {model.keepPro.endsAtLabel}. Keep Mr OneHook Pro after that:
            nothing is charged now, and the first charge is on {model.keepPro.endsAtLabel}.
          </p>
          <div className="flex gap-2">{offerButtons('keep')}</div>
        </div>
      )}

      {model.scheduled && (
        <div
          className="rounded-xl border border-border p-3 space-y-2 text-xs"
          data-testid="pro-scheduled"
        >
          <p className="font-semibold text-text">Mr OneHook Pro is kept</p>
          <p className="text-text-secondary">{model.scheduled.line}</p>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run('withdraw', withdrawMrOneHookProContinuation)}
            {...trackProps(PRO, { targetId: 'withdraw' })}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold cursor-pointer disabled:opacity-40"
          >
            {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      )}

      {model.usage && (
        <div className="space-y-1.5 text-xs" data-testid="pro-usage">
          <div className="h-1.5 rounded-full bg-border overflow-hidden" aria-hidden="true">
            <div
              className={`h-full ${model.usage.warning ? 'bg-orange-500' : 'bg-accent'}`}
              style={{ width: `${Math.min(100, Math.max(0, model.usage.usedPercent))}%` }}
            />
          </div>
          <p
            className={
              model.usage.warning ? 'text-orange-600 dark:text-orange-400' : 'text-text-secondary'
            }
          >
            {model.usage.line}
          </p>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-xs text-orange-600 dark:text-orange-400">
          {proProblemCopy(problem)}
        </p>
      )}

      {model.notices.length > 0 && (
        <ul className="space-y-2" data-testid="pro-notices">
          {model.notices.map((n) => (
            <li
              key={n.noticeId}
              className="flex items-start gap-2 rounded-xl bg-surface-card border border-border/60 p-3 text-xs"
            >
              <span className="flex-1 text-text">{n.text}</span>
              <button
                type="button"
                onClick={() => void dismissMrOneHookProNotice(n.noticeId)}
                {...trackProps(PRO, { action: 'dismiss', targetId: 'notice' })}
                aria-label="Dismiss"
                className="w-6 h-6 rounded-full flex items-center justify-center text-text/50 hover:bg-black/5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {model.headline === 'FREE' && !model.canBuy && !model.subscription && (
        <p className="text-xs text-text-secondary">
          Mr OneHook Pro can&rsquo;t be bought right now.
        </p>
      )}
      <p className="text-[10px] text-text-muted">
        Mr OneHook Pro is separate from your OneHook membership.
      </p>
    </div>
  );
}
