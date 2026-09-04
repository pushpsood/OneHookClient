import { useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { ChatEncryptionManager } from '../../lib/chat-encryption';

/**
 * The floor of the unlock ladder: abandon unreadable history and start a working epoch.
 *
 * Offered only after every other method has failed. Without it a stranded key leaves the account
 * permanently broken — every future message would keep being wrapped to a key nobody holds, with no way
 * to establish a replacement — so this trades "old messages lost" for "account works again".
 *
 * Three deliberate frictions, because this is destructive and irreversible:
 *  1. it is never automatic, since a holder that is merely offline would otherwise be written off;
 *  2. it states plainly what is lost, before anything happens;
 *  3. it requires the user to type a confirmation, so it cannot be a mis-click.
 *
 * It does NOT delete messages. Chats are stored once per match and shared, so the peer may still read
 * them; a reset records a horizon and clears only this account's access.
 */
export function HistoryResetDialog({
  userId,
  open,
  onClose,
  onReset,
}: {
  userId?: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful reset so the caller can refresh what is on screen. */
  onReset?: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  if (!open) return null;

  const CONFIRM_WORD = 'RESET';
  const canReset = confirmation.trim().toUpperCase() === CONFIRM_WORD && !busy;

  const close = () => {
    setConfirmation('');
    setError(undefined);
    setDone(false);
    onClose();
  };

  const performReset = async () => {
    if (!userId) return;
    setBusy(true);
    setError(undefined);
    try {
      const manager = new ChatEncryptionManager(userId);
      const established = await manager.resetHistoryKey();
      if (!established) {
        // Another of the user's devices established an epoch first. That is good news — there may now
        // be a key to unlock against — so send them back rather than resetting again.
        setError(
          'Another of your devices just set up a new key. Close this and try restoring again first.'
        );
        return;
      }
      setDone(true);
      onReset?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your encryption key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-reset-title"
    >
      <div className="bg-white border border-border w-full max-w-md max-h-[90vh] overflow-y-auto p-8 space-y-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-1 text-amber-600 shrink-0" aria-hidden="true" />
          <div>
            <h2
              id="history-reset-title"
              className="text-[10px] uppercase tracking-[0.3em] font-black text-accent"
            >
              Start Fresh Without Old Messages
            </h2>
            <p className="mt-2 text-xs opacity-60 leading-relaxed">
              No device could give this one the key that opens your earlier messages. You can set up a
              new key so everything from now on works normally.
            </p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-green-700">
              Done. New messages are protected with your new key, and any device you add from now on
              will be able to read them.
            </p>
            <button
              onClick={close}
              className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
            >
              Back to chat
            </button>
          </div>
        ) : (
          <>
            <div className="border border-amber-300 bg-amber-50 p-4 space-y-2">
              <span className="text-[9px] uppercase tracking-[0.25em] font-black text-amber-800 block">
                What you lose
              </span>
              <p className="text-xs text-amber-800 leading-relaxed">
                Messages sent before now stay unreadable on this account, permanently. This cannot be
                undone, and no future device will be able to open them either.
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                The people you chat with keep their own copies — this only affects what you can read.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="reset-confirm"
                className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block"
              >
                Type {CONFIRM_WORD} to confirm
              </label>
              <input
                id="reset-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                className="w-full py-3 px-0 border-b border-accent focus:border-b-2 transition-all outline-none text-sm bg-transparent font-mono tracking-[0.2em]"
              />
            </div>

            {error && <p className="text-xs text-red-600 leading-relaxed">{error}</p>}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => void performReset()}
                disabled={!canReset}
                className="w-full py-4 bg-amber-600 text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity disabled:opacity-30 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader className="w-3 h-3 animate-spin" aria-hidden="true" />}
                Set up a new key
              </button>
              <button
                onClick={close}
                className="w-full py-4 border border-border text-[10px] uppercase tracking-[0.3em] font-black hover:border-accent transition-colors"
              >
                Keep trying to restore
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
