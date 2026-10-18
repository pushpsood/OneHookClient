import { lazy, Suspense, type ReactNode } from 'react';
import { subscriptionTierDisplayName } from 'onehook-api-client/membership';
import { MOST_POPULAR_TIER, PAID_TIER_NAMES } from '../../config/membership.config';
import { motion } from 'motion/react';
import { SlidersHorizontal, UserCog, Sparkles, LogOut, Check } from 'lucide-react';
import type { UserProfile } from '../../types';
import { isPaidTier, useAppStore } from '../../store/app-store';
import { AppearanceCard } from '../../components/profile/AppearanceCard';
import { AccountSettingsCard } from '../../components/profile/AccountSettingsCard';
import { DeviceManagementCard } from '../../components/profile/DeviceManagementCard';
import { SetPasswordCard } from '../../components/profile/SetPasswordCard';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

const LivenessVerification = lazy(() =>
  import('../../components/profile/LivenessVerification').then((module) => ({
    default: module.LivenessVerification,
  }))
);

/**
 * iOS-style Settings surface. Everything that is NOT part of a member's public-facing profile lives
 * here, grouped into three sections — General, Account, and OneHook AI — mirroring the mobile app.
 * The Profile tab is kept strictly to profile content (photos, prompts, basics, lifestyle & match
 * preferences); this view owns appearance, account/security, membership and AI personalization.
 */
export function SettingsView({
  user,
  onUpgrade,
  upgrading,
  onVerified,
  onLogout,
}: {
  user: UserProfile;
  onUpgrade?: () => void;
  upgrading?: boolean;
  onVerified?: () => void;
  onLogout?: () => void;
}) {
  const { userState } = useAppStore();
  const paid = useAppStore(isPaidTier);
  const tierLabel = userState?.subscriptionTier
    ? subscriptionTierDisplayName(userState.subscriptionTier)
    : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-12 pb-24"
    >
      <header className="pt-4 space-y-1">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <p className="text-sm text-text-secondary">
          Manage how OneHook looks, your account and security, and your OneHook AI experience.
        </p>
      </header>

      {/* ── General ─────────────────────────────────────────────── */}
      <SettingsSection
        icon={<SlidersHorizontal className="w-4 h-4" />}
        title="General"
        description="Appearance and app-wide preferences."
      >
        <AppearanceCard />
      </SettingsSection>

      {/* ── Account ─────────────────────────────────────────────── */}
      <SettingsSection
        icon={<UserCog className="w-4 h-4" />}
        title="Account"
        description="Membership, sign-in methods, security, devices, and verification."
      >
        {/* Membership */}
        <div className="bg-surface-card border border-border p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-text">Membership</h3>
              <p className="text-xs text-text-secondary">
                Your current plan determines connections, read receipts, and more.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-text-secondary">
              {tierLabel}
            </span>
          </div>
          {userState != null && !paid && (
            <button
              onClick={onUpgrade}
              disabled={upgrading}
              {...trackProps(UiElement.PROFILE_UPGRADE_OPEN)}
              className="w-full py-4 bg-accent text-bg text-[11px] font-black uppercase tracking-[0.4em] hover:scale-[1.01] transition-all disabled:opacity-40 rounded-xl"
            >
              {upgrading ? 'Upgrading…' : `Upgrade to ${MOST_POPULAR_TIER.displayName}`}
            </button>
          )}
        </div>

        <AccountSettingsCard />
        <SetPasswordCard />
        <DeviceManagementCard />

        <Suspense fallback={null}>
          <LivenessVerification
            userId={user.id}
            verified={Boolean(user.verified)}
            onVerified={onVerified}
          />
        </Suspense>

        {/* Sign out */}
        {onLogout && (
          <div className="bg-surface-card border border-border p-6 rounded-2xl">
            <button
              onClick={onLogout}
              {...trackProps(UiElement.SETTINGS_SIGN_OUT)}
              className="w-full py-3 flex items-center justify-center gap-2 border border-border rounded-xl text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        )}
      </SettingsSection>

      {/* ── OneHook AI ──────────────────────────────────────────── */}
      <SettingsSection
        icon={<Sparkles className="w-4 h-4" />}
        title="OneHook AI"
        description="Mr OneHook, your AI companion, and how OneHook personalizes your experience."
      >
        <div className="bg-surface-card border border-border p-6 rounded-2xl space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <Sparkles className="w-4 h-4 text-accent" /> Mr OneHook
          </div>
          <p className="text-xs text-text-secondary leading-relaxed max-w-md">
            Mr OneHook is your AI companion. He helps you understand your connections and get more
            out of OneHook. Full access to the AI companion is included with {PAID_TIER_NAMES}.
          </p>
          <div className="flex items-center gap-2 text-xs">
            {paid ? (
              <span className="inline-flex items-center gap-1.5 text-green-600 font-semibold">
                <Check className="w-3.5 h-3.5" /> Included with your plan
              </span>
            ) : (
              <span className="text-text-secondary">Upgrade to {MOST_POPULAR_TIER.displayName} for full access.</span>
            )}
          </div>

          <div className="pt-4 border-t border-border space-y-2">
            <h3 className="text-sm font-semibold text-text">Personalization</h3>
            <p className="text-xs text-text-secondary leading-relaxed max-w-md">
              OneHook AI uses your in-app activity to personalize your matches. This follows your
              app privacy choices — manage analytics consent to control how your activity is used.
            </p>
          </div>
        </div>
      </SettingsSection>
    </motion.div>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        <span className="w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
          {icon}
        </span>
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.3em] font-black text-accent">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
