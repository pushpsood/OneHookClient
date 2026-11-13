import { useState } from 'react';
import { useToast } from '../../components/common/Toast';
import { setMatchingTabHiddenInStore } from '../../hooks/use-api';
import { errorMessage } from '../../lib/api-errors';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

export const MATCHING_TAB_TOGGLE_COPY = {
  title: 'Show Matching tab',
  subtitle: 'See a preview of matching in your tab bar.',
  failed: 'We couldn’t update the Matching tab. Please try again.',
} as const;

/**
 * Settings > General, while matching is not ON: whether the shell shows the Matching tab (the locked
 * Discover preview). Checked = shown. The shell follows at once; a failed save puts it back
 * (setMatchingTabHiddenInStore) and says so.
 */
export function MatchingTabToggleCard({ hidden }: { hidden: boolean }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const checked = !hidden;

  const toggle = async () => {
    setSaving(true);
    try {
      await setMatchingTabHiddenInStore(checked);
    } catch (error) {
      console.error('Updating the Matching tab failed:', error);
      showToast(errorMessage(error, MATCHING_TAB_TOGGLE_COPY.failed), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-card border border-border p-6 rounded-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 id="matching-tab-toggle-title" className="text-base font-bold text-text">
            {MATCHING_TAB_TOGGLE_COPY.title}
          </h3>
          <p className="text-xs text-text-secondary">{MATCHING_TAB_TOGGLE_COPY.subtitle}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby="matching-tab-toggle-title"
          disabled={saving}
          onClick={toggle}
          {...trackProps(UiElement.SETTINGS_MATCHING_TAB_TOGGLE, { action: 'toggle', value: checked ? 'hide' : 'show' })}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            checked ? 'bg-ig-blue' : 'bg-border'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
}
