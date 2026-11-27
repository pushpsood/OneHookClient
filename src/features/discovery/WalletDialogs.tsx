/**
 * Boost, Wallet & Pending Notice modals for Discovery & Profile (mirrors iOS `BoostSheet.swift`,
 * `WalletViewController.swift`, and `PendingNoticeSheet.swift`).
 */
import { useEffect, useState } from 'react';
import { Archive, BellRing, Flame, Flower2, Sparkles, X, Zap } from 'lucide-react';
import { ModalDialog } from '../../components/common/ModalDialog';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useToast } from '../../components/common/Toast';
import { MatchingApi } from '../../api/matching';
import type { RoseQuota } from '../../api/rest';
import {
  isWalletBoosting,
  refreshWallet,
  startBoostFromWallet,
  totalRemainingArchives,
  useArchiveStore,
  useWalletStore,
} from '../../store/archive-store';
import { useAppStore } from '../../store/app-store';
import { isMatchingOn } from '../../lib/app-mode';
import { totalPendingCount } from '../../lib/hook-forming-guard';
import { WalletProductKind } from '../../types';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';

function formatCountdown(endsAtSec: number, nowMs: number): string {
  const remainingSec = Math.max(0, Math.floor((endsAtSec * 1000 - nowMs) / 1000));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function BoostHeaderPill({ onOpen }: { onOpen: () => void }) {
  const wallet = useWalletStore((s) => s.wallet);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const boosting = isWalletBoosting(wallet, nowMs);

  useEffect(() => {
    if (!boosting) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [boosting]);

  return (
    <button
      type="button"
      onClick={onOpen}
      // TODO(telemetry-parity): switch to UiElement.DISCOVER_BOOST_OPEN once enabled on web.
      data-track-exempt="disabled: pending telemetry web parity enablement for discover.boost_open"
      className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
        boosting
          ? 'bg-accent text-bg border-accent shadow-sm'
          : 'bg-surface border-border text-text hover:bg-surface-hover'
      }`}
    >
      <Zap className={ICON_SECTION.toolbar.pillIcon} aria-hidden="true" />
      {boosting && wallet?.boost ? (
        <span className="tabular-nums">
          {wallet.boost.multiplier.toFixed(1)}x · {formatCountdown(wallet.boost.endsAt, nowMs)}
        </span>
      ) : (
        <span>
          Boost{wallet && wallet.boosts > 0 ? ` (${wallet.boosts})` : ''}
        </span>
      )}
    </button>
  );
}

export function BoostDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const wallet = useWalletStore((s) => s.wallet);
  const loading = useWalletStore((s) => s.loading);
  const boosting = useWalletStore((s) => s.boosting);
  const [count, setCount] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (open) {
      void refreshWallet();
      setCount(1);
    }
  }, [open]);

  const activeBoost = isWalletBoosting(wallet, nowMs) ? wallet?.boost : undefined;

  useEffect(() => {
    if (!open || !activeBoost) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, activeBoost]);

  const available = wallet?.boosts ?? 0;
  const maxStack = Math.min(8, Math.max(1, available));
  const boostProducts = (wallet?.products ?? []).filter((p) => p.kind === WalletProductKind.BOOST);

  const handleStart = async () => {
    try {
      await startBoostFromWallet(count);
      showToast('Boost activated! Your profile reach is amplified.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start boost.', 'error');
    }
  };

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="boost-dialog-title" className="max-w-md w-full">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 id="boost-dialog-title" className="text-base font-serif italic font-bold text-text flex items-center gap-2">
          <Zap className={`${ICON_SECTION.modalHeader.icon} text-accent`} aria-hidden="true" /> Boost your visibility
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close boost dialog"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {loading && !wallet ? (
          <div className="py-8 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <>
            {activeBoost && (
              <div className="p-4 rounded-2xl bg-accent/10 border border-accent/30 space-y-1 text-center">
                <p className="text-[11px] uppercase tracking-widest font-bold text-accent flex items-center justify-center gap-1.5">
                  <Flame className={ICON_SECTION.section.actionIcon} /> Boosting live
                </p>
                <p className="text-2xl font-bold text-text tabular-nums">
                  {formatCountdown(activeBoost.endsAt, nowMs)}
                </p>
                <p className="text-xs text-text-secondary">
                  {activeBoost.multiplier.toFixed(1)}x reach ({activeBoost.count} boost{activeBoost.count === 1 ? '' : 's'} active)
                </p>
              </div>
            )}

            <div className="p-4 rounded-2xl border border-border bg-surface space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Available boosts</span>
                <span className="text-sm font-bold text-text">{available}</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Each boost puts your profile higher in discovery for 30 minutes. Stack multiple boosts to extend duration and increase your reach multiplier.
              </p>

              {available > 0 ? (
                <div className="space-y-3 pt-1">
                  {available > 1 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-text-secondary block">
                        Boosts to use ({count} · {count * 30} min)
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: maxStack }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setCount(n)}
                            aria-pressed={count === n}
                            // TODO(telemetry-parity): switch to UiElement.DISCOVER_BOOST_START once enabled on web.
                            data-track-exempt="disabled: pending telemetry web parity enablement for discover.boost_start"
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                              count === n
                                ? 'bg-accent text-bg border-accent'
                                : 'bg-bg border-border text-text'
                            }`}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={boosting}
                    onClick={() => void handleStart()}
                    // TODO(telemetry-parity): switch to UiElement.DISCOVER_BOOST_START once enabled on web.
                    data-track-exempt="disabled: pending telemetry web parity enablement for discover.boost_start"
                    className="w-full py-3 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
                  >
                    {boosting
                      ? 'Starting boost…'
                      : activeBoost
                        ? `Extend boost (+${count})`
                        : `Start ${count} boost${count === 1 ? '' : 's'} now`}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1">
                  {boostProducts.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {boostProducts.map((p) => (
                        <div key={p.productId} className="p-2.5 rounded-xl border border-border bg-bg text-center">
                          <p className="text-sm font-bold text-text">{p.quantity}</p>
                          <p className="text-[10px] text-text-secondary">boost{p.quantity === 1 ? '' : 's'}</p>
                          <p className="text-xs font-semibold text-accent mt-1">{p.displayPrice}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Boost packs are purchased through the OneHook iOS/Android app and sync directly to your account balance.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ModalDialog>
  );
}

export function WalletSheet({
  open,
  onClose,
  initialSection = 'boosts',
}: {
  open: boolean;
  onClose: () => void;
  initialSection?: 'archives' | 'boosts' | 'roses';
}) {
  const [section, setSection] = useState<'archives' | 'boosts' | 'roses'>(initialSection);
  const wallet = useWalletStore((s) => s.wallet);
  const loading = useWalletStore((s) => s.loading);
  const archiveAllowance = useArchiveStore((s) => s.list?.allowance);
  const [roseQuota, setRoseQuota] = useState<RoseQuota | null>(null);
  const [boostOpen, setBoostOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    void refreshWallet();
    const state = useAppStore.getState().userState;
    if (isMatchingOn(state)) {
      void MatchingApi.rosesRemaining()
        .then(setRoseQuota)
        .catch(() => undefined);
    }
  }, [open, initialSection]);

  const kindMap = {
    boosts: WalletProductKind.BOOST,
    roses: WalletProductKind.ROSE,
    archives: WalletProductKind.ARCHIVE,
  } as const;
  const products = (wallet?.products ?? []).filter((p) => p.kind === kindMap[section]);

  return (
    <>
      <ModalDialog open={open} onClose={onClose} labelledBy="wallet-dialog-title" className="max-w-md w-full">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 id="wallet-dialog-title" className="text-base font-serif italic font-bold text-text">
            Wallet &amp; Credits
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet"
            {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
            className={ICON_SECTION.modalHeader.button}
          >
            <X className={ICON_SECTION.modalHeader.icon} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div role="tablist" aria-label="Wallet credits" className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-surface border border-border">
            <button
              type="button"
              role="tab"
              aria-selected={section === 'boosts'}
              onClick={() => setSection('boosts')}
              // TODO(telemetry-parity): switch to UiElement.PAYWALL_WALLET_OPEN once enabled on web.
              data-track-exempt="disabled: pending telemetry web parity enablement for paywall.wallet_open"
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                section === 'boosts' ? 'bg-accent text-bg' : 'text-text-secondary'
              }`}
            >
              <Zap className={ICON_SECTION.toolbar.pillIcon} /> Boosts
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'roses'}
              onClick={() => setSection('roses')}
              data-track-exempt="disabled: pending telemetry web parity enablement for paywall.wallet_open"
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                section === 'roses' ? 'bg-accent text-bg' : 'text-text-secondary'
              }`}
            >
              <Flower2 className={ICON_SECTION.toolbar.pillIcon} /> Roses
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'archives'}
              onClick={() => setSection('archives')}
              data-track-exempt="disabled: pending telemetry web parity enablement for paywall.wallet_open"
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                section === 'archives' ? 'bg-accent text-bg' : 'text-text-secondary'
              }`}
            >
              <Archive className={ICON_SECTION.toolbar.pillIcon} /> Archives
            </button>
          </div>

          {loading && !wallet ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="space-y-4">
              {section === 'boosts' && (
                <div className="p-4 rounded-2xl border border-border bg-surface space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Available boosts</span>
                    <span className="text-lg font-bold text-text">{wallet?.boosts ?? 0}</span>
                  </div>
                  {(wallet?.boosts ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setBoostOpen(true)}
                      data-track-exempt="disabled: pending telemetry web parity enablement for discover.boost_open"
                      className="w-full py-2.5 rounded-xl bg-accent text-bg text-xs font-semibold cursor-pointer"
                    >
                      Activate boost
                    </button>
                  )}
                </div>
              )}

              {section === 'roses' && (
                <div className="p-4 rounded-2xl border border-border bg-surface space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Purchased roses (never expire)</span>
                    <span className="text-lg font-bold text-text">{wallet?.roses ?? 0}</span>
                  </div>
                  {roseQuota && (
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>Daily plan roses remaining</span>
                      <span className="font-semibold text-text">
                        {roseQuota.remaining} / {roseQuota.limit}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {section === 'archives' && (
                <div className="p-4 rounded-2xl border border-border bg-surface space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Total available archive slots</span>
                    <span className="text-lg font-bold text-text">
                      {totalRemainingArchives(archiveAllowance ?? { planIncluded: 0, planUsed: 0, purchased: wallet?.archives ?? 0 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>Purchased archive credits</span>
                    <span className="font-semibold text-text">{wallet?.archives ?? 0}</span>
                  </div>
                </div>
              )}

              {products.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-text-muted">Available packs</p>
                  <div className="grid grid-cols-3 gap-2">
                    {products.map((p) => (
                      <div key={p.productId} className="p-3 rounded-xl border border-border bg-surface text-center">
                        <p className="text-base font-bold text-text">{p.quantity}</p>
                        <p className="text-[11px] text-accent font-semibold mt-0.5">{p.displayPrice}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Purchases via OneHook iOS/Android immediately credit your account balance on web too.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalDialog>
      <BoostDialog open={boostOpen} onClose={() => setBoostOpen(false)} />
    </>
  );
}

export function PendingNoticeDialog({
  open,
  onClose,
  onOpenRequests,
  onOpenArchives,
}: {
  open: boolean;
  onClose: () => void;
  onOpenRequests: () => void;
  onOpenArchives: () => void;
}) {
  const pending = useAppStore((s) => s.userState?.pending);
  const count = totalPendingCount(pending);

  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="pending-notice-title" className="max-w-md w-full">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 id="pending-notice-title" className="text-base font-serif italic font-bold text-text flex items-center gap-2">
          <BellRing className={`${ICON_SECTION.modalHeader.icon} text-accent`} aria-hidden="true" /> Pending activity ({count})
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
          className={ICON_SECTION.modalHeader.button}
        >
          <X className={ICON_SECTION.modalHeader.icon} />
        </button>
      </div>

      <div className="p-5 space-y-4 text-xs">
        <p className="text-text-secondary leading-relaxed">
          You have requests waiting while you review your next connection. Resolving held requests keeps your inbox clear.
        </p>

        {pending && (
          <ul className="space-y-2 rounded-xl border border-border bg-surface p-3.5">
            <li className="flex justify-between">
              <span className="text-text-secondary">Incoming hook requests</span>
              <span className="font-bold text-text">{pending.hookRequestsIn}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-text-secondary">Sent hook requests</span>
              <span className="font-bold text-text">{pending.hookRequestsOut}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-text-secondary">Incoming unarchive requests</span>
              <span className="font-bold text-text">{pending.archiveRequestsIn}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-text-secondary">Sent unarchive request</span>
              <span className="font-bold text-text">{pending.archiveRequestsOut}</span>
            </li>
          </ul>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRequests();
            }}
            {...trackProps(UiElement.CHAT_REQUESTS_OPEN)}
            className="flex-1 py-2.5 rounded-xl bg-accent text-bg font-semibold cursor-pointer"
          >
            View requests
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenArchives();
            }}
            data-track-exempt="disabled: pending telemetry web parity enablement for chat.archived_open"
            className="flex-1 py-2.5 rounded-xl border border-border text-text font-semibold hover:bg-surface-hover cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Sparkles className={ICON_SECTION.toolbar.pillIcon} /> Archived chats
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
