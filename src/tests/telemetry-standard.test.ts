/**
 * Standardised telemetry on the web client: the generated backend catalog + `ui_interaction`
 * tracking (declarative `trackProps` + delegated listener, and imperative `resolveUiInteraction`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  Screen,
  SignalType,
  UiElement,
  UI_ELEMENTS,
  TELEMETRY_CATALOG_HASH,
  isUiElementId,
} from '../lib/analytics/generated/telemetryCatalog';
import {
  installUiTracking,
  resolveUiInteraction,
  trackProps,
  uiInteractionFromTarget,
  type TrackableElement,
  type UiInteraction,
} from '../lib/analytics/uiTracking';
import { APP_TAB_SCREEN } from '../lib/analytics/analytics';

/** Tiny element tree: enough DOM surface for `closest` / attributes without a browser. */
class FakeEl implements TrackableElement {
  constructor(private attrs: Record<string, string> = {}, public parent: FakeEl | null = null) {}
  getAttribute(n: string) {
    return n in this.attrs ? this.attrs[n] : null;
  }
  hasAttribute(n: string) {
    return n in this.attrs;
  }
  closest(selector: string): FakeEl | null {
    const attr = /^\[([^\]=]+)\]$/.exec(selector)?.[1];
    let cur: FakeEl | null = this;
    while (cur) {
      if (attr && cur.hasAttribute(attr)) return cur;
      cur = cur.parent;
    }
    return null;
  }
}

describe('generated telemetry catalog (backend-owned)', () => {
  it('is the synced backend artifact', () => {
    expect(TELEMETRY_CATALOG_HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(SignalType.UI_INTERACTION).toBe('ui_interaction');
  });

  it('every element id is <screen>.<subject> and maps to its home screen', () => {
    for (const [id, spec] of Object.entries(UI_ELEMENTS)) {
      expect(id).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(id.split('.')[0]).toBe(spec.screen.toLowerCase());
    }
  });

  it('web tabs map onto canonical catalog screens', () => {
    expect(APP_TAB_SCREEN).toEqual({
      DISCOVERY: Screen.DISCOVER,
      MATCHES: Screen.CHAT,
      LIKES: Screen.LIKES_YOU,
      PROFILE: Screen.PROFILE,
      SETTINGS: Screen.SETTINGS,
    });
  });
});

describe('resolveUiInteraction', () => {
  it('fills the default action from the registry', () => {
    expect(resolveUiInteraction(UiElement.DISCOVER_LIKE_BUTTON)).toEqual({ elementId: 'discover.like_button', action: 'tap' });
    expect(resolveUiInteraction(UiElement.CHAT_SEND_BUTTON)?.action).toBe('submit');
  });

  it('rejects unregistered ids, wrong actions and bad values', () => {
    expect(isUiElementId('discover.secret')).toBe(false);
    expect(resolveUiInteraction('discover.secret')).toBeNull();
    expect(resolveUiInteraction(UiElement.DISCOVER_LIKE_BUTTON, { action: 'toggle' })).toBeNull();
    expect(resolveUiInteraction(UiElement.NAV_TAB_SELECT)).toBeNull(); // value required
    expect(resolveUiInteraction(UiElement.NAV_TAB_SELECT, { value: 'MATCHES' })).toBeNull(); // must be canonical
    expect(resolveUiInteraction(UiElement.DISCOVER_LIKE_BUTTON, { value: 'x' })).toBeNull(); // takes no value
    expect(resolveUiInteraction(UiElement.LIKES_YOU_PROFILE_OPEN, { index: -1 })).toBeNull();
  });

  it('accepts a valued element with a catalog value', () => {
    expect(resolveUiInteraction(UiElement.NAV_TAB_SELECT, { value: Screen.CHAT })).toEqual({
      elementId: 'nav.tab_select',
      action: 'select',
      value: 'CHAT',
    });
  });
});

describe('declarative tracking (trackProps + delegated listener)', () => {
  it('resolves the closest tracked ancestor of a click target', () => {
    const button = new FakeEl(trackProps(UiElement.LIKES_YOU_PROFILE_OPEN, { index: 3, targetId: 'u7' }));
    const icon = new FakeEl({}, button);
    expect(uiInteractionFromTarget(icon)).toEqual({
      elementId: 'likes_you.profile_open',
      action: 'tap',
      index: 3,
      targetId: 'u7',
    });
  });

  it('ignores untracked and disabled elements', () => {
    expect(uiInteractionFromTarget(new FakeEl())).toBeNull();
    expect(uiInteractionFromTarget(new FakeEl({ ...trackProps(UiElement.CHAT_SEND_BUTTON), disabled: '' }))).toBeNull();
    expect(uiInteractionFromTarget(new FakeEl({ ...trackProps(UiElement.CHAT_SEND_BUTTON), 'aria-disabled': 'true' }))).toBeNull();
  });

  it('drops a hand-written (unregistered) data-track-id', () => {
    expect(uiInteractionFromTarget(new FakeEl({ 'data-track-id': 'my_button' }))).toBeNull();
  });

  it('installs one capture-phase click listener and emits for tracked clicks', () => {
    const listeners: Array<{ type: string; fn: (e: Event) => void; capture: unknown }> = [];
    const doc = {
      addEventListener: (type: string, fn: (e: Event) => void, capture: unknown) => listeners.push({ type, fn, capture }),
      removeEventListener: (type: string, fn: (e: Event) => void) => {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    } as unknown as Document;
    const emitted: UiInteraction[] = [];
    const uninstall = installUiTracking((i) => emitted.push(i), doc);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toMatchObject({ type: 'click', capture: true });

    listeners[0].fn({ target: new FakeEl(trackProps(UiElement.DISCOVER_PASS_BUTTON)) } as unknown as Event);
    listeners[0].fn({ target: new FakeEl() } as unknown as Event);
    expect(emitted).toEqual([{ elementId: 'discover.pass_button', action: 'tap' }]);

    uninstall();
    expect(listeners).toHaveLength(0);
  });
});

// ── Source-tree guards: every tracked element must come from the generated catalog ──
// These walk the shipped src tree (excluding the tests and the generated catalog itself) and assert
// that instrumentation never hand-writes an id: ids must be referenced as `UiElement.X` so a typo or
// a stale id fails `tsc`/this suite instead of silently polluting metrics.

const SRC_ROOT = new URL('../', import.meta.url).pathname;
const EXCLUDED_DIRS = ['/tests', '/lib/analytics/generated'];

function sourceFiles(dir = SRC_ROOT, exts = /\.(ts|tsx)$/): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return EXCLUDED_DIRS.some((ex) => path.endsWith(ex)) ? [] : sourceFiles(path, exts);
    }
    return exts.test(entry) ? [path] : [];
  });
}

describe('telemetry instrumentation uses only catalog ids', () => {
  it('never hand-writes a data-track-id or a string-literal id in trackProps/trackUi', () => {
    // A literal attribute value (`data-track-id="..."`) or a string first-arg to trackProps/trackUi
    // (`trackProps('...')`) bypasses the typed `UiElement` registry and is forbidden.
    const literalTrackId = /data-track-id\s*=\s*['"]/;
    const literalCallId = /\btrack(?:Props|Ui)\(\s*['"`]/;
    const offenders: string[] = [];
    for (const path of sourceFiles()) {
      const text = readFileSync(path, 'utf8');
      if (literalTrackId.test(text) || literalCallId.test(text)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it('every UiElement.X referenced in the app resolves to a registered catalog id', () => {
    const ref = /\bUiElement\.([A-Z0-9_]+)/g;
    const seen = new Set<string>();
    for (const path of sourceFiles(SRC_ROOT, /\.tsx$/)) {
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(ref)) seen.add(m[1]);
    }
    // The instrumentation work must actually reference the catalog somewhere.
    expect(seen.size).toBeGreaterThan(0);
    const unknown = [...seen].filter((name) => {
      const id = (UiElement as Record<string, string>)[name];
      return id === undefined || !isUiElementId(id);
    });
    expect(unknown).toEqual([]);
  });
});
