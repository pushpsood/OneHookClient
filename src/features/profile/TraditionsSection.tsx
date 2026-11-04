import { useEffect, useState } from 'react';
import { TraditionApi, type TraditionSetting } from '../../api/rest';
import { trackUi, UiElement } from '../../lib/analytics/analytics';

const NEEDS: Record<string, string> = {
  DATE: 'Uses your date of birth',
  TIME: 'Needs your birth time',
  PLACE: 'Needs your birth time and place',
};

/**
 * Traditional matching systems the member takes part in. All are on by default. Turning one off means
 * it is never computed or shown, for you or for anyone you are matched with.
 */
export function TraditionsSection() {
  const [items, setItems] = useState<TraditionSetting[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    TraditionApi.get()
      .then((r) => setItems(r.traditions))
      .catch(() => setError('Could not load traditions.'));
  }, []);

  const toggle = async (t: TraditionSetting) => {
    if (!items) return;
    const next = items.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x));
    setSaving(t.id);
    setError(null);
    trackUi(UiElement.PREFERENCES_TRADITION_TOGGLE, { value: t.id.toLowerCase() });
    try {
      const r = await TraditionApi.setDisabled(next.filter((x) => !x.enabled).map((x) => x.id));
      setItems(r.traditions);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="space-y-3" data-testid="traditions-section">
      <div>
        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50">
          Traditional matching
        </h3>
        <p className="text-xs opacity-70 mt-1">
          Each tradition judges a match on its own and only appears on a profile when it rates the
          match well. Turn off any you do not follow: it will not be calculated or shown for you or
          your matches.
        </p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!items && !error && <p className="text-xs opacity-60">Loading…</p>}
      <ul className="divide-y divide-border border border-border">
        {items?.map((t) => (
          <li key={t.id} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs opacity-70">{t.description}</p>
              <p className="text-[10px] opacity-50 mt-0.5">{NEEDS[t.needs] ?? ''}</p>
            </div>
            <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                aria-label={`${t.label} matching`}
                checked={t.enabled}
                disabled={saving === t.id}
                onChange={() => toggle(t)}
                data-track-exempt="duplicate: toggle() emits preferences.tradition_toggle"
                className="w-4 h-4 accent-ig-blue"
              />
              <span className="text-xs">{t.enabled ? 'On' : 'Off'}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
