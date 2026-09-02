import { Lock } from 'lucide-react';

/**
 * The two pieces of UI that stand in for messages this device cannot decrypt.
 *
 * They live here, shared, because there is more than one chat surface (the full-page `ChatView` and the
 * inline `ChatConversationPanel` in the matches list). `decryptInbound` deliberately returns an EMPTY
 * string alongside `undecryptable: true`, so any surface that renders `ciphertext` without checking the
 * flag shows a silent blank bubble instead of an explanation — which is exactly the bug this module
 * exists to prevent recurring. Every message renderer must branch on `undecryptable` and use these.
 */

/**
 * Replaces the body of a single message this device cannot decrypt.
 *
 * These are messages written before this device was added to the account: they were encrypted to the
 * account's history key, whose private half lives on an earlier device. Rather than an opaque
 * "[Unable to decrypt]" — or worse, an empty bubble — this explains why and offers the one action that
 * fixes it.
 *
 * @param inverted set on the sender's own (dark) bubble, where the accent-coloured link is unreadable.
 */
export function LockedMessageNotice({
  onRestore,
  inverted,
}: {
  onRestore: () => void;
  inverted: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className={`flex items-center gap-2 text-xs italic ${inverted ? 'opacity-80' : 'opacity-60'}`}
      >
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Sent before you added this device.</span>
      </div>
      <button
        onClick={onRestore}
        className={`text-[10px] uppercase tracking-[0.2em] font-black underline hover:opacity-70 transition-opacity ${
          inverted ? 'text-white' : 'text-accent'
        }`}
      >
        Restore from another device
      </button>
    </div>
  );
}

/**
 * Conversation-level prompt shown once when any message in the thread is locked.
 *
 * Recovery is an ACCOUNT-level action, not a per-conversation one, so this deliberately reads as a
 * property of the device rather than of this particular thread.
 */
export function HistoryLockedBanner({ onRestore }: { onRestore: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 p-5 border border-amber-300 bg-amber-50">
      <div className="flex items-start gap-3 min-w-0">
        <Lock className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-amber-800">
          Some earlier messages were encrypted before this device was added, so they stay locked until
          you move the key across from a device you already use.
        </p>
      </div>
      <button
        onClick={onRestore}
        className="shrink-0 py-2 px-4 bg-amber-600 text-white text-[10px] uppercase tracking-[0.2em] font-black hover:opacity-90 transition-opacity"
      >
        Restore
      </button>
    </div>
  );
}
