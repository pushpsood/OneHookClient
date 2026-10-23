import { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Minus, Sparkles, Smartphone } from 'lucide-react';
import { SiteHeader } from '../common/SiteHeader';
import { SiteFooter } from '../common/SiteFooter';
import { Seo } from '../common/Seo';
import { ROUTE_SEO } from '../../config/seo-routes';
import { hideMrOneHook } from '../Chatbot/ChatbotWidget';
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
import { UiElement, trackProps } from '../../lib/analytics/analytics';

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
            {...trackProps(UiElement.LANDING_PRICING_PERIOD_SELECT)}
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
      {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
      className={`inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-opacity hover:opacity-90 ${
        primary
          ? 'border border-accent bg-accent text-white'
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
      // On sm+ each card is a subgrid spanning the parent's 8 shared rows, so the title, tagline,
      // price, headline, list and button sit at exactly the same height in all three cards.
      className={`relative flex flex-col rounded-2xl border p-6 bg-white sm:grid sm:row-span-8 sm:grid-rows-subgrid ${
        tier.mostPopular ? 'border-accent shadow-lg' : 'border-border'
      }`}
    >
      {tier.mostPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent text-white text-[10px] font-black uppercase tracking-[0.2em]">
          <Sparkles className="w-3 h-3" /> Most popular
        </span>
      )}
      <h3 className="text-2xl font-serif italic">{tier.displayName}</h3>
      <p className="mt-1 text-sm opacity-60">{tier.tagline}</p>
      <div className="mt-4">
        <span className="text-3xl font-bold tracking-tight">{priceLabel(tier, period)}</span>
      </div>
      <p className="mt-2 text-xs opacity-50">
        {tier.maxConnections === 1
          ? 'One connection at a time'
          : `Up to ${tier.maxConnections} connections at once`}
      </p>

      {/* The headline reason, then ONLY what this tier adds. Higher tiers say "Everything in X, plus"
          rather than repeating the lower tier's list. */}
      <p className="mt-5 text-sm font-bold">{tier.headline}</p>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-accent">
        {tier.inheritsFrom ? `Everything in ${tier.inheritsFrom}, plus` : "What's included"}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm opacity-70">
        {tier.adds.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 self-end">
        <DownloadCta tier={tier} />
      </div>
    </div>
  );
}

/** Mobile-only: one stacked card per tier listing every feature value. */
/**
 * Mobile comparison: the tiers stay side by side as three columns (with a header that sticks under
 * the site header while you scroll), and each feature name gets its own full-width line above its
 * three values — so every row can be compared at a glance even on a narrow phone.
 */
function MobileCompare({ period }: { period: BillingPeriod }) {
  const cols = { gridTemplateColumns: `repeat(${MEMBERSHIP_TIERS.length}, minmax(0, 1fr))` };
  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="sticky top-[68px] z-10 grid rounded-t-2xl border-b border-border bg-white/95 backdrop-blur" style={cols}>
        {MEMBERSHIP_TIERS.map((tier) => (
          <div
            key={tier.wire}
            className={`flex flex-col items-center gap-0.5 px-1 py-3 text-center ${tier.mostPopular ? 'bg-accent/5' : ''}`}
          >
            <span className="text-base font-serif italic leading-tight">{tier.displayName}</span>
            {tier.mostPopular && (
              <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.15em] text-accent">
                <Sparkles className="h-2.5 w-2.5" /> Popular
              </span>
            )}
            <span className="text-[10px] opacity-50">{priceLabel(tier, period)}</span>
          </div>
        ))}
      </div>

      {FEATURE_GROUPS.map((group) => (
        <div key={group.title}>
          <h4 className="block w-full border-b border-border bg-black/[0.03] px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-black/50">{group.title}</h4>
          <ul>
            {group.rows.map((row: FeatureRow) => (
              <li key={row.label} className="border-b border-border px-3 pb-2.5 pt-3 last:border-b-0">
                <p className="mb-2 text-center text-xs opacity-70">{row.label}</p>
                <div className="grid text-[13px] font-medium leading-snug" style={cols}>
                  {MEMBERSHIP_TIERS.map((tier) => (
                    <div key={tier.wire} className="flex justify-center text-center">
                      <FeatureCell value={row.values[tier.wire]} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

    </div>
  );
}

export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  return (
    <div className="min-h-screen bg-white">
      <Seo {...ROUTE_SEO['/pricing']} path="/pricing" />
      <SiteHeader pageTitle="Pricing" />

      {/* Hero */}
      <section {...hideMrOneHook} className="py-16 px-6 bg-gradient-to-b from-bg to-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto text-center"
        >
          <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight mb-6">
            Memberships
          </h1>
          <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-accent/25 bg-accent/5 px-5 py-3 text-sm text-accent">
            <p className="font-semibold">Every feature of the OneHook Messenger is free, forever, on every plan.</p>
            <Link
              to="/messenger"
              {...trackProps(UiElement.LANDING_NAV_LINK, { value: 'messenger' })}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.2em] underline-offset-4 hover:underline"
            >
              Know more <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-2 text-[11px] opacity-50">Mr OneHook, the AI helper, gives 10 messages a day on the free plan.</p>
          <p className="text-base opacity-60 max-w-2xl mx-auto mt-5">
            Paid tiers add discovery reach for when you&apos;re actively dating. Only{' '}
            {MEMBERSHIP_TIERS.filter((t) => t.maxConnections > 1).map((t) => t.displayName).join(' and ')}{' '}
            lets you hold more than one connection at a time.
          </p>
          <div className="mt-8 flex justify-center">
            <BillingToggle period={period} onChange={setPeriod} />
          </div>
        </motion.div>
      </section>

      {/* Tier cards */}
      <section className="px-6 pb-4">
        <div className="max-w-5xl mx-auto grid gap-6 sm:grid-cols-3 sm:gap-y-0">
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
          {/* Decode the ∞ used in the value cells (narrow columns cannot fit the word). */}
          <p className="mt-4 text-xs italic opacity-50 text-center">∞ means unlimited</p>
        </div>
      </section>

      {/* Comparison (mobile): tiers side by side, one feature per row */}
      <section className="px-4 py-12 sm:hidden">
        <h2 className="text-2xl font-serif italic mb-6 text-center">Compare every feature</h2>
        <MobileCompare period={period} />
        <p className="mt-6 text-xs italic opacity-50 text-center">∞ means unlimited</p>
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
              {...trackProps(UiElement.LANDING_OPEN_IN_APP)}
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
