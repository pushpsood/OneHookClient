import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { ChatEncryptionManager } from '../../lib/chat-encryption';

/**
 * Dismissible nudge to add a second passkey.
 *
 * A recovery code was considered and rejected: users do not reliably keep them, and a lost code is
 * indistinguishable from never having one. Redundancy comes from multiple passkeys on different
 * providers instead — one in iCloud Keychain, one in Google Password Manager — because each becomes an
 * independent holder of the history key with nothing for the user to store.
 *
 * A NUDGE rather than a requirement, deliberately: forcing it at signup would trade a rare failure case
 * for friction on every single account. The same action lives permanently in account settings, so
 * dismissing this is never the user's last chance.
 *
 * Only shown when it would actually help: this device must hold the history key (otherwise it cannot
 * seal a new wrap), PRF must be supported here, and the account must have fewer than two PRF holders.
 */
const DISMISS_KEY = 'onehook.secondPasskeyNudge.dismissed';

export function SecondPasskeyNudge({ userId }: { userId?: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!userId) return;
    if (localStorage.getItem(`${DISMISS_KEY}.${userId}`) === '1') return;

    let active = true;
    void (async () => {
      try {
        const manager = new ChatEncryptionManager(userId);
        const methods = await manager.historyUnlockMethods();
        if (!active) return;
        // Fewer than two passkey holders is the case worth nudging: one passkey means losing that one
        // provider costs the user their history.
        setVisible(
          Boolean(methods.activeEpoch) && methods.prfSupportedHere && methods.prf < 2
        );
      } catch {
        /* never block the page on a nudge */
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!userId || !visible) return null;

  const dismiss = () => {
    localStorage.setItem(`${DISMISS_KEY}.${userId}`, '1');
    setVisible(false);
  };

  const addPasskey = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const credentialId = await new ChatEncryptionManager(userId).addPasskeyUnlock();
      if (credentialId) {
        setMessage('Added. This passkey can now unlock your history too.');
        setVisible(false);
      } else {
        // Ordinary on unsupported authenticators, or if the user cancelled the prompt.
        setMessage('That passkey can’t be used for recovery. You can try a different one.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add that passkey.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border p-6 bg-bg/40 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <KeyRound className="w-4 h-4 mt-0.5 text-accent shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.3em] font-black text-accent block">
              Add a backup passkey
            </span>
            <p className="text-xs opacity-60 leading-relaxed">
              You have one way to unlock your message history on a new device. Adding a passkey from a
              different provider — say Google alongside Apple — means losing one of them never costs you
              your conversations. Nothing to write down.
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1 opacity-40 hover:opacity-100 transition-opacity shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {message && <p className="text-xs opacity-70 leading-relaxed">{message}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void addPasskey()}
          disabled={busy}
          className="py-3 px-6 bg-accent text-white text-[10px] uppercase tracking-[0.2em] font-black hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          Add a passkey
        </button>
        <button
          onClick={dismiss}
          className="py-3 px-6 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:border-accent transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
