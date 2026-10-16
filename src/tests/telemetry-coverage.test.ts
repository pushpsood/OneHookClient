/**
 * Cross-platform PARITY / COVERAGE test for Web.
 *
 * The set of catalog UI elements REFERENCED in shipped source (via `UiElement.X`, whether spread as
 * `trackProps(UiElement.X)` or passed to the imperative `trackUi(UiElement.X)`) must EXACTLY equal
 * the set in scope for Web (`uiElementsForPlatform('web')`, derived from the backend parity ledger).
 *
 *  - An in-scope element with no reference  => an untracked control (fails `missing`).
 *  - A referenced element out of scope       => an undeclared platform divergence (fails `extra`);
 *    the analytics ingest would reject it (`element_not_on_platform`).
 *
 * "Referenced" is computed from REAL CODE ONLY: {@link referencedUiElementNames} walks the TS AST of
 * every reachable source file and collects `UiElement.X` PropertyAccessExpressions. A mention of
 * `UiElement.X` inside a comment or a string literal is NOT an AST property access and so does not
 * count — coverage reflects what actually fires for a user, in files the shipped app can reach.
 *
 * Closing a real gap means instrumenting the control AND deleting its line from the backend's
 * parity/web.ts; adding a Web-only exception means gapping it there. Either way this test and the
 * server stay in lockstep.
 */
import { describe, it, expect } from 'vitest';
import {
  UiElement,
  uiElementsForPlatform,
  isUiElementId,
  type UiElementId,
} from '../lib/analytics/generated/telemetryCatalog';
import { referencedUiElementNames, referencedUiElementNamesInSource } from './telemetry-guard-scan';

const SRC_ROOT = new URL('../', import.meta.url).pathname;

/** Every catalog id referenced as real-code `UiElement.X` in shipped (reachable) source. */
function referencedElementIds(): Set<UiElementId> {
  const ids = new Set<UiElementId>();
  for (const name of referencedUiElementNames(SRC_ROOT)) {
    const id = (UiElement as Record<string, string>)[name];
    if (id && isUiElementId(id)) ids.add(id);
  }
  return ids;
}

describe('web telemetry coverage == parity scope', () => {
  const inScope = new Set(uiElementsForPlatform('web'));
  const referenced = referencedElementIds();

  it('references at least one catalog element (sanity)', () => {
    expect(referenced.size).toBeGreaterThan(50);
  });

  it('every in-scope element is instrumented (no untracked controls)', () => {
    const missing = [...inScope].filter((id) => !referenced.has(id)).sort();
    expect(missing).toEqual([]);
  });

  it('no out-of-scope element is referenced (no undeclared divergence)', () => {
    const extra = [...referenced].filter((id) => !inScope.has(id)).sort();
    expect(extra).toEqual([]);
  });

  it('the two sets are identical', () => {
    expect([...referenced].sort()).toEqual([...inScope].sort());
  });
});

/**
 * (c) loophole self-test: "referenced" is REAL CODE ONLY. A `UiElement.X` access as an actual
 * PropertyAccessExpression counts; the identical text inside a comment or a string literal does not.
 * This proves a control cannot be "covered" merely by being named in a doc comment or a string.
 */
describe('coverage reference extraction is AST-based (not comments/strings)', () => {
  it('counts a real UiElement.X access', () => {
    const names = referencedUiElementNamesInSource('synthetic.tsx', 'const a = trackProps(UiElement.DISCOVER_LIKE_BUTTON);');
    expect([...names]).toEqual(['DISCOVER_LIKE_BUTTON']);
  });

  it('ignores UiElement.X mentioned only in a comment or a string literal', () => {
    const src = [
      '// see UiElement.DISCOVER_PASS_BUTTON for the pass control',
      '/* block: UiElement.CHAT_SEND_BUTTON */',
      'const label = "UiElement.PROFILE_EDIT_SAVE";',
      "const other = 'uses UiElement.SETTINGS_SIGN_OUT somewhere';",
      'const real = trackUi(UiElement.NAV_TAB_SELECT);',
    ].join('\n');
    const names = referencedUiElementNamesInSource('synthetic.tsx', src);
    // Only the real property access survives.
    expect([...names].sort()).toEqual(['NAV_TAB_SELECT']);
  });

  it('also distinguishes real code from comments/strings in a .ts file', () => {
    const src = 'const s = "UiElement.LANDING_LOGIN"; const r = UiElement.LANDING_GET_STARTED;';
    const names = referencedUiElementNamesInSource('helper.ts', src);
    expect([...names].sort()).toEqual(['LANDING_GET_STARTED']);
  });
});
