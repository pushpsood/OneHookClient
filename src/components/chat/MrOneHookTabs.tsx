import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { LockIcon, UNLOCK_TIER_NAME, UpgradeDialog } from '../common/LockedFeature';
import { trackProps, UiElement, type UiElementId, type UiTrackOptions } from '../../lib/analytics/analytics';

export interface MrOneHookTab {
  /** The saved chat's id; undefined for the new, unsaved chat. */
  sessionId?: string;
  title: string;
}

/**
 * Mr. OneHook chats as calm, full-width tabs that float at the top of the chat (not part of the header).
 *
 * A soft track holds the chats in equal widths; the active chat is a raised pill that eases in. Only the
 * active saved chat shows its delete control, so the row stays quiet. A round + ends the row. Must sees
 * the same row with locks; tapping explains the Super feature. Motion is skipped with reduced motion.
 */
export function MrOneHookTabs({
  tabs,
  activeId,
  locked,
  leavingId,
  onSelect,
  onDelete,
  onAdd,
}: {
  tabs: MrOneHookTab[];
  activeId?: string;
  locked: boolean;
  /** The tab being replaced: it shrinks away before the new chat takes its place. */
  leavingId?: string;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onAdd: () => void;
}) {
  const [upsell, setUpsell] = useState(false);
  const newTabKey = tabs.find((t) => !t.sessionId) ? 'new' : undefined;
  // The new tab grows in softly once it appears.
  const [newShown, setNewShown] = useState(false);
  useEffect(() => {
    if (!newTabKey) {
      setNewShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setNewShown(true));
    return () => cancelAnimationFrame(id);
  }, [newTabKey]);

  const track =
    'rounded-full bg-surface/90 backdrop-blur-sm border border-border shadow-[0_2px_8px_rgba(0,0,0,0.08)]';

  return (
    <div className="flex items-center gap-2 w-full" data-testid="mr-onehook-tabs" role="tablist" aria-label="Mr. OneHook chats">
      <div className={`flex-1 flex items-center p-1 h-11 min-w-0 ${track}`}>
        {tabs.map((tab) => {
          const active = locked ? true : tab.sessionId === activeId || (!tab.sessionId && !activeId);
          const leaving = tab.sessionId !== undefined && tab.sessionId === leavingId;
          const isNew = !tab.sessionId;
          return (
            <div
              key={tab.sessionId ?? 'new'}
              className={`relative flex-1 min-w-0 h-full flex items-center justify-center rounded-full
                transition-all duration-300 ease-out motion-reduce:transition-none
                ${active ? 'bg-white dark:bg-[#343436] shadow-[0_2px_6px_rgba(0,0,0,0.10)]' : ''}
                ${leaving ? 'scale-90 opacity-0' : ''}
                ${isNew && !newShown ? 'scale-90 opacity-0' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (locked) return setUpsell(true);
                  if (tab.sessionId && !active) onSelect(tab.sessionId);
                }}
                {...(locked
                  ? trackProps(UiElement.CHAT_MR_ONEHOOK_UPGRADE_OPEN, { action: 'tap' })
                  : trackProps(UiElement.CHAT_MR_ONEHOOK_SESSION_RESUME))}
                className={`w-full h-full px-3 flex items-center justify-center gap-1.5 truncate text-sm cursor-pointer rounded-full
                  ${active ? 'font-semibold text-text' : 'text-text/55 hover:text-text/80'}
                  ${active && tab.sessionId && !locked ? 'pr-7' : ''}`}
                aria-label={locked ? `${tab.title}. Keeping several chats is part of ${UNLOCK_TIER_NAME}.` : tab.title}
              >
                <span className="truncate">{tab.title}</span>
                {locked && <LockIcon className="w-2.5 h-2.5 opacity-40" />}
              </button>
              {active && tab.sessionId && !locked && (
                <button
                  type="button"
                  onClick={() => onDelete(tab.sessionId!)}
                  {...trackProps(UiElement.CHAT_MR_ONEHOOK_SESSION_DELETE, { action: 'tap' })}
                  aria-label={`Delete ${tab.title}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-text/40 hover:text-text/70 hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => (locked ? setUpsell(true) : onAdd())}
        {...(locked
          ? trackProps(UiElement.CHAT_MR_ONEHOOK_UPGRADE_OPEN, { action: 'tap' })
          : trackProps(UiElement.CHAT_MR_ONEHOOK_SESSION_NEW))}
        aria-label={locked ? `New chat, locked. Keeping several chats is part of ${UNLOCK_TIER_NAME}.` : 'New chat with Mr. OneHook'}
        className={`shrink-0 w-11 h-11 flex items-center justify-center text-text cursor-pointer ${track} ${locked ? 'opacity-55' : 'hover:bg-surface'}`}
      >
        {locked ? <LockIcon className="w-3.5 h-3.5" /> : <Plus className="w-5 h-5" strokeWidth={1.75} />}
      </button>
      {upsell && (
        <UpgradeDialog
          feature="Keeping up to 3 chats"
          detail={`With ${UNLOCK_TIER_NAME} you can keep up to 3 chats with Mr. OneHook as tabs, switch between them and pick them up later. On your plan there is one chat, and it starts fresh each time you open the app.`}
          element={UiElement.CHAT_MR_ONEHOOK_UPGRADE_OPEN}
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}

/** A calm confirmation (replace the least recent chat, or delete one). */
export function MrOneHookConfirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  element,
  confirmOptions,
  cancelOptions,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Telemetry element for both buttons; the options tell Confirm and Cancel apart. */
  element: UiElementId;
  confirmOptions?: UiTrackOptions;
  cancelOptions?: UiTrackOptions;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="presentation"
      data-track-exempt="backdrop: closing is tracked by the Cancel button"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mr-onehook-confirm-title"
        className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 space-y-3 text-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: only stops clicks inside the dialog from closing it"
      >
        <h2 id="mr-onehook-confirm-title" className="text-sm font-black">{title}</h2>
        <p className="text-xs text-text-secondary leading-relaxed">{body}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            {...trackProps(element, cancelOptions)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            {...trackProps(element, confirmOptions)}
            className="px-3 py-1.5 rounded-lg bg-ig-blue text-white text-xs font-semibold cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
