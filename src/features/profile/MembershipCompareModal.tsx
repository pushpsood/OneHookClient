/**
 * Membership comparison modal & Monthly/Yearly billing switch (mirrors iOS
 * `MembershipComparisonViewController.swift`, `BillingPeriodSwitch.swift`, and `PlanPricing.swift`).
 */
import { Fragment, useState } from 'react';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { useOptionalToast } from '../../components/common/Toast';
import {
  MEMBERSHIP_TIERS,
  FEATURE_GROUPS,
  annualSavingPercent,
  priceLabel,
  type BillingPeriod,
} from '../../config/membership.config';
import { useAppStore } from '../../store/app-store';
import { refreshAuthAfterTierChange } from '../../store/archive-store';
import { loadMrOneHookPro, openMrOneHookPro, useMrOneHookProStore } from '../../store/mr-onehook-pro-store';
import { SubscriptionTier } from '../../types';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

export function BillingPeriodSwitch({
  value,
  onChange,
  saveLabel,
}: {
  value: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
  saveLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Billing period"
      className="inline-flex items-center p-1 rounded-full border border-border bg-surface"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'monthly'}
        onClick={() => onChange('monthly')}
        data-track-exempt="disabled: pending telemetry web parity enablement for paywall.billing_period"
        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
          value === 'monthly' ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text'
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'annual'}
        onClick={() => onChange('annual')}
        data-track-exempt="disabled: pending telemetry web parity enablement for paywall.billing_period"
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
          value === 'annual' ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text'
        }`}
      >
        <span>Yearly</span>
        {saveLabel && (
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              value === 'annual' ? 'bg-bg text-accent' : 'bg-accent/15 text-accent'
            }`}
          >
            {saveLabel}
          </span>
        )}
      </button>
    </div>
  );
}

export function MembershipCompareModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useOptionalToast();
  const userState = useAppStore((s) => s.userState);
  const currentUser = useAppStore((s) => s.currentUser);
  const proVisible = useMrOneHookProStore((s) => s.availability === 'ready');
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [refreshing, setRefreshing] = useState(false);

  const currentTier = userState?.subscriptionTier ?? SubscriptionTier.MUST;
  const maxSaving = Math.max(...MEMBERSHIP_TIERS.map(annualSavingPercent));

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAuthAfterTierChange();
      if (currentUser?.id) await loadMrOneHookPro(currentUser.id, true);
      showToast('Membership status refreshed.', 'success');
    } catch {
      showToast('Could not refresh membership right now.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="membership-compare-title" className="max-w-3xl w-full">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div>
          <h2 id="membership-compare-title" className="text-lg font-serif italic font-bold text-text">
            OneHook Plans
          </h2>
          <p className="text-xs text-text-secondary">
            End-to-end encrypted messaging stays free forever on every tier.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close membership comparison"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>

      <div className="p-5 space-y-6 max-h-[82vh] overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BillingPeriodSwitch
            value={period}
            onChange={setPeriod}
            saveLabel={maxSaving > 0 ? `SAVE ${maxSaving}%` : undefined}
          />
          <div className="flex items-center gap-2">
            {proVisible && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openMrOneHookPro();
                }}
                {...trackProps(UiElement.PROFILE_MR_ONEHOOK_PRO_OPEN)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-accent/40 text-xs font-semibold text-accent hover:bg-accent/5 cursor-pointer"
              >
                <Sparkles className={ICON_SECTION.toolbar.pillIcon} /> Mr.OneHook Pro
              </button>
            )}
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
              // TODO(telemetry-parity): switch to UiElement.PAYWALL_RESTORE once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for paywall.restore"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-semibold text-text disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`${ICON_SECTION.toolbar.pillIcon} ${refreshing ? 'animate-spin' : ''}`} />
              Refresh my membership
            </button>
          </div>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MEMBERSHIP_TIERS.map((tier) => {
            const isCurrent = tier.wire === currentTier;
            const save = period === 'annual' ? annualSavingPercent(tier) : 0;
            return (
              <div
                key={tier.wire}
                className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                  isCurrent
                    ? 'border-accent bg-accent/5'
                    : tier.mostPopular
                      ? 'border-accent/40 bg-surface'
                      : 'border-border bg-surface'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-text">{tier.displayName}</h3>
                    {isCurrent ? (
                      <span className="px-2 py-0.5 rounded-full bg-accent text-bg text-[10px] font-bold uppercase tracking-wider">
                        Current
                      </span>
                    ) : tier.mostPopular ? (
                      <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p className="text-lg font-serif italic font-bold text-text">
                    {priceLabel(tier, period)}
                    {save > 0 && (
                      <span className="ml-2 text-xs font-sans font-semibold text-accent">
                        ({save}% off)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-secondary leading-snug">{tier.headline}</p>
                </div>

                <ul className="space-y-1.5 text-xs text-text-secondary">
                  {tier.adds.slice(0, 5).map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Comparison Table */}
        <div className="border border-border rounded-2xl overflow-hidden bg-surface">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-bg/60">
                <th className="p-3 font-semibold text-text-secondary">Feature</th>
                {MEMBERSHIP_TIERS.map((t) => (
                  <th key={t.wire} className="p-3 font-bold text-text text-center">
                    {t.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {FEATURE_GROUPS.map((group) => (
                <Fragment key={group.title}>
                  <tr className="bg-bg/40">
                    <td
                      colSpan={4}
                      className="px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-accent"
                    >
                      {group.title}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="p-3 text-text">{row.label}</td>
                      {MEMBERSHIP_TIERS.map((t) => {
                        const val = row.values[t.wire];
                        return (
                          <td key={t.wire} className="p-3 text-center text-text-secondary font-medium">
                            {val === true ? (
                              <Check className="w-4 h-4 text-accent mx-auto" aria-label="Included" />
                            ) : val === false ? (
                              <span aria-label="Not included" className="opacity-35">
                                —
                              </span>
                            ) : (
                              val
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-text-muted text-center">
          Subscriptions purchased through the OneHook iOS or Android app sync automatically to your account when signed in here.
        </p>
      </div>
    </ModalDialog>
  );
}
