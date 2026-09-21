import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  type Country,
  countryFlag,
  countryName,
  defaultCountry,
  dialCodeDisplay,
  groupDigits,
  lengthHint,
  maxNationalLength,
  nationalPart,
  onlyDigits,
  placeholderMask,
  searchCountries,
  splitE164,
  toE164,
  validateNational,
  validationMessage,
} from '../../lib/phone-numbers';

interface Props {
  label?: string;
  /** Reports the E.164 value and whether it is currently complete. */
  onChange: (value: { e164: string; isValid: boolean }) => void;
  /** Seeds the control from a stored number, selecting the matching country. */
  initialE164?: string;
  disabled?: boolean;
  /** Shows the reason the value was rejected, set by the form on failed submit. */
  showError?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
}

/**
 * Phone entry with an explicit country selector.
 *
 * The country code is chosen, visible, and sits OUTSIDE the text input, so there is nothing to guess:
 * the previous single field with a "+15551234567" placeholder left users unsure whether to type the
 * code at all, whether to keep their habitual leading zero, and how many digits to enter. Input is
 * capped at the selected country's length and the expected length is stated as help text.
 */
export function PhoneNumberInput({
  label = 'Phone number',
  onChange,
  initialE164,
  disabled = false,
  showError = false,
  onEnter,
  autoFocus = false,
}: Props) {
  const seeded = useMemo(() => (initialE164 ? splitE164(initialE164) : null), [initialE164]);
  const [country, setCountry] = useState<Country>(seeded?.country ?? defaultCountry());
  const [digits, setDigits] = useState<string>(seeded?.national ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const error = validateNational(digits, country);
  const isValid = error === null;

  useEffect(() => {
    onChange({ e164: toE164(digits, country), isValid });
    // `onChange` is intentionally excluded: callers commonly pass an inline lambda, which would make
    // this fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, country, isValid]);

  // Close the picker on outside click, so it behaves like a native select.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [pickerOpen]);

  const results = useMemo(() => searchCountries(query).slice(0, 60), [query]);

  const handleInput = (raw: string) => {
    // A pasted international number re-selects its own country rather than being silently mangled.
    if (raw.includes('+')) {
      const split = splitE164(raw);
      if (split) {
        setCountry(split.country);
        setDigits(split.national.slice(0, maxNationalLength(split.country)));
        return;
      }
    }
    const stripped = nationalPart(onlyDigits(raw), country);
    setDigits(stripped.slice(0, maxNationalLength(country)));
  };

  const selectCountry = (next: Country) => {
    // Re-clamp: moving from a 10-digit to an 8-digit country must not leave extra digits behind.
    setDigits((current) => current.slice(0, maxNationalLength(next)));
    setCountry(next);
    setPickerOpen(false);
    setQuery('');
  };

  const help = !digits
    ? `${countryName(country)} ${dialCodeDisplay(country)} is already added — just the ${lengthHint(country)}.`
    : isValid
      ? `We’ll text a code to ${dialCodeDisplay(country)} ${groupDigits(digits, country.dialCode)}`
      : `${lengthHint(country)} for ${countryName(country)} · ${digits.length} so far`;

  const showProblem = showError && !isValid;

  return (
    <div className="space-y-2">
      <label
        htmlFor="phone-national"
        className="block text-xs font-bold uppercase tracking-widest opacity-60"
      >
        {label}
      </label>

      <div
        className={`flex items-stretch border rounded overflow-visible ${
          showProblem ? 'border-red-400' : 'border-border'
        }`}
      >
        {/* Country selector — deliberately a separate control, not part of the text field. */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            aria-label={`Country: ${countryName(country)}, ${dialCodeDisplay(country)}`}
            className="h-full px-3 flex items-center gap-1.5 text-sm font-semibold border-r border-border hover:bg-bg transition-colors disabled:opacity-50 min-h-[44px]"
          >
            <span aria-hidden="true">{countryFlag(country)}</span>
            <span>{dialCodeDisplay(country)}</span>
            <ChevronDown className="w-3 h-3 opacity-50" aria-hidden="true" />
          </button>

          {pickerOpen && (
            <div className="absolute z-20 mt-1 w-72 max-h-80 overflow-auto bg-white border border-border shadow-lg">
              <div className="sticky top-0 bg-white border-b border-border p-2 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 opacity-40" aria-hidden="true" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search country or code"
                  aria-label="Search country or code"
                  className="w-full text-sm focus:outline-none placeholder:opacity-40"
                />
              </div>
              <ul role="listbox">
                {results.map((item) => (
                  <li key={item.iso2}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.iso2 === country.iso2}
                      onClick={() => selectCountry(item)}
                      className={`w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left text-sm hover:bg-bg transition-colors ${
                        item.iso2 === country.iso2 ? 'bg-bg' : ''
                      }`}
                    >
                      <span className="truncate">
                        <span aria-hidden="true">{countryFlag(item)}</span>{' '}
                        {countryName(item)}
                      </span>
                      <span className="opacity-55 font-semibold shrink-0">
                        {dialCodeDisplay(item)}
                      </span>
                    </button>
                  </li>
                ))}
                {results.length === 0 && (
                  <li className="px-3 py-4 text-xs opacity-50 italic">No country matches that.</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <input
          id="phone-national"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          value={groupDigits(digits, country.dialCode)}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) onEnter();
          }}
          disabled={disabled}
          placeholder={placeholderMask(country)}
          aria-label="Phone number, without the country code"
          aria-invalid={showProblem}
          aria-describedby="phone-help"
          className="flex-1 px-3 py-3 focus:outline-none placeholder:opacity-30 disabled:opacity-50 min-h-[44px]"
        />
      </div>

      <p
        id="phone-help"
        className={`text-xs italic ${showProblem ? 'text-red-600' : 'opacity-45'}`}
        role={showProblem ? 'alert' : undefined}
      >
        {showProblem && error ? validationMessage(error, country) : help}
      </p>
    </div>
  );
}
