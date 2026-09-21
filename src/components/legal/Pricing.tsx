import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Minus, Sparkles, Smartphone } from 'lucide-react';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import {
  ANNUAL_DISCOUNT_LABEL,
  APP_DOWNLOAD_URL,
  FEATURE_GROUPS,
  MEMBERSHIP_TIERS,
  priceLabel,
  type BillingPeriod,
  type FeatureRow,
  type FeatureValue,
  type MembershipTier,
} from '../../config/membership.config';

/** Renders a boolean as a check / dash, or a string value verbatim. */
function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center text-status-hooked" aria-label="Included">
        <Check className="w-4 h-4" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center opacity-30" aria-label="Not included">
        <Minus className="w-4 h-4" />
      </span>
    );
  }
  return <span className="text-sm">{value}</span>;
}

function BillingToggle({
  period,
  onChange,
}: {
  period: BillingPeriod;
  onChange: (p: BillingPeriod) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-white">
      {(['monthly', 'annual'] as const).map((p) => {
        const active = period === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(p)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-[0.15em] transition-colors ${
              active ? 'bg-accent text-white' : 'opacity-60 hover:opacity-100'
            }`}
          >
            {p === 'monthly' ? 'Monthly' : 'Annual'}
          </button>
        );
      })}
      <span className="hidden sm:inline-block ml-1 mr-2 text-[10px] font-bold uppercase tracking-[0.15em] text-status-hooked">
        {ANNUAL_DISCOUNT_LABEL}
      </span>
    </div>
  );
}

function DownloadCta({ tier, className = '' }: { tier: MembershipTier; className?: string }) {
  const primary = tier.mostPopular;
  return (
    <a
      href={APP_DOWNLOAD_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-opacity hover:opacity-90 ${
        primary
          ? 'bg-accent text-white'
          : 'border border-border bg-white text-text'
      } ${className}`}
    >
      <Smartphone className="w-3.5 h-3.5" /> Get the app
    </a>
  );
}

function TierCard({ tier, period }: { key?: string; tier: MembershipTier; period: BillingPeriod }) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 bg-white ${
        tier.mostPopular ? 'border-accent shadow-lg' : 'border-border'
      }`}
    >
      {tier.mostPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent text-white text-[10px] font-black uppercase tracking-[0.2em]">
          <Sparkles className="w-3 h-3" /> Most popular
        </span>
      )}
      <h3 className="text-2xl font-serif italic">{tier.displayName}</h3>
      <p className="mt-1 text-sm opacity-60 min-h-[2.5rem]">{tier.tagline}</p>
      <div className="mt-4">
        <span className="text-3xl font-bold tracking-tight">{priceLabel(tier, period)}</span>
      </div>
      <p className="mt-2 text-xs opacity-50">
        {tier.maxConnections === 1
          ? 'One connection at a time'
          : `Up to ${tier.maxConnections} connections at once`}
      </p>
      <div className="mt-6">
        <DownloadCta tier={tier} />
      </div>
    </div>
  );
}

/** Mobile-only: one stacked card per tier listing every feature value. */
function StackedTierFeatures({ tier }: { key?: string; tier: MembershipTier }) {
  return (
    <div
      className={`rounded-2xl border p-6 bg-white ${
        tier.mostPopular ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-serif italic">{tier.displayName}</h3>
        {tier.mostPopular && (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-accent">
            <Sparkles className="w-3 h-3" /> Popular
          </span>
        )}
      </div>
      <div className="mt-4 space-y-5">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] opacity-40 mb-2">
              {group.title}
            </h4>
            <ul className="space-y-2">
              {group.rows.map((row: FeatureRow) => (
                <li key={row.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="opacity-70">{row.label}</span>
                  <span className="shrink-0 font-medium">
                    <FeatureCell value={row.values[tier.wire]} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      {/* Hero */}
      <section className="py-16 px-6 bg-gradient-to-b from-bg to-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto text-center"
        >
          <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight mb-6">
            Memberships
          </h1>
          <p className="text-lg opacity-60 max-w-2xl mx-auto">
            Messaging is free forever — keep OneHook as your everyday encrypted messenger.
            Paid tiers add discovery reach for when you&apos;re actively dating. Only Infinity
            lets you hold more than one connection at a time.
          </p>
          <div className="mt-8 flex justify-center">
            <BillingToggle period={period} onChange={setPeriod} />
          </div>
        </motion.div>
      </section>

      {/* Tier cards */}
      <section className="px-6 pb-4">
        <div className="max-w-5xl mx-auto grid gap-6 sm:grid-cols-3">
          {MEMBERSHIP_TIERS.map((tier) => (
            <TierCard key={tier.wire} tier={tier} period={period} />
          ))}
        </div>
      </section>

      {/* Comparison table (desktop / tablet) */}
      <section className="px-6 py-16 hidden sm:block">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-serif italic mb-8 text-center">Compare every feature</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 pr-4 text-sm font-bold uppercase tracking-[0.15em] opacity-60">
                    Feature
                  </th>
                  {MEMBERSHIP_TIERS.map((tier) => (
                    <th key={tier.wire} className="py-4 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg font-serif italic">{tier.displayName}</span>
                        {tier.mostPopular && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.15em] text-accent">
                            <Sparkles className="w-2.5 h-2.5" /> Popular
                          </span>
                        )}
                        <span className="text-xs opacity-50">{priceLabel(tier, period)}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group) => (
                  <FeatureGroupRows key={group.title} title={group.title} rows={group.rows} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-6 pr-4" />
                  {MEMBERSHIP_TIERS.map((tier) => (
                    <td key={tier.wire} className="py-6 px-4">
                      <DownloadCta tier={tier} />
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* Comparison stacked cards (mobile) */}
      <section className="px-6 py-12 sm:hidden">
        <h2 className="text-2xl font-serif italic mb-6 text-center">Compare every feature</h2>
        <div className="space-y-6">
          {MEMBERSHIP_TIERS.map((tier) => (
            <StackedTierFeatures key={tier.wire} tier={tier} />
          ))}
        </div>
      </section>

      {/* Honest note */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-bg p-6 text-center">
          <p className="text-sm opacity-70 leading-relaxed">
            Memberships are applied to your OneHook account. There is no checkout on this page —
            manage your membership from inside the app. Prices are in Indian Rupees (₹).
          </p>
          <div className="mt-5 flex justify-center">
            <a
              href={APP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-opacity"
            >
              <Smartphone className="w-3.5 h-3.5" /> Get the app
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/** A titled group of comparison rows within the desktop table. */
function FeatureGroupRows({ title, rows }: { key?: string; title: string; rows: readonly FeatureRow[] }) {
  return (
    <>
      <tr className="bg-bg">
        <td
          colSpan={MEMBERSHIP_TIERS.length + 1}
          className="py-3 pr-4 pl-0 text-[11px] font-bold uppercase tracking-[0.15em] opacity-40"
        >
          {title}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-border">
          <td className="py-3 pr-4 text-sm opacity-70">{row.label}</td>
          {MEMBERSHIP_TIERS.map((tier) => (
            <td key={tier.wire} className="py-3 px-4 text-center">
              <FeatureCell value={row.values[tier.wire]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
