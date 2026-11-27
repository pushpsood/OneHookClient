import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mail, Phone, Send, UserRound, X } from 'lucide-react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { ICON_SECTION } from '../../lib/icon-tokens';
import {
  EMPTY_CONTACT_FORM,
  MAX_CONTACT_TEXT,
  buildSelectedContactPayload,
  contactPickerProperties,
  contactsManager,
  draftFromForm,
  normalizeRows,
  pickContact,
  selectAll,
  validateContactForm,
  type ContactDraft,
  type ContactFormValues,
  type ContactSelection,
} from '../../lib/contact-share';

/**
 * Sending a contact card (attachment menu → Contact).
 *
 * Where the browser has the Contact Picker API (Chrome on Android) the menu opens the device's picker
 * straight away; the picked card is then reviewed here, and the member unticks any phone or email they
 * do not want to share (all are included by default). Everywhere else this sheet is a small form:
 * a name (required), phones and emails; everything typed is sent.
 *
 * The card is sent like any message: framed as structured content and sealed end to end on device.
 */

// ── Opening ──────────────────────────────────────────────────────────────────

/** Square JPEG of the contact photo, base64 without the data: prefix. Null when it cannot be drawn. */
async function encodeSquareJpeg(blob: Blob, size: number, quality: number): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (!side) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    const url = canvas.toDataURL('image/jpeg', quality);
    const comma = url.indexOf(',');
    return url.startsWith('data:image/jpeg') && comma > 0 ? url.slice(comma + 1) : null;
  } finally {
    bitmap.close?.();
  }
}

export interface ContactShareState {
  open: boolean;
  /** The picked contact under review, or null for the manual form. */
  picked: ContactDraft | null;
  pickerAvailable: boolean;
}

/**
 * Opens the contact flow. `openContact` must be called from the menu's click handler: the browser
 * only opens its contact picker during a user gesture.
 */
export function useContactShare() {
  const [state, setState] = useState<ContactShareState>({ open: false, picked: null, pickerAvailable: false });
  // The picker's supported properties are read ahead of time, so the click itself only calls select().
  const supported = useRef<string[] | null>(null);
  useEffect(() => {
    const manager = contactsManager();
    if (!manager?.getProperties) return;
    manager
      .getProperties()
      .then((props) => {
        supported.current = props;
      })
      .catch(() => undefined);
  }, []);

  const runPicker = useCallback((keepOpenOnCancel: boolean) => {
    const manager = contactsManager();
    if (!manager) {
      setState({ open: true, picked: null, pickerAvailable: false });
      return;
    }
    void pickContact(manager, contactPickerProperties(supported.current), encodeSquareJpeg).then((result) => {
      if (result.kind === 'picked') setState({ open: true, picked: result.draft, pickerAvailable: true });
      // The picker could not open here: fall back to typing the contact in.
      else if (result.kind === 'failed') setState({ open: true, picked: null, pickerAvailable: false });
      // Cancelled: nothing to send. A sheet already open (choosing another contact) stays as it was.
      else if (!keepOpenOnCancel) setState((prev) => ({ ...prev, open: false }));
    });
  }, []);

  const openContact = useCallback(() => runPicker(false), [runPicker]);
  const pickAgain = useCallback(() => runPicker(true), [runPicker]);
  const close = useCallback(() => setState((prev) => ({ ...prev, open: false, picked: null })), []);

  return { state, openContact, pickAgain, close };
}

// ── The sheet ────────────────────────────────────────────────────────────────

interface ContactShareSheetProps {
  state: ContactShareState;
  peerName: string;
  onPickAgain: () => void;
  onClose: () => void;
  /** Sends the framed card. Throws (with a message to show) when it could not be sent. */
  onSend: (payload: Record<string, unknown>) => Promise<void>;
}

export function ContactShareSheet({ state, peerName, onPickAgain, onClose, onSend }: ContactShareSheetProps) {
  const [values, setValues] = useState<ContactFormValues>(EMPTY_CONTACT_FORM);
  const [nameTouched, setNameTouched] = useState(false);
  const [selection, setSelection] = useState<ContactSelection>({ phones: [], emails: [] });
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.open) return;
    setValues(EMPTY_CONTACT_FORM);
    setNameTouched(false);
    setBusy(false);
    setSendError(null);
  }, [state.open]);

  useEffect(() => {
    setSelection(state.picked ? selectAll(state.picked) : { phones: [], emails: [] });
  }, [state.picked]);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, busy, onClose]);

  if (!state.open) return null;

  const send = async () => {
    let payload: Record<string, unknown>;
    if (state.picked) {
      payload = buildSelectedContactPayload(state.picked, selection);
    } else {
      setNameTouched(true);
      if (!validateContactForm(values).valid) return;
      const draft = draftFromForm(values);
      payload = buildSelectedContactPayload(draft, selectAll(draft));
    }
    setBusy(true);
    setSendError(null);
    try {
      await onSend(payload);
      onClose();
    } catch (err) {
      setSendError(err instanceof Error && err.message ? err.message : "That contact couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContactShareSheetView
      peerName={peerName}
      picked={state.picked}
      pickerAvailable={state.pickerAvailable}
      values={values}
      nameTouched={nameTouched}
      selection={selection}
      busy={busy}
      sendError={sendError}
      onChangeValues={(next) => setValues({ ...next, phones: normalizeRows(next.phones), emails: normalizeRows(next.emails) })}
      onTouchName={() => setNameTouched(true)}
      onToggle={(field, index, included) =>
        setSelection((prev) => {
          const list = [...prev[field]];
          list[index] = included;
          return { ...prev, [field]: list };
        })
      }
      onPickAgain={onPickAgain}
      onClose={onClose}
      onSend={() => void send()}
    />
  );
}

export interface ContactShareSheetViewProps {
  peerName: string;
  picked: ContactDraft | null;
  pickerAvailable: boolean;
  values: ContactFormValues;
  nameTouched: boolean;
  selection: ContactSelection;
  busy: boolean;
  sendError: string | null;
  onChangeValues: (values: ContactFormValues) => void;
  onTouchName: () => void;
  onToggle: (field: 'phones' | 'emails', index: number, included: boolean) => void;
  onPickAgain: () => void;
  onClose: () => void;
  onSend: () => void;
}

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-secondary/60 focus:outline-none focus:border-accent';

/** The sheet's markup, without effects (rendered statically in tests). */
export function ContactShareSheetView({
  peerName,
  picked,
  pickerAvailable,
  values,
  nameTouched,
  selection,
  busy,
  sendError,
  onChangeValues,
  onTouchName,
  onToggle,
  onPickAgain,
  onClose,
  onSend,
}: ContactShareSheetViewProps) {
  const validation = validateContactForm(values);
  const canSend = !busy && (picked ? true : validation.valid);
  const nameError = nameTouched ? validation.errors.name : undefined;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !busy && onClose()}
      data-track-exempt="backdrop: click-away that closes the contact sheet; the close button (chat.attach_button dismiss) is tracked."
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-share-title"
        className="w-full max-w-sm bg-surface-card text-text border border-border shadow-2xl rounded-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: dialog container; only stops clicks inside the sheet from closing it."
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 id="contact-share-title" className="text-base font-bold">
            Share a contact
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            {...trackProps(UiElement.CHAT_ATTACH_BUTTON, { action: 'dismiss' })}
            className={`${ICON_SECTION.modalHeader.button} disabled:opacity-40`}
          >
            <X className={ICON_SECTION.modalHeader.icon} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto min-h-0">
          {picked ? (
            <PickedReview picked={picked} selection={selection} busy={busy} onToggle={onToggle} />
          ) : (
            <ManualForm
              values={values}
              nameError={nameError}
              rowErrors={validation.errors}
              busy={busy}
              onChangeValues={onChangeValues}
              onTouchName={onTouchName}
            />
          )}

          {picked && pickerAvailable && (
            <button
              type="button"
              onClick={onPickAgain}
              disabled={busy}
              {...trackProps(UiElement.CHAT_ATTACH_OPTION, { value: 'contact' })}
              className="text-xs font-semibold underline hover:opacity-70 cursor-pointer disabled:opacity-40"
            >
              Choose another contact
            </button>
          )}

          {sendError && (
            <p className="text-xs text-red-500" role="alert">
              {sendError}
            </p>
          )}
          <p className="text-[10px] text-text-secondary leading-snug">
            {peerName} gets these details as a contact card, end-to-end encrypted.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            {...trackProps(UiElement.CHAT_SEND_BUTTON)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ig-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            {busy ? 'Sending…' : 'Send contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickedReview({
  picked,
  selection,
  busy,
  onToggle,
}: {
  picked: ContactDraft;
  selection: ContactSelection;
  busy: boolean;
  onToggle: (field: 'phones' | 'emails', index: number, included: boolean) => void;
}) {
  const hasFields = picked.phones.length > 0 || picked.emails.length > 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {picked.thumbnailBase64 ? (
          <img
            src={`data:image/jpeg;base64,${picked.thumbnailBase64}`}
            alt=""
            aria-hidden="true"
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full shrink-0 bg-surface-hover flex items-center justify-center" aria-hidden="true">
            <UserRound className="w-6 h-6" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold break-words">{picked.displayName}</p>
          {picked.organization && <p className="text-xs opacity-70 break-words">{picked.organization}</p>}
        </div>
      </div>
      {hasFields && (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-xs text-text-secondary mb-1">Choose what to share</legend>
          {picked.phones.map((phone, i) => (
            <label key={`p${i}`} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selection.phones[i] !== false}
                onChange={(e) => onToggle('phones', i, e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <Phone className="w-3.5 h-3.5 opacity-60 shrink-0" aria-hidden="true" />
              <span className="break-all tabular-nums">{phone.value}</span>
              {phone.label && <span className="text-xs opacity-60">{phone.label}</span>}
            </label>
          ))}
          {picked.emails.map((email, i) => (
            <label key={`e${i}`} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selection.emails[i] !== false}
                onChange={(e) => onToggle('emails', i, e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <Mail className="w-3.5 h-3.5 opacity-60 shrink-0" aria-hidden="true" />
              <span className="break-all">{email.value}</span>
              {email.label && <span className="text-xs opacity-60">{email.label}</span>}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function ManualForm({
  values,
  nameError,
  rowErrors,
  busy,
  onChangeValues,
  onTouchName,
}: {
  values: ContactFormValues;
  nameError?: string;
  rowErrors: { phones: (string | undefined)[]; emails: (string | undefined)[] };
  busy: boolean;
  onChangeValues: (values: ContactFormValues) => void;
  onTouchName: () => void;
}) {
  const setRow = (field: 'phones' | 'emails', index: number, value: string) => {
    const rows = [...values[field]];
    rows[index] = value;
    onChangeValues({ ...values, [field]: rows });
  };
  return (
    <fieldset className="space-y-3" disabled={busy}>
      <div className="space-y-1">
        <label htmlFor="contact-share-name" className="text-xs font-semibold">
          Name
        </label>
        <input
          id="contact-share-name"
          type="text"
          autoComplete="off"
          maxLength={MAX_CONTACT_TEXT}
          value={values.name}
          onChange={(e) => onChangeValues({ ...values, name: e.target.value })}
          onBlur={onTouchName}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? 'contact-share-name-error' : undefined}
          className={INPUT}
        />
        {nameError && (
          <p id="contact-share-name-error" className="text-xs text-red-500">
            {nameError}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-share-org" className="text-xs font-semibold">
          Organization <span className="font-normal text-text-secondary">(optional)</span>
        </label>
        <input
          id="contact-share-org"
          type="text"
          autoComplete="off"
          maxLength={MAX_CONTACT_TEXT}
          value={values.organization}
          onChange={(e) => onChangeValues({ ...values, organization: e.target.value })}
          className={INPUT}
        />
      </div>
      <RowGroup
        label="Phone numbers"
        field="phones"
        type="tel"
        rows={values.phones}
        errors={rowErrors.phones}
        onChange={setRow}
      />
      <RowGroup
        label="Email addresses"
        field="emails"
        type="email"
        rows={values.emails}
        errors={rowErrors.emails}
        onChange={setRow}
      />
    </fieldset>
  );
}

function RowGroup({
  label,
  field,
  type,
  rows,
  errors,
  onChange,
}: {
  label: string;
  field: 'phones' | 'emails';
  type: 'tel' | 'email';
  rows: string[];
  errors: (string | undefined)[];
  onChange: (field: 'phones' | 'emails', index: number, value: string) => void;
}) {
  const singular = field === 'phones' ? 'Phone number' : 'Email address';
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">
        {label} <span className="font-normal text-text-secondary">(optional)</span>
      </p>
      {rows.map((value, i) => (
        <div key={`${field}${i}`} className="space-y-1">
          <input
            type={type}
            inputMode={type}
            autoComplete="off"
            maxLength={MAX_CONTACT_TEXT}
            value={value}
            onChange={(e) => onChange(field, i, e.target.value)}
            aria-label={`${singular} ${i + 1}`}
            aria-invalid={Boolean(errors[i])}
            placeholder={i === rows.length - 1 && rows.length > 1 ? `Add another ${singular.toLowerCase()}` : undefined}
            className={INPUT}
          />
          {errors[i] && <p className="text-xs text-red-500">{errors[i]}</p>}
        </div>
      ))}
    </div>
  );
}
