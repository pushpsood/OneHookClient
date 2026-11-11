import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { UserStateSnapshot } from '../../types';
import { StateApi } from '../../api/state';
import { usePartnerProfiles } from '../../hooks/use-api';
import { MediaImage } from '../../components/common/MediaImage';
import { useToast } from '../../components/common/Toast';
import { FALLBACK_PROFILE_IMAGE } from '../../utils/profile-image';
import { errorCode, errorStatus } from '../../lib/api-errors';
import { Screen, UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import { formatDay, originLabel, selectionExplainer } from './hook-copy';

/**
 * Full-screen downgrade chooser (docs/chat-only-profiles.md §7.6, R24). Shown while
 * `selectionRequired`: the member's plan now allows fewer hooks than they hold, and every
 * conversation of theirs is suspended (read-only) until they keep exactly `keepLimit` of them with
 * `POST /state/hooks/keep`. The others are released and their chats erased. Without a choice by
 * `selectionDeadline`, State keeps the most recently active ones.
 */
export function KeepHooksChooser({
  userState,
  onKept,
  onUpgrade,
  upgrading,
}: {
  userState: UserStateSnapshot;
  onKept: () => Promise<void> | void;
  /** Re-checks the membership (an upgrade before choosing resumes everything, E24). */
  onUpgrade: () => Promise<void> | void;
  upgrading?: boolean;
}) {
  const { showToast } = useToast();
  const hooks = userState.hooks;
  const keepLimit = Math.max(1, userState.keepLimit ?? userState.effectiveCapacity ?? 1);
  const profiles = usePartnerProfiles(useMemo(() => hooks.map((h) => h.peerId), [hooks]));
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (matchId: string, on: boolean) => {
    trackUi(UiElement.CHAT_KEEP_HOOK_TOGGLE, { value: on ? 'on' : 'off', targetId: matchId, context: Screen.CHAT });
    setSelected((prev) => {
      if (!on) return prev.filter((id) => id !== matchId);
      if (prev.includes(matchId)) return prev;
      // At the limit, a new pick replaces the oldest pick, so the member never has to untick first.
      const next = [...prev, matchId];
      return next.length > keepLimit ? next.slice(next.length - keepLimit) : next;
    });
  };

  const submit = async () => {
    if (selected.length !== keepLimit) return;
    setSubmitting(true);
    try {
      await StateApi.keepHooks(selected);
      showToast(keepLimit === 1 ? 'Done. Your chat is active again.' : 'Done. Your chats are active again.', 'success');
      await onKept();
    } catch (err) {
      if (errorStatus(err) === 409 && errorCode(err) === 'NOT_SELECTING') {
        // Already resolved (auto-keep, an upgrade, or another device): just reload.
        await onKept();
        return;
      }
      showToast("We couldn't save your choice. Please try again.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-[100dvh] bg-bg text-text flex items-start sm:items-center justify-center p-4 sm:p-8"
      aria-labelledby="keep-hooks-title"
    >
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2">
          <h1 id="keep-hooks-title" className="text-2xl font-semibold">
            Choose who to keep
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            {selectionExplainer(keepLimit, hooks.length, userState.selectionDeadline)}
          </p>
          <p className="text-xs text-text-muted">All your chats are paused until you choose.</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">
            Hooks to keep ({selected.length} of {keepLimit} chosen)
          </legend>
          {hooks.map((hook) => {
            const p = profiles[hook.peerId];
            const name = p?.name ?? (p === null ? 'Someone' : '…');
            const checked = selected.includes(hook.matchId);
            return (
              <label
                key={hook.matchId}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked ? 'border-accent bg-accent/5' : 'border-border hover:bg-surface-hover'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={checked}
                  onChange={(e) => toggle(hook.matchId, e.target.checked)}
                />
                <span className="w-11 h-11 rounded-full overflow-hidden border border-border bg-surface shrink-0">
                  <MediaImage
                    src={p?.avatarKey || FALLBACK_PROFILE_IMAGE}
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-cover"
                  />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">
                    {name}
                    {p?.age ? <span className="font-normal text-text-secondary">, {p.age}</span> : null}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {originLabel(hook.origin)}
                    {hook.hookedAt ? ` · since ${formatDay(hook.hookedAt)}` : ''}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`w-6 h-6 rounded-full border flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
                    checked ? 'bg-accent border-accent text-bg' : 'border-border'
                  }`}
                >
                  {checked && <Check className="w-4 h-4" />}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || selected.length !== keepLimit}
            {...trackProps(UiElement.CHAT_KEEP_HOOKS_SUBMIT, { context: Screen.CHAT })}
            className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {submitting
              ? 'Saving…'
              : `Keep ${selected.length} of ${keepLimit}`}
          </button>
          <button
            type="button"
            onClick={() => void onUpgrade()}
            disabled={upgrading}
            {...trackProps(UiElement.PROFILE_UPGRADE_OPEN, { context: Screen.CHAT })}
            className="w-full py-3 border border-border text-sm font-semibold rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40 cursor-pointer"
          >
            {upgrading ? 'Checking your plan…' : 'Upgraded again? Refresh my plan'}
          </button>
        </div>
      </div>
    </main>
  );
}
