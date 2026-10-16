/**
 * Static "no untracked control" guard for Web.
 *
 * Every JSX element in the shipped product surface that is a user-pressable control — an intrinsic
 * (lowercase) host element OR a member-expression host wrapper (`motion.button`, `motion.a`, …) that
 * has a PRESS handler (`onClick` / `onMouseDown` / `onMouseUp` / `onPointerDown` / `onPointerUp` /
 * `onTouchStart` / `onTouchEnd` / `onDoubleClick` / `onContextMenu`), a KEYBOARD handler
 * (`onKeyDown` / `onKeyUp`) on a non-input element, or is an `<a>` with user-navigation `href` — must
 * either spread `trackProps(...)` or carry `data-track-exempt="…"` (a valid `<category>: <reason>`
 * with reason >= 8 chars). Parsing uses the TypeScript compiler API (see ./telemetry-guard-scan.ts),
 * not regex, so multi-line opening tags and member-expression tags are handled robustly.
 *
 * The product surface is defined by REACHABILITY from the entry (`main.tsx`): a file is scanned iff
 * the shipped app can import it (`.tsx`/`.jsx`, or a `.ts` that contains JSX). There is NO
 * hand-maintained exclusion list — only tests and the generated catalog are skipped. Files the entry
 * cannot reach are genuinely dead code; the second test pins that unreachable set so the blind spot
 * stays small, visible and reviewed.
 */
import { relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { scanAll, scanSource, unreachableTsxFiles, type Offender } from './telemetry-guard-scan';

const SRC_ROOT = new URL('../', import.meta.url).pathname;

/**
 * Provably-unreachable `.tsx` under src: dead code the shipped entry can never import, so it carries
 * no live user press. Pinned here so making a file reachable (or orphaning a new one) trips the guard.
 */
const EXPECTED_UNREACHABLE = [
  'app/RightSidebar.tsx',
  'app/StoriesTray.tsx',
  'app/StoryViewerModal.tsx',
  'components/brand/OneHookLogo.tsx',
  'components/profile/PreferencesPanel.tsx',
  'features/matches/MatchesView.tsx',
];

describe('web no-untracked-control guard', () => {
  it('every interaction site is tracked or explicitly exempt', () => {
    const offenders = scanAll(SRC_ROOT).map(
      (o) => `${relative(SRC_ROOT, o.file)}:${o.line} <${o.tag}> [${o.problem}${o.detail ? ': ' + o.detail : ''}] ${o.snippet}`
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the provably-unreachable surface bounded and documented', () => {
    const unreachable = unreachableTsxFiles(SRC_ROOT).map((f) => relative(SRC_ROOT, f));
    // Pinned exactly: dead code is the only surface the guard does not scan, and it must stay small.
    expect(unreachable).toEqual(EXPECTED_UNREACHABLE);
    expect(unreachable.length).toBeLessThan(40);
  });
});

/**
 * Loophole self-tests. Each closed blind spot is pinned with (1) a synthetic UNTRACKED snippet fed to
 * the scanner, proving the control is now CAUGHT, and (2) a tracked / validly-exempt equivalent,
 * proving a correctly-instrumented control still PASSES. These lock the scanner's behaviour so a
 * future "simplification" that reopens a hole fails here, loudly, with a minimal reproduction.
 */
describe('scanner loophole self-tests', () => {
  const problems = (code: string, file = 'synthetic.tsx'): Offender['problem'][] =>
    scanSource(file, code).map((o) => o.problem);

  // Wrap a snippet so it parses as a component body.
  const jsx = (inner: string) => `export const C = () => (${inner});`;

  describe('(b) press handler props are controls', () => {
    for (const prop of [
      'onClick',
      'onMouseDown',
      'onMouseUp',
      'onPointerDown',
      'onPointerUp',
      'onTouchStart',
      'onTouchEnd',
      'onDoubleClick',
      'onContextMenu',
    ]) {
      it(`catches an untracked <div ${prop}> and passes the tracked / exempt forms`, () => {
        expect(problems(jsx(`<div ${prop}={f} />`))).toEqual(['untracked']);
        expect(problems(jsx(`<div ${prop}={f} {...trackProps(UiElement.X)} />`))).toEqual([]);
        expect(problems(jsx(`<div ${prop}={f} data-track-exempt="duplicate: emitted in the handler via trackUi" />`))).toEqual([]);
      });
    }
  });

  describe('(b) keyboard handlers count only on non-input elements', () => {
    for (const prop of ['onKeyDown', 'onKeyUp']) {
      it(`catches an untracked non-input <div ${prop}>`, () => {
        expect(problems(jsx(`<div role="button" ${prop}={f} />`))).toEqual(['untracked']);
        expect(problems(jsx(`<div role="button" ${prop}={f} {...trackProps(UiElement.X)} />`))).toEqual([]);
      });
      for (const tag of ['input', 'textarea', 'select', 'form']) {
        it(`ignores <${tag} ${prop}> (text entry / Enter-submit, not a discrete press)`, () => {
          expect(problems(jsx(`<${tag} ${prop}={f} />`))).toEqual([]);
        });
      }
    }
  });

  describe('(b) member-expression tags (motion.*) are controls; components are not', () => {
    it('catches an untracked motion.button / motion.div / motion.a', () => {
      expect(problems(jsx('<motion.button onClick={f} />'))).toEqual(['untracked']);
      expect(problems(jsx('<motion.div onPointerDown={f} />'))).toEqual(['untracked']);
      expect(problems(jsx('<motion.a href="/x" onClick={f} />'))).toEqual(['untracked']);
    });
    it('passes a tracked motion.button and a validly-exempt motion.div backdrop', () => {
      expect(problems(jsx('<motion.button onClick={f} {...trackProps(UiElement.X)} />'))).toEqual([]);
      expect(problems(jsx('<motion.div onClick={onClose} data-track-exempt="backdrop: click-away that closes the sheet" />'))).toEqual([]);
    });
    it('does NOT treat an uppercase component tag as a control (its own file is scanned)', () => {
      expect(problems(jsx('<MenuItem onClick={f} />'))).toEqual([]);
      expect(problems(jsx('<AlienScanner onClick={f} />'))).toEqual([]);
    });
  });

  describe('(b) JSX in .jsx / .ts files is scanned', () => {
    it('catches an untracked control in a .jsx file', () => {
      expect(problems(jsx('<button onClick={f} />'), 'widget.jsx')).toEqual(['untracked']);
    });
    it('catches an untracked control in a .ts file that contains JSX', () => {
      expect(problems(jsx('<button onPointerDown={f} />'), 'helper.ts')).toEqual(['untracked']);
    });
  });

  describe('malformed exemptions remain a failure (no silent skip)', () => {
    it('flags an unknown category and a too-short reason', () => {
      expect(problems(jsx('<button onClick={f} data-track-exempt="nonsense: a real sentence here" />'))).toEqual(['bad-exempt']);
      expect(problems(jsx('<button onClick={f} data-track-exempt="duplicate: short" />'))).toEqual(['bad-exempt']);
      expect(problems(jsx('<button onClick={f} data-track-exempt="no colon at all here" />'))).toEqual(['bad-exempt']);
    });
  });
});
