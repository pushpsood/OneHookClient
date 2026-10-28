import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SuggestionApi } from '../../api/rest';
import { trackProps, UiElement } from '../../lib/analytics/analytics';

export interface CurrentSuggestion {
  suggestionId: string;
  reasoning: string;
  createdAt: string;
}

/**
 * The member's current Mr. OneHook request, shown in their match settings. One at a time: asking Mr. OneHook
 * again replaces it; Remove is the only other way it goes away. Nothing renders when there is none.
 */
export function CurrentSuggestionCard({
  suggestion,
  onRemoved,
}: {
  suggestion?: CurrentSuggestion | null;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!suggestion) return null;

  const since = Number.isFinite(Date.parse(suggestion.createdAt))
    ? new Date(suggestion.createdAt).toLocaleDateString()
    : null;

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await SuggestionApi.remove();
      onRemoved();
    } catch {
      setError("Couldn't remove it right now. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2" data-testid="current-suggestion">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        <Sparkles className="w-3.5 h-3.5" /> Your Mr. OneHook request
      </div>
      <p className="text-sm text-text italic">{suggestion.reasoning}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-text-secondary">
          {since ? `Since ${since}. ` : ''}Asking Mr. OneHook again replaces it.
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          {...trackProps(UiElement.PREFERENCES_SUGGESTION_REMOVE)}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface-card disabled:opacity-50 cursor-pointer"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
