import React, { useState, useEffect } from 'react';
import { usePreferences } from '../../hooks/use-api';
import { useToast } from '../common/Toast';
import { UserPreferences } from '../../types';

const GENDER_OPTIONS = ['M', 'F', 'NB'];

/**
 * Matching preferences panel. The backend preferences contract is limited to
 * age range, distance, and interested-in genders — lifestyle/relationship
 * attributes are profile fields and are edited elsewhere.
 */
export function PreferencesPanel() {
  const { prefs, loading, saving, save } = usePreferences();
  const { showToast } = useToast();
  const [form, setForm] = useState<UserPreferences>({ userId: '' });

  useEffect(() => {
    if (prefs) setForm(prefs);
  }, [prefs]);

  const update = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleGender = (value: string) => {
    setForm((prev) => {
      const genders = prev.genders ?? [];
      return {
        ...prev,
        genders: genders.includes(value)
          ? genders.filter((g) => g !== value)
          : [...genders, value],
      };
    });
  };

  const handleSave = async () => {
    try {
      await save(form);
      showToast('Matching preferences updated.', 'success');
    } catch {
      showToast('Could not save preferences.', 'error');
    }
  };

  if (loading) {
    return <p className="text-xs opacity-40 italic">Loading preferences...</p>;
  }

  return (
    <div className="space-y-8 border-t border-border pt-12">
      <div className="space-y-2">
        <h3 className="text-2xl font-serif italic uppercase tracking-tighter">Match Filters</h3>
        <p className="text-xs opacity-60 italic">
          Set your search radius, age range, and who you want to meet.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <PrefField label={`Max distance: ${form.maxDistanceKm ?? 50} km`}>
          <input
            type="range"
            min={5}
            max={200}
            step={5}
            value={form.maxDistanceKm ?? 50}
            onChange={(e) => update('maxDistanceKm', Number(e.target.value))}
            className="w-full"
          />
        </PrefField>
        <PrefField label="Age range">
          <div className="flex gap-3">
            <input
              type="number"
              min={18}
              max={99}
              value={form.minAge ?? 18}
              onChange={(e) => update('minAge', Number(e.target.value))}
              className="w-full border-b border-border py-2 outline-none text-sm"
            />
            <span className="opacity-30 self-center">–</span>
            <input
              type="number"
              min={18}
              max={99}
              value={form.maxAge ?? 99}
              onChange={(e) => update('maxAge', Number(e.target.value))}
              className="w-full border-b border-border py-2 outline-none text-sm"
            />
          </div>
        </PrefField>
      </div>

      <PrefField label="Interested in">
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggleGender(opt)}
              className={`px-3 py-1 border text-[10px] uppercase tracking-widest font-bold ${
                (form.genders ?? []).includes(opt)
                  ? 'border-accent bg-accent text-white'
                  : 'border-border opacity-60'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </PrefField>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}

function PrefField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50">{label}</span>
      {children}
    </label>
  );
}
