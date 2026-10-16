/**
 * Standardised UI-interaction tracking for the web client.
 *
 * Every tracked click / tap uses a UI element id from the backend-owned telemetry catalog
 * (`UiElement` in ./generated/telemetryCatalog.ts). Hand-written ids do not type-check, and the
 * ingest rejects unregistered ones, so the same button reports the same id on web, iOS and Android.
 *
 * Two equivalent ways to instrument an element:
 *
 *  1. Declarative (preferred for plain clickable elements) — spread {@link trackProps} onto it. A
 *     single delegated, capture-phase document listener ({@link installUiTracking}, started by
 *     `startAnalytics`) emits `ui_interaction` for the closest `[data-track-id]` ancestor of a click:
 *
 *       <button {...trackProps(UiElement.DISCOVER_PASS_BUTTON)} onClick={pass}>Pass</button>
 *       <button {...trackProps(UiElement.NAV_TAB_SELECT, { value: Screen.CHAT })} ...>
 *
 *  2. Imperative — call `trackUi(...)` from analytics.ts in handlers that are not DOM clicks
 *     (keyboard submit, gesture, programmatic) or that need runtime values.
 *
 * Never do both for the same element (it would double count).
 */
import {
  UI_ELEMENTS,
  ViewableScreen,
  isUiElementId,
  type UiAction,
  type UiElementId,
} from './generated/telemetryCatalog';

export const TRACK_ID_ATTR = 'data-track-id';
export const TRACK_VALUE_ATTR = 'data-track-value';
export const TRACK_INDEX_ATTR = 'data-track-index';
export const TRACK_TARGET_ATTR = 'data-track-target';
export const TRACK_ACTION_ATTR = 'data-track-action';
export const TRACK_CONTEXT_ATTR = 'data-track-context';

const VIEWABLE_SCREENS = new Set<string>(Object.values(ViewableScreen));

export interface UiTrackOptions {
  /** Standard verb; defaults to the element's first registered action. */
  action?: UiAction;
  /** Element-specific value; REQUIRED (and checked) when the element declares a value set. */
  value?: string;
  /** Position in a list / gallery. */
  index?: number;
  /** Opaque id of the entity acted on (user / match / media key). Never PII or content. */
  targetId?: string;
  /**
   * Host screen the interaction happened on. REQUIRED for SHARED elements (alerts, toasts, phone
   * field, voice recorder) and recommended for any element presented away from its home screen.
   * Must be a `ViewableScreen`; an unknown value is dropped (the rest of the signal is kept).
   */
  context?: string;
}

export interface UiInteraction extends UiTrackOptions {
  elementId: UiElementId;
  action: UiAction;
}

/**
 * Check a UI interaction against the catalog and fill the default action. Returns `null` (and the
 * caller drops the event) when it would be rejected server-side anyway — so bad instrumentation is
 * caught in development instead of silently polluting metrics.
 */
export function resolveUiInteraction(elementId: string, opts: UiTrackOptions = {}): UiInteraction | null {
  if (!isUiElementId(elementId)) return warn(`unregistered UI element id "${elementId}"`);
  const spec = UI_ELEMENTS[elementId];
  const action = opts.action ?? spec.actions[0];
  if (!spec.actions.includes(action)) return warn(`action "${action}" not allowed for ${elementId}`);
  if (spec.values) {
    // VALUE-OPTIONAL RULE (mirrors the server): an element with a declared value set does NOT
    // require a value when the action is `dismiss`, or when the action is `tap` on a `segmented`
    // element (opening a chooser is not choosing an option). A value, if sent, must still be valid.
    const valueOptional = action === 'dismiss' || (action === 'tap' && spec.kind === 'segmented');
    if (opts.value !== undefined) {
      if (!spec.values.includes(opts.value)) {
        return warn(`value "${opts.value}" not in [${spec.values.join(', ')}] for ${elementId}`);
      }
    } else if (!valueOptional) {
      return warn(`value required (one of [${spec.values.join(', ')}]) for ${elementId}`);
    }
  } else if (opts.value !== undefined) {
    return warn(`${elementId} does not take a value`);
  }
  if (opts.index !== undefined && (!Number.isInteger(opts.index) || opts.index < 0)) {
    return warn(`index must be a non-negative integer for ${elementId}`);
  }
  const out: UiInteraction = { elementId, action };
  if (opts.value !== undefined) out.value = opts.value;
  if (opts.index !== undefined) out.index = opts.index;
  if (opts.targetId) out.targetId = opts.targetId;
  // Host screen (SHARED elements and off-home presentations). An unknown screen is dropped so a
  // stray value can never cost us the core interaction (mirrors the server's dropInvalid behaviour).
  if (opts.context !== undefined && VIEWABLE_SCREENS.has(opts.context)) out.context = opts.context;
  return out;
}

function warn(msg: string): null {
  if (import.meta.env?.DEV) console.warn(`[telemetry] ${msg} — event dropped`);
  return null;
}

/** Data attributes that make an element tracked by the delegated listener. */
export function trackProps(elementId: UiElementId, opts: UiTrackOptions = {}): Record<string, string> {
  const props: Record<string, string> = { [TRACK_ID_ATTR]: elementId };
  if (opts.action !== undefined) props[TRACK_ACTION_ATTR] = opts.action;
  if (opts.value !== undefined) props[TRACK_VALUE_ATTR] = opts.value;
  if (opts.index !== undefined) props[TRACK_INDEX_ATTR] = String(opts.index);
  if (opts.targetId) props[TRACK_TARGET_ATTR] = opts.targetId;
  if (opts.context !== undefined) props[TRACK_CONTEXT_ATTR] = opts.context;
  return props;
}

/** The minimal DOM surface the resolver needs (keeps it unit-testable without a browser). */
export interface TrackableElement {
  closest(selector: string): TrackableElement | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

/** Resolve a click target to the UI interaction it represents, or `null` if untracked / disabled. */
export function uiInteractionFromTarget(target: TrackableElement | null): UiInteraction | null {
  const el = target?.closest(`[${TRACK_ID_ATTR}]`) ?? null;
  if (!el) return null;
  // A disabled control's click is not an interaction.
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;
  const id = el.getAttribute(TRACK_ID_ATTR) ?? '';
  const indexAttr = el.getAttribute(TRACK_INDEX_ATTR);
  return resolveUiInteraction(id, {
    action: (el.getAttribute(TRACK_ACTION_ATTR) as UiAction | null) ?? undefined,
    value: el.getAttribute(TRACK_VALUE_ATTR) ?? undefined,
    index: indexAttr === null ? undefined : Number(indexAttr),
    targetId: el.getAttribute(TRACK_TARGET_ATTR) ?? undefined,
    context: el.getAttribute(TRACK_CONTEXT_ATTR) ?? undefined,
  });
}

/**
 * Install the single delegated click listener. Capture phase, so handlers that stopPropagation()
 * are still counted. Returns an uninstall function. Idempotent per document.
 */
export function installUiTracking(
  emit: (interaction: UiInteraction) => void,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'> | undefined = typeof document !== 'undefined'
    ? document
    : undefined
): () => void {
  if (!doc) return () => {};
  const listener = (e: Event) => {
    const t = e.target as unknown;
    const target =
      t && typeof (t as TrackableElement).closest === 'function' ? (t as TrackableElement) : null;
    const interaction = uiInteractionFromTarget(target);
    if (interaction) emit(interaction);
  };
  doc.addEventListener('click', listener, true);
  return () => doc.removeEventListener('click', listener, true);
}
