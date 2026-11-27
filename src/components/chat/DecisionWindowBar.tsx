/**
 * Decision Window banner & send confirmation gate (mirrors iOS `DecisionWindowView` + `gateSend`
 * in `ChatDetailViewController.swift`).
 *
 * When the server sets `userState.decisionWindow` pointing at `matchId`, the member must confirm
 * before sending the opening/pending message in that thread or choose to let the hook go.
 */
import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Send } from 'lucide-react';
import { ModalDialog } from '../common/ModalDialog';
import { useAppStore } from '../../store/app-store';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

export function DecisionWindowBar({
  matchId,
  peerName,
  onLetGo,
}: {
  matchId: string;
  peerName: string;
  onLetGo: () => void;
}) {
  const dw = useAppStore((s) => s.userState?.decisionWindow);
  if (!dw || dw.matchId !== matchId) return null;

  return (
    <div
      className="px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/25 flex items-center justify-between gap-3 text-xs"
      data-testid="decision-window-bar"
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-text">
            Decide whether to continue with {peerName}
          </p>
          <p className="text-[11px] text-text-secondary">
            {dw.heldRequestCount > 0
              ? `Your next message confirms keeping this hook active (${dw.heldRequestCount} request${dw.heldRequestCount === 1 ? '' : 's'} held).`
              : 'Your next message confirms keeping this hook active, or you can let this hook go.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLetGo}
        // TODO(telemetry-parity): switch to UiElement.CHAT_DECISION_PROMPT_REVIEW once enabled on web.
        data-track-exempt="disabled: pending telemetry web parity enablement for chat.decision_prompt_review"
        className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-500/40 text-xs font-semibold text-text hover:bg-surface cursor-pointer"
      >
        Let go
      </button>
    </div>
  );
}

/**
 * Intercepts outbound message sends when `decisionWindow.matchId === matchId` so the user gets
 * the explicit `"Send this message?"` native modal confirmation first.
 */
export function useDecisionWindowGate(matchId: string | undefined, peerName: string) {
  const dw = useAppStore((s) => s.userState?.decisionWindow);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmedForMatchRef = useRef<string | null>(null);

  const isWindowActive = Boolean(dw && matchId && dw.matchId === matchId && confirmedForMatchRef.current !== matchId);

  const gateSend = useCallback(
    (action: () => Promise<void> | void) => {
      if (!isWindowActive) {
        void action();
        return;
      }
      setPendingAction(() => action);
    },
    [isWindowActive]
  );

  const handleConfirm = async () => {
    const fn = pendingAction;
    setPendingAction(null);
    if (!fn) return;
    setBusy(true);
    try {
      confirmedForMatchRef.current = matchId ?? null;
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const confirmDialog = (
    <ModalDialog
      open={Boolean(pendingAction)}
      onClose={() => setPendingAction(null)}
      label="Send this message?"
      testId="decision-window-confirm-dialog"
    >
      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <h3 className="text-base font-serif italic font-bold text-text">
            Send this message to {peerName}?
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            Sending starts or continues this conversation now and counts toward your active hooks.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPendingAction(null)}
            {...trackProps(UiElement.SHARED_ALERT_DISMISS, { action: 'dismiss' })}
            className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-text hover:bg-surface-hover cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            {...trackProps(UiElement.CHAT_SEND_BUTTON)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            Send
          </button>
        </div>
      </div>
    </ModalDialog>
  );

  return { isWindowActive, gateSend, confirmDialog };
}
