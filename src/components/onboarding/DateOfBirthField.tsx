import { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import {
  DOB_CONFIRM_LABEL,
  DOB_PERMANENT_BODY,
  DOB_PERMANENT_TITLE,
  earliestAllowedDob,
  formatDob,
  latestAllowedDob,
  validateDob,
  ageOn,
} from '../../utils/dob';

interface Props {
  value: string;
  onChange: (isoDate: string) => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}

/**
 * Date-of-birth entry with the permanent-change warning and a required confirmation checkbox.
 * The warning sits next to the field, not in a toast, so it cannot be missed or dismissed unread.
 */
export function DateOfBirthField({ value, onChange, confirmed, onConfirmedChange }: Props) {
  const [touched, setTouched] = useState(false);
  const error = touched ? validateDob(value) : null;
  const age = value ? ageOn(value) : null;

  return (
    <div className="space-y-3">
      <label
        className="text-[10px] uppercase tracking-[0.3em] font-black opacity-50 block"
        htmlFor="dob"
      >
        Date of birth *
      </label>
      <input
        id="dob"
        type="date"
        value={value}
        min={earliestAllowedDob()}
        max={latestAllowedDob()}
        onChange={(e) => {
          onChange(e.target.value);
          onConfirmedChange(false); // a new date needs a fresh confirmation
        }}
        onBlur={() => setTouched(true)}
        className="field-input"
        aria-describedby="dob-warning"
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      {!error && value && age !== null && (
        <p className="text-xs opacity-70">
          {formatDob(value)}. You will appear as <strong>{age}</strong>.
        </p>
      )}

      <div
        id="dob-warning"
        role="alert"
        className="border-2 border-amber-500 bg-amber-50 text-amber-950 p-4 space-y-2"
      >
        <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
          {DOB_PERMANENT_TITLE}
        </p>
        <p className="text-sm leading-relaxed">{DOB_PERMANENT_BODY}</p>
        <label className="flex items-start gap-3 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={!value || Boolean(validateDob(value))}
            onChange={(e) => onConfirmedChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-600"
          />
          <span className="text-sm font-bold">{DOB_CONFIRM_LABEL}</span>
        </label>
      </div>
    </div>
  );
}

/** Read-only display of a stored date of birth (profile screens). */
export function LockedDateOfBirth({ isoDate, hint }: { isoDate: string; hint: string }) {
  return (
    <div className="space-y-1">
      <div className="field-input flex items-center justify-between opacity-80" aria-readonly>
        <span>{formatDob(isoDate)}</span>
        <Lock className="w-4 h-4" aria-label="Locked" />
      </div>
      <p className="text-xs opacity-60">{hint}</p>
    </div>
  );
}
