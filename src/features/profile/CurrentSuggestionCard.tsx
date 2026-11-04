import { useCallback, useEffect, useState } from 'react';
import { Sparkles, UserRound } from 'lucide-react';
import { SuggestionApi, type MemberSuggestions, type SuggestionView } from '../../api/rest';
import { trackProps, UiElement, type UiElementId } from '../../lib/analytics/analytics';

export type CurrentSuggestion = SuggestionView;

/** Server limits for a suggestion (Matching `SuggestionService`). */
export const OWN_PROMPT_MIN = 3;
export const OWN_PROMPT_MAX = 1000;
export const OWN_NOTE_MAX = 280;

/**
 * One suggestion card with Remove. Used for both the member's own suggestion and Mr. OneHook's; each is
 * removed on its own. Nothing renders when there is none.
 */
export function CurrentSuggestionCard({
  suggestion,
  title,
  hint,
  onRemove,
  removeElement,
  testId,
}: {
  suggestion?: CurrentSuggestion | null;
  title: string;
  hint: string;
  onRemove: () => Promise<void>;
  removeElement: UiElementId;
  testId: string;
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
      await onRemove();
    } catch {
      setError("Couldn't remove it right now. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        <Sparkles className="w-3.5 h-3.5" /> {title}
      </div>
      <p className="text-sm text-text italic">{suggestion.reasoning}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-text-secondary">
          {since ? `Since ${since}. ` : ''}
          {hint}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          {...trackProps(removeElement)}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface-card disabled:opacity-50 cursor-pointer"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/**
 * "Tell OneHook who you're looking for" (Super and above). Saving replaces the member's previous own
 * suggestion; Mr. OneHook's suggestion is separate and unaffected.
 */
export function OwnSuggestionForm({ onSaved, replacing }: { onSaved: () => void; replacing: boolean }) {
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = prompt.trim();
  const valid = text.length >= OWN_PROMPT_MIN && text.length <= OWN_PROMPT_MAX && note.trim().length <= OWN_NOTE_MAX;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      // The note is what the member sees on the cards it surfaces; default to their own words.
      const reasoning = (note.trim() || `You asked for: ${text}`).slice(0, OWN_NOTE_MAX);
      await SuggestionApi.saveOwn(text, reasoning);
      setPrompt('');
      setNote('');
      onSaved();
    } catch {
      setError("Couldn't save it right now. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2" data-testid="own-suggestion-form">
      <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        <UserRound className="w-3.5 h-3.5" /> Tell OneHook who you&rsquo;re looking for
      </label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={OWN_PROMPT_MAX}
        rows={3}
        placeholder="e.g. someone outdoorsy who loves books and early mornings"
        className="field-input w-full"
        aria-label="Who you're looking for"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={OWN_NOTE_MAX}
        placeholder="Short note shown on those matches (optional)"
        className="field-input w-full"
        aria-label="Short note"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-text-secondary">
          {replacing ? 'Saving replaces your current one.' : 'People like this will appear in Discover.'}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          {...trackProps(UiElement.PREFERENCES_OWN_SUGGESTION_SAVE)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-ig-blue text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/**
 * The member's suggestions in match settings: their own (with the form to add or replace it) and
 * Mr. OneHook's. Super and above; Must sees nothing here.
 */
export function SuggestionsSection({ paid }: { paid: boolean }) {
  const [data, setData] = useState<MemberSuggestions>({});
  const load = useCallback(async () => {
    try {
      setData((await SuggestionApi.get()) ?? {});
    } catch {
      setData({});
    }
  }, []);
  useEffect(() => {
    if (paid) void load();
  }, [paid, load]);
  if (!paid) return null;

  return (
    <div className="space-y-3" data-testid="suggestions-section">
      <CurrentSuggestionCard
        suggestion={data.own}
        title="Your own suggestion"
        hint="Saving a new one replaces it."
        removeElement={UiElement.PREFERENCES_OWN_SUGGESTION_REMOVE}
        testId="own-suggestion"
        onRemove={async () => {
          await SuggestionApi.removeOwn();
          setData((d) => ({ ...d, own: undefined }));
        }}
      />
      <OwnSuggestionForm replacing={Boolean(data.own)} onSaved={() => void load()} />
      <CurrentSuggestionCard
        suggestion={data.oneHook}
        title="Your Mr. OneHook request"
        hint="Asking Mr. OneHook again replaces it."
        removeElement={UiElement.PREFERENCES_SUGGESTION_REMOVE}
        testId="current-suggestion"
        onRemove={async () => {
          await SuggestionApi.removeOneHook();
          setData((d) => ({ ...d, oneHook: undefined }));
        }}
      />
    </div>
  );
}
