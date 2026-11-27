/**
 * Profile Hub cards & Mr.OneHook tab content (mirrors iOS `ProfileViewController`,
 * `ProfileMrOneHookTab`, `Wallet.swift`, and Invite flow).
 */
import { useEffect, useState } from 'react';
import { subscriptionTierDisplayName } from 'onehook-api-client/membership';
import {
  Archive,
  Check,
  Copy,
  Flower2,
  Gift,
  HelpCircle,
  Lock,
  MessageCircle,
  Share2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { MrOneHookPlan } from 'onehook-mr-onehook-client';
import { ModalDialog } from '../../components/common/ModalDialog';
import { useOptionalToast } from '../../components/common/Toast';
import { IdentityApi } from '../../api/identity';
import { MatchingApi } from '../../api/matching';
import type { RoseQuota } from '../../api/rest';
import { useAppStore } from '../../store/app-store';
import {
  isWalletBoosting,
  refreshArchives,
  refreshWallet,
  totalRemainingArchives,
  useArchiveStore,
  useWalletStore,
} from '../../store/archive-store';
import { isMatchingOn } from '../../lib/app-mode';
import { openMrOneHookPro, useMrOneHookPro } from '../../store/mr-onehook-pro-store';
import { useMrOneHookPrefs } from '../../lib/mr-onehook-prefs';
import { ANNUAL_DISCOUNT_LABEL, MEMBERSHIP_TIERS, priceLabel, type BillingPeriod } from '../../config/membership.config';
import { SubscriptionTier } from '../../types';
import { WalletSheet } from '../discovery/WalletDialogs';
import { BillingPeriodSwitch, MembershipCompareModal } from './MembershipCompareModal';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

export function WalletTilesCard() {
  const userState = useAppStore((s) => s.userState);
  const matchingOn = isMatchingOn(userState);
  const wallet = useWalletStore((s) => s.wallet);
  const allowance = useArchiveStore((s) => s.list?.allowance);
  const [roses, setRoses] = useState<RoseQuota | null>(null);
  const [walletOpen, setWalletOpen] = useState<'archives' | 'boosts' | 'roses' | null>(null);

  useEffect(() => {
    void refreshWallet();
    if (matchingOn) {
      void refreshArchives();
      void MatchingApi.rosesRemaining()
        .then(setRoses)
        .catch(() => undefined);
    }
  }, [matchingOn]);

  const boosting = isWalletBoosting(wallet);
  const archivesAvailable = totalRemainingArchives(
    allowance ?? { planIncluded: 0, planUsed: 0, purchased: wallet?.archives ?? 0 }
  );
  const totalRoses = (roses?.remaining ?? 0) + (wallet?.roses ?? 0);

  return (
    <>
      <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-3 text-text">
        <h3 className="text-[10px] uppercase tracking-[0.25em] font-black text-accent">
          Your Wallet
        </h3>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setWalletOpen('archives')}
            // TODO(telemetry-parity): switch to UiElement.PROFILE_WALLET_TILE once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for profile.wallet_tile"
            className="p-3 rounded-xl border border-border bg-surface hover:bg-surface-hover text-left space-y-1 transition-colors cursor-pointer"
          >
            <Archive className={`${ICON_SECTION.section.rowIcon} text-accent`} aria-hidden="true" />
            <p className="text-lg font-bold leading-tight">{archivesAvailable}</p>
            <p className="text-[11px] text-text-secondary">Archives</p>
          </button>

          <button
            type="button"
            onClick={() => setWalletOpen('boosts')}
            data-track-exempt="disabled: pending telemetry web parity enablement for profile.wallet_tile"
            className={`p-3 rounded-xl border text-left space-y-1 transition-colors cursor-pointer ${
              boosting ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <Zap className={`${ICON_SECTION.section.rowIcon} text-accent`} aria-hidden="true" />
            <p className="text-lg font-bold leading-tight">{wallet?.boosts ?? 0}</p>
            <p className="text-[11px] text-text-secondary">{boosting ? 'Boosting' : 'Boosts'}</p>
          </button>

          <button
            type="button"
            onClick={() => setWalletOpen('roses')}
            data-track-exempt="disabled: pending telemetry web parity enablement for profile.wallet_tile"
            className="p-3 rounded-xl border border-border bg-surface hover:bg-surface-hover text-left space-y-1 transition-colors cursor-pointer"
          >
            <Flower2 className={`${ICON_SECTION.section.rowIcon} text-rose-500`} aria-hidden="true" />
            <p className="text-lg font-bold leading-tight">{totalRoses}</p>
            <p className="text-[11px] text-text-secondary">Roses</p>
          </button>
        </div>
      </div>

      <WalletSheet
        open={Boolean(walletOpen)}
        initialSection={walletOpen ?? 'boosts'}
        onClose={() => setWalletOpen(null)}
      />
    </>
  );
}

export function InviteFriendCard({ userId, initialCode }: { userId: string; initialCode?: string }) {
  const { showToast } = useOptionalToast();
  const [code, setCode] = useState<string>(initialCode || '');
  const [generating, setGenerating] = useState(false);

  const ensureCode = async (): Promise<string | null> => {
    if (code) return code;
    setGenerating(true);
    try {
      const res = await IdentityApi.generateInvite(userId);
      const next = (res as { code?: string; inviteCode?: string })?.code ?? (res as { inviteCode?: string })?.inviteCode ?? '';
      if (next) setCode(next);
      return next || null;
    } catch {
      showToast('Could not generate an invite code right now.', 'error');
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    const val = await ensureCode();
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      showToast(`Invite code ${val} copied!`, 'success');
    } catch {
      showToast(`Your invite code: ${val}`, 'info');
    }
  };

  const handleShare = async () => {
    const val = await ensureCode();
    if (!val) return;
    const shareText = `Join me on OneHook using my invite code: ${val} (https://onehook.club/redeem)`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Join me on OneHook', text: shareText });
        return;
      } catch {
        /* fallback to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Invite link copied to clipboard.', 'success');
    } catch {
      showToast(`Invite code: ${val}`, 'info');
    }
  };

  return (
    <div className="bg-surface-card border border-border rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap text-text">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <Gift className={ICON_SECTION.header.icon} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text">Invite a friend</h3>
          <p className="text-xs text-text-secondary">
            {code ? `Code: ${code}` : 'OneHook is invite-gated. Share an invite with someone thoughtful.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={generating}
          onClick={() => void handleCopy()}
          // TODO(telemetry-parity): switch to UiElement.PROFILE_INVITE_CODE_COPY once enabled on web.
          data-track-exempt="disabled: pending telemetry web parity enablement for profile.invite_code_copy"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-semibold cursor-pointer"
        >
          <Copy className={ICON_SECTION.section.actionIcon} /> {code ? 'Copy' : generating ? 'Getting…' : 'Get code'}
        </button>
        <button
          type="button"
          disabled={generating}
          onClick={() => void handleShare()}
          // TODO(telemetry-parity): switch to UiElement.PROFILE_INVITE_CODE_SHARE once enabled on web.
          data-track-exempt="disabled: pending telemetry web parity enablement for profile.invite_code_share"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
        >
          <Share2 className={ICON_SECTION.section.actionIcon} /> Share
        </button>
      </div>
    </div>
  );
}

export function MembershipSummaryCard() {
  const userState = useAppStore((s) => s.userState);
  const tierWire = userState?.subscriptionTier ?? SubscriptionTier.MUST;
  const currentMeta = MEMBERSHIP_TIERS.find((t) => t.wire === tierWire) ?? MEMBERSHIP_TIERS[0];
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <>
      <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-4 text-text">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.25em] font-black text-accent block">
              Membership · {subscriptionTierDisplayName(tierWire)}
            </span>
            <h3 className="text-base font-serif italic font-bold text-text">{currentMeta.headline}</h3>
            <p className="text-xs text-text-secondary">
              {priceLabel(currentMeta, period)} · {ANNUAL_DISCOUNT_LABEL}
            </p>
          </div>
          <BillingPeriodSwitch value={period} onChange={setPeriod} />
        </div>

        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          {...trackProps(UiElement.PROFILE_UPGRADE_OPEN)}
          className="w-full py-2.5 px-4 rounded-xl border border-accent/40 text-xs font-semibold text-accent hover:bg-accent/5 transition-colors cursor-pointer"
        >
          Compare plans &amp; refresh membership
        </button>
      </div>

      <MembershipCompareModal open={compareOpen} onClose={() => setCompareOpen(false)} />
    </>
  );
}

export function ProfileMrOneHookTabCard({
  userId,
  onOpenChat,
}: {
  userId: string;
  onOpenChat: () => void;
}) {
  const pro = useMrOneHookPro(userId);
  const [prefs, setPref] = useMrOneHookPrefs(userId);
  const [tourOpen, setTourOpen] = useState(false);
  const isPro = pro.plan === MrOneHookPlan.PRO;

  return (
    <>
      <div className="space-y-6">
        <div className="bg-surface-card border border-border rounded-2xl p-6 space-y-4 text-text">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.25em] font-black text-accent flex items-center gap-1.5">
                <Sparkles className={ICON_SECTION.section.headingIcon} aria-hidden="true" /> Mr.OneHook AI
              </span>
              <h3 className="text-lg font-serif italic font-bold text-text">
                {isPro ? 'Mr OneHook Pro active' : 'Free plan'}
              </h3>
              <p className="text-xs text-text-secondary">
                {isPro
                  ? 'Unlimited messages · 3 saved chats · Photos, PDFs & voice context'
                  : '10 messages per day · 1 saved chat'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenChat}
                // TODO(telemetry-parity): switch to UiElement.PROFILE_MR_ONEHOOK_CHAT_OPEN once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for profile.mr_onehook_chat_open"
                className="h-8 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
              >
                <MessageCircle className={ICON_SECTION.section.actionIcon} /> Open chat
              </button>
              <button
                type="button"
                onClick={() => setTourOpen(true)}
                aria-label="How Mr.OneHook works"
                // TODO(telemetry-parity): switch to UiElement.PROFILE_MR_ONEHOOK_TOUR_OPEN once enabled on web.
                data-track-exempt="disabled: pending telemetry web parity enablement for profile.mr_onehook_tour_open"
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-border hover:bg-surface-hover text-text-secondary cursor-pointer"
              >
                <HelpCircle className={ICON_SECTION.section.rowIcon} />
              </button>
            </div>
          </div>

          {pro.proVisible && (
            <button
              type="button"
              onClick={openMrOneHookPro}
              {...trackProps(UiElement.PROFILE_MR_ONEHOOK_PRO_OPEN)}
              className="w-full py-2.5 rounded-xl border border-accent/40 text-xs font-semibold text-accent hover:bg-accent/5 cursor-pointer"
            >
              {isPro ? 'Manage Mr OneHook Pro' : 'Upgrade to Mr OneHook Pro'}
            </button>
          )}
        </div>

        {/* On-device preferences */}
        <div className="bg-surface-card border border-border rounded-2xl p-6 space-y-4 text-text">
          <h4 className="text-[10px] uppercase tracking-[0.25em] font-black text-accent">
            On-Device Controls
          </h4>

          <label
            // TODO(telemetry-parity): switch to UiElement.PROFILE_MR_ONEHOOK_SETTING_TOGGLE once enabled on web.
            data-track-exempt="disabled: pending telemetry web parity enablement for profile.mr_onehook_setting_toggle"
            className="flex items-start justify-between gap-4 cursor-pointer"
          >
            <div>
              <span className="text-sm font-medium block">Offer &ldquo;Ask Mr.OneHook&rdquo; in message menus</span>
              <span className="text-xs text-text-secondary">
                Show a shortcut to select messages or files right inside match conversations.
              </span>
            </div>
            <input
              type="checkbox"
              checked={prefs.asksInMessageMenus}
              onChange={(e) => setPref('asksInMessageMenus', e.target.checked)}
              className="w-5 h-5 accent-accent shrink-0 mt-0.5"
            />
          </label>

          <label
            data-track-exempt="disabled: pending telemetry web parity enablement for profile.mr_onehook_setting_toggle"
            className="flex items-start justify-between gap-4 pt-3 border-t border-border cursor-pointer"
          >
            <div>
              <span className="text-sm font-medium block">Search encrypted chats on request</span>
              <span className="text-xs text-text-secondary">
                When off, Mr.OneHook won&rsquo;t ask to inspect local excerpts even when discussing a connection.
              </span>
            </div>
            <input
              type="checkbox"
              checked={prefs.answersContextRequests}
              onChange={(e) => setPref('answersContextRequests', e.target.checked)}
              className="w-5 h-5 accent-accent shrink-0 mt-0.5"
            />
          </label>
        </div>

        {/* Privacy explanation */}
        <div className="bg-surface border border-border rounded-2xl p-5 flex items-start gap-3 text-xs text-text-secondary leading-relaxed">
          <Lock className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Match conversations are end-to-end encrypted on your devices. Excerpts only reach Mr.OneHook when you review and confirm each message, and are never stored in the conversation.
          </p>
        </div>
      </div>

      <ModalDialog open={tourOpen} onClose={() => setTourOpen(false)} label="How Mr.OneHook works" className="max-w-md w-full">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-serif italic font-bold text-text flex items-center gap-2">
              <Sparkles className={`${ICON_SECTION.modalHeader.icon} text-accent`} /> How Mr.OneHook works
            </h3>
            <button
              type="button"
              onClick={() => setTourOpen(false)}
              aria-label="Close"
              {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
              className={ICON_SECTION.modalHeader.button}
            >
              <X className={ICON_SECTION.modalHeader.icon} />
            </button>
          </div>
          <ul className="space-y-3 text-xs text-text-secondary">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>Ask product questions, get conversation openers, or bounce date ideas anytime.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>In match-scoped mode, you approve every message or file before it leaves this device.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>Respect peers&rsquo; privacy: if a match disables Mr.OneHook context sharing, only your side can be referenced.</span>
            </li>
          </ul>
        </div>
      </ModalDialog>
    </>
  );
}
