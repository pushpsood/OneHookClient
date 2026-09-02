import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader, MonitorSmartphone, ShieldCheck, History, Trash2 } from 'lucide-react';
import { ChatEncryptionManager, type DeviceOverview } from '../../lib/chat-encryption';
import { useAppStore } from '../../store/app-store';
import { useToast } from '../common/Toast';
import { HistoryRecoveryModal } from '../chat/HistoryRecoveryModal';

/**
 * Shows the devices registered for end-to-end encrypted chat (wire v2), the account-history key
 * status, and lets the member revoke a device. Revoking removes the device's key from the registry
 * so future messages are no longer wrapped to it.
 */
export function DeviceManagementCard() {
  const { showToast } = useToast();
  const { currentUser } = useAppStore();
  const userId = currentUser?.id;

  const manager = useMemo(
    () => (userId ? new ChatEncryptionManager(userId) : null),
    [userId]
  );

  const [overview, setOverview] = useState<DeviceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const load = useCallback(async () => {
    if (!manager) return;
    try {
      setLoading(true);
      setError(null);
      // Ensure this device is registered before reading the registry, so a brand-new device shows
      // up in its own list.
      await manager.initialize().catch(() => {
        /* registration is best-effort; still show whatever the registry returns */
      });
      const data = await manager.getDeviceOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your devices.');
    } finally {
      setLoading(false);
    }
  }, [manager]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = useCallback(
    async (deviceId: string) => {
      if (!manager) return;
      try {
        setRevoking(deviceId);
        await manager.revokeDevice(deviceId);
        showToast('Device revoked.', 'success');
        await load();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not revoke device.', 'error');
      } finally {
        setRevoking(null);
      }
    },
    [manager, showToast, load]
  );

  const historyLabel = useMemo(() => {
    switch (overview?.historyStatus) {
      case 'holding':
        return {
          text: 'This device holds your history key — it can restore past chats.',
          tone: 'text-green-600',
        };
      case 'future-only':
        return {
          text: 'History key established on another device. New messages sync; older ones stay on the original device.',
          tone: 'text-amber-600',
        };
      default:
        return {
          text: 'This device can’t open messages sent before it was added. If you use OneHook on another device, move the key across to read them here.',
          tone: 'opacity-60',
        };
    }
  }, [overview?.historyStatus]);

  // This device benefits from recovery unless it already holds the history key. A device that has not
  // yet reconciled the account's canonical key ("none") is offered the same action as a "future-only"
  // device: without this, a new device stuck in "none" has no visible way to start recovery at all,
  // since the in-chat prompt only appears once a conversation with unreadable history loads. The
  // modal itself gates every sub-case (already holding, or no other devices to restore from), so
  // offering it here can never promise a transfer that would do nothing.
  const canRestoreHistory = overview != null && overview.historyStatus !== 'holding';

  return (
    <div className="border border-border p-8 space-y-8 bg-white">
      <div className="flex items-center gap-3">
        <MonitorSmartphone className="w-4 h-4 text-accent" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
            Chat Devices
          </div>
          <p className="mt-1 text-xs opacity-50 leading-relaxed">
            Devices that can read your end-to-end encrypted chats. Revoke any you no longer use.
          </p>
        </div>
      </div>

      {/* History key status */}
      <div className="flex items-start gap-3 pt-4 border-t border-border">
        <History className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="space-y-2">
          <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block">
            History Recovery Key
          </span>
          <p className={`text-xs leading-relaxed ${historyLabel.tone}`}>{historyLabel.text}</p>
          {canRestoreHistory && (
            // Second entry point into the same flow the chat prompt opens. Users who notice missing
            // history often come looking here first, and a transfer started from settings behaves
            // identically — it is an account-level key, not a per-conversation one. Shown for both
            // "future-only" and "none" so a device that has not yet reconciled the account key still
            // has a reachable way to start recovery.
            <button
              onClick={() => setRecoveryOpen(true)}
              className="mt-1 py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:border-accent hover:text-accent transition-colors inline-flex items-center gap-2"
            >
              <History className="w-3 h-3" aria-hidden="true" />
              Restore earlier messages
            </button>
          )}
        </div>
      </div>

      {/* Device list */}
      <div className="space-y-4 pt-4 border-t border-border">
        <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block">
          Active Devices
        </span>

        {loading ? (
          <div className="flex items-center gap-2 text-xs opacity-50">
            <Loader className="w-4 h-4 animate-spin" /> Loading devices…
          </div>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : !overview?.devices.length ? (
          <p className="text-xs opacity-50">No devices registered yet.</p>
        ) : (
          <ul className="space-y-3">
            {overview.devices.map((device) => (
              <li
                key={device.deviceId}
                className="flex items-center justify-between gap-4 p-4 border border-border bg-bg/40"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {device.displayName || `${device.platform} device`}
                    </span>
                    {device.isCurrentDevice && (
                      <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] font-black text-green-600">
                        <ShieldCheck className="w-3 h-3" /> This device
                      </span>
                    )}
                    {device.revoked && (
                      <span className="text-[9px] uppercase tracking-[0.2em] font-black text-red-500">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono opacity-40 truncate">
                    {device.platform} · v{device.maxEnvelopeVersion} · {device.deviceId.slice(0, 8)}
                  </div>
                </div>
                {!device.isCurrentDevice && !device.revoked && (
                  <button
                    onClick={() => handleRevoke(device.deviceId)}
                    disabled={revoking === device.deviceId}
                    className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:border-red-500 hover:text-red-500 transition-colors disabled:opacity-50 inline-flex items-center gap-2 shrink-0"
                  >
                    {revoking === device.deviceId ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <HistoryRecoveryModal
        userId={userId}
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        // Re-read the registry so the status flips from "future-only" to "holding" straight away.
        onRecovered={() => void load()}
      />
    </div>
  );
}
