import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Clock, X } from 'lucide-react';
import { sdkClient } from '../../api/sdk-client';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

/** The optional parts of birthDetails. Only the date is locked; these can change at any time. */
export interface BirthTimePlace {
  time?: string;
  timeZone?: string;
  latitude?: number;
  longitude?: number;
  placeName?: string;
}

interface Props {
  value: BirthTimePlace;
  onChange: (next: BirthTimePlace) => void;
  /** Where the fields are shown: onboarding or the profile editor (telemetry id; never a value). */
  surface?: 'onboarding' | 'profile';
}

const browserZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
})();

const allZones: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      'timeZone'
    );
  } catch {
    return [browserZone, 'UTC'];
  }
})();

/**
 * Optional birth time and birthplace. Picking a place fills its coordinates and time zone (from Amazon
 * Location via GET /profile/places/{id}); without a place the member can still choose a time zone so a
 * birth time is meaningful. Everything here only refines traditional compatibility, never age.
 */
export function BirthTimePlaceFields({ value, onChange, surface = 'onboarding' }: Props) {
  // Birth details are personal data: telemetry records only that a choice was made, never what.
  const element =
    surface === 'profile'
      ? UiElement.PROFILE_EDIT_CHOICE_SELECT
      : UiElement.ONBOARDING_CHOICE_SELECT;
  const [query, setQuery] = useState(value.placeName ?? '');
  const [results, setResults] = useState<{ placeId: string; label: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === value.placeName) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await sdkClient.searchPlaces({ q, lang: navigator.language?.slice(0, 2) });
        if (mine === seq.current)
          setResults((res.places ?? []).map((p) => ({ placeId: p.placeId!, label: p.label! })));
        setError(null);
      } catch {
        if (mine === seq.current) setError('Place search is unavailable right now.');
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, value.placeName]);

  const choose = async (placeId: string) => {
    setResults([]);
    try {
      const p = await sdkClient.getPlace({ placeId });
      setQuery(p.label!);
      onChange({
        ...value,
        placeName: p.label,
        latitude: p.latitude,
        longitude: p.longitude,
        timeZone: p.timeZone ?? value.timeZone,
      });
    } catch {
      setError('Could not load that place. Please pick it again.');
    }
  };

  const clearPlace = () => {
    setQuery('');
    onChange({ ...value, placeName: undefined, latitude: undefined, longitude: undefined });
  };

  const zones = useMemo(() => allZones, []);
  const zone = value.timeZone ?? (value.time ? browserZone : undefined);

  return (
    <div className="space-y-4 border border-border p-4">
      <p className="text-xs opacity-70">
        Optional. Your birth time and place only refine traditional compatibility (Kundali, natal
        chart, Bazi and more). They are never shown to other members, and you can add or change them
        at any time.
      </p>

      <div className="space-y-2">
        <label
          className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 flex items-center gap-2"
          htmlFor="birth-time"
        >
          <Clock className="w-3 h-3" aria-hidden /> Birth time
        </label>
        <div className="flex gap-2 items-center">
          <input
            id="birth-time"
            type="time"
            value={value.time ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                time: e.target.value || undefined,
                timeZone: value.timeZone ?? browserZone,
              })
            }
            className="field-input"
          />
          {value.time && (
            <button
              type="button"
              className="text-xs underline"
              {...trackProps(element)}
              onClick={() => onChange({ ...value, time: undefined })}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 relative">
        <label
          className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 flex items-center gap-2"
          htmlFor="birth-place"
        >
          <MapPin className="w-3 h-3" aria-hidden /> Birthplace
        </label>
        <div className="flex gap-2 items-center">
          <input
            id="birth-place"
            value={query}
            placeholder="Start typing a city or town"
            onChange={(e) => setQuery(e.target.value)}
            className="field-input"
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="birth-place-results"
          />
          {value.placeName && (
            <button
              type="button"
              aria-label="Clear birthplace"
              {...trackProps(element)}
              onClick={clearPlace}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {searching && <p className="text-xs opacity-60">Searching…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {results.length > 0 && (
          <ul
            id="birth-place-results"
            role="listbox"
            className="absolute z-20 left-0 right-0 bg-white border border-border shadow-md max-h-60 overflow-auto"
          >
            {results.map((r) => (
              <li key={r.placeId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10"
                  {...trackProps(element)}
                  onClick={() => choose(r.placeId)}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {value.latitude !== undefined && value.longitude !== undefined && (
          <p className="text-xs opacity-60">
            {value.latitude.toFixed(2)}, {value.longitude.toFixed(2)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block"
          htmlFor="birth-zone"
        >
          Time zone at birth
        </label>
        <select
          id="birth-zone"
          value={zone ?? ''}
          onChange={(e) => onChange({ ...value, timeZone: e.target.value || undefined })}
          className="field-input"
        >
          <option value="">Not set</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <p className="text-xs opacity-60">
          Filled in from the birthplace. Needed when you add a birth time.
        </p>
      </div>
    </div>
  );
}

/** The birthDetails payload: the (locked) date plus whatever optional fields are set. */
export function birthDetailsPayload(date: string, extra: BirthTimePlace) {
  const timeZone = extra.timeZone ?? (extra.time ? browserZone : undefined);
  return {
    date,
    ...(extra.time ? { time: extra.time } : {}),
    ...(timeZone ? { timeZone } : {}),
    ...(extra.latitude !== undefined && extra.longitude !== undefined
      ? { latitude: extra.latitude, longitude: extra.longitude, placeName: extra.placeName }
      : {}),
  };
}

export function sameTimePlace(a: BirthTimePlace, b: BirthTimePlace): boolean {
  return (
    a.time === b.time &&
    a.timeZone === b.timeZone &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  );
}
