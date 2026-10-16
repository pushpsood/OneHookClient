/**
 * Static "no untracked control" scanner (shared by the guard test, the coverage test and ad-hoc
 * audits).
 *
 * Uses the TypeScript compiler API (already a dependency) — never regex — for three things:
 *
 *  1. REACHABILITY. Starting at the app entry (`src/main.tsx` -> `App.tsx`), it follows every static
 *     `import ... from './x'` AND every dynamic `import('./x')` to build the set of first-party
 *     modules the shipped app can actually load. The product control surface is every reachable file
 *     that can host JSX (`.tsx`/`.jsx`, plus any `.ts` that actually contains JSX). There is NO
 *     hand-maintained exclusion list: a file is scanned iff the app can reach it. Only tests and the
 *     generated catalog are skipped, plus files that are genuinely unreachable from the entry (the
 *     guard test asserts that unreachable set so it stays visible and bounded).
 *
 *  2. CONTROLS. Within each reachable file it finds every JSX element that is a user-pressable
 *     control and reports the ones that are neither tracked nor validly exempt. A control is either
 *     an INTRINSIC (lowercase) host element — `<button>`, `<div>`, `<svg>` … — or a MEMBER-EXPRESSION
 *     host wrapper — `motion.button`, `motion.a`, `motion.div` … — whose underlying intrinsic lives
 *     in `node_modules` and so is never scanned on its own. An element is a control when it carries
 *     one of:
 *       • a PRESS handler (`onClick`, `onMouseDown`, `onMouseUp`, `onPointerDown`, `onPointerUp`,
 *         `onTouchStart`, `onTouchEnd`, `onDoubleClick`, `onContextMenu`), or
 *       • a KEYBOARD activation handler (`onKeyDown` / `onKeyUp`) on a NON-input element, or
 *       • an `<a>` (or `motion.a`) with a non-anchor `href` (user navigation).
 *     Uppercase component tags (`<MenuItem>`, `<AlienScanner>`) are NOT controls: their own
 *     definition's intrinsic elements are what get scanned, and tracked wrappers forward tracking.
 *
 *     Keyboard handlers count ONLY on non-input elements. A key handler on an `<input>`/`<textarea>`/
 *     `<select>`/`<form>` is text entry or an Enter-to-submit whose committed value is tracked at the
 *     submit control (or is a `continuous:` stream) — not a discrete press. On any other element
 *     (a `role="button"` div, a roving-tabindex `role="tablist"`, an interactive `<svg>`, …) a key
 *     handler drives a real activation and MUST be tracked.
 *
 *  3. COVERAGE INPUT. {@link referencedUiElementNames} extracts every catalog id used as REAL CODE
 *     (`UiElement.X`, an AST PropertyAccessExpression — never a mention in a comment or string) in
 *     the reachable surface, so the coverage test measures what actually ships.
 *
 * A control is satisfied when it carries a `trackProps(...)` spread (via `data-track-id`) or a
 * `data-track-exempt="<category>: <reason>"` attribute whose category is one of the catalog's
 * TELEMETRY_EXEMPT_CATEGORIES and whose reason is >= 8 chars. A malformed exemption (unknown/missing
 * category, missing reason) is itself a guard failure — a user press may only be skipped for one of
 * the catalog's reviewed reasons.
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { TELEMETRY_EXEMPT_CATEGORIES } from '../lib/analytics/generated/telemetryCatalog';

export interface Offender {
  file: string;
  line: number;
  tag: string;
  snippet: string;
  /** Why it failed: an untracked control, or a malformed exempt annotation. */
  problem: 'untracked' | 'bad-exempt';
  detail?: string;
}

const EXEMPT_CATEGORIES = new Set<string>(TELEMETRY_EXEMPT_CATEGORIES);

/** Extensions that can host JSX controls / `UiElement` references. */
const CONTROL_EXT = /\.(tsx|jsx|ts)$/;

/** Tests + generated code are never part of the product control surface. */
function isSkippable(path: string): boolean {
  return path.includes('/tests/') || path.includes('/lib/analytics/generated/');
}

/**
 * Parse any source as TSX. TSX is a superset of TS for our read-only AST needs (finding JSX elements
 * and `UiElement.X` accesses); the one construct it would misread — `<T>value` angle-bracket type
 * assertions — is not used anywhere in this codebase (`as` is used instead), so this is safe and
 * lets us detect JSX even in a (non-conventional) `.ts` file.
 */
function parseTsx(file: string, text: string = readFileSync(file, 'utf8')): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** True when the source contains any JSX element / fragment. */
function containsJsx(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// ── Reachability (TS compiler API) ────────────────────────────────────────────

/** Resolve a first-party module specifier to an on-disk source file, or null for externals. */
function resolveModule(spec: string, importerFile: string, srcRoot: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(importerFile), spec);
  else return null; // bare import = node_modules / external
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Every static + dynamic import specifier in a source file. */
function importSpecifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    // import x from '...'  /  export ... from '...'
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    }
    // import('...')
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

/** BFS the module graph from the entry; returns every reachable first-party source file. */
export function reachableFiles(srcRoot: string, entry = join(srcRoot, 'main.tsx')): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const spec of importSpecifiers(file)) {
      const resolved = resolveModule(spec, file, srcRoot);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

/**
 * Reachable files that make up the product control surface: every reachable `.tsx`/`.jsx`, plus any
 * reachable `.ts` that actually contains JSX (unconventional, but if present it ships controls too).
 * Tests + generated code excluded.
 */
export function reachableControlFiles(srcRoot: string): string[] {
  const out: string[] = [];
  for (const f of reachableFiles(srcRoot)) {
    if (isSkippable(f) || !CONTROL_EXT.test(f)) continue;
    if (f.endsWith('.tsx') || f.endsWith('.jsx')) {
      out.push(f);
    } else if (containsJsx(parseTsx(f))) {
      // .ts that nonetheless contains JSX.
      out.push(f);
    }
  }
  return out.sort();
}

/** Back-compat alias: the reachable `.tsx` subset of the control surface. */
export function reachableTsxFiles(srcRoot: string): string[] {
  return reachableControlFiles(srcRoot).filter((f) => f.endsWith('.tsx'));
}

/** Every `.tsx` under src that the entry cannot reach (reported so the blind spot stays visible). */
export function unreachableTsxFiles(srcRoot: string): string[] {
  const reach = reachableFiles(srcRoot);
  const all: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !isSkippable(p)) all.push(p);
    }
  };
  walk(srcRoot);
  return all.filter((f) => !reach.has(f)).sort();
}

// ── Control scanning ──────────────────────────────────────────────────────────

/**
 * Press handlers that always mark an element as a user-pressable control. A press is a discrete,
 * deliberate activation; every one must emit `ui_interaction` (or carry a true exemption).
 */
const PRESS_PROPS = new Set([
  'onClick',
  'onMouseDown',
  'onMouseUp',
  'onPointerDown',
  'onPointerUp',
  'onTouchStart',
  'onTouchEnd',
  'onDoubleClick',
  'onContextMenu',
]);

/** Keyboard activation handlers. They count ONLY on non-input elements (see the file header). */
const KEYBOARD_PROPS = new Set(['onKeyDown', 'onKeyUp']);

/** Host elements whose key handlers are text entry / Enter-submit, not a discrete press. */
const INPUT_TAGS = new Set(['input', 'textarea', 'select', 'form']);

interface TagInfo {
  /** How the tag is reported (e.g. `button`, `motion.button`). */
  label: string;
  /** The underlying host element name (e.g. `button`, `a`) — the last identifier of the tag. */
  base: string;
}

function attrName(attr: ts.JsxAttributeLike): string | undefined {
  if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) return attr.name.text;
  return undefined;
}

/**
 * A control-candidate tag, or null for custom component tags (whose own definition is scanned):
 *  - intrinsic lowercase identifier (`button`, `div`, `svg`) → host element,
 *  - member-expression tag (`motion.button`, `motion.a`) → framer-motion-style host wrapper; the
 *    underlying intrinsic is external, so it is treated as a control here.
 * Uppercase identifiers (`MenuItem`) are first-party components — not controls.
 */
function controlTag(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): TagInfo | null {
  const tag = node.tagName;
  if (ts.isIdentifier(tag)) {
    const name = tag.text;
    if (name[0] === name[0].toLowerCase()) return { label: name, base: name };
    return null; // Uppercase component — its intrinsics are scanned in its own file.
  }
  if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.name)) {
    return { label: tag.getText(sf), base: tag.name.text };
  }
  return null;
}

function hrefIsNavigation(attrs: ts.JsxAttributes): boolean {
  for (const attr of attrs.properties) {
    if (attrName(attr) !== 'href' || !ts.isJsxAttribute(attr) || !attr.initializer) continue;
    if (ts.isStringLiteral(attr.initializer)) {
      const v = attr.initializer.text;
      return !v.startsWith('mailto:') && !v.startsWith('tel:') && v !== '#';
    }
    return true; // dynamic href = user navigation
  }
  return false;
}

/** Read the raw string of a `data-track-exempt` attribute, or null if absent. */
function exemptValue(attrs: ts.JsxAttributes): string | null {
  for (const attr of attrs.properties) {
    if (attrName(attr) !== 'data-track-exempt' || !ts.isJsxAttribute(attr) || !attr.initializer) continue;
    const init = attr.initializer;
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) return init.expression.text;
    return ''; // present but not a plain string literal
  }
  return null;
}

/** Validate `<category>: <reason>`. Returns an error string, or null when well-formed. */
export function exemptError(raw: string): string | null {
  const idx = raw.indexOf(':');
  if (idx < 0) return `missing category (expected "<category>: <reason>"), got "${raw}"`;
  const category = raw.slice(0, idx).trim();
  const reason = raw.slice(idx + 1).trim();
  if (!category) return 'empty category';
  if (!EXEMPT_CATEGORIES.has(category)) return `unknown category "${category}" (allowed: ${[...EXEMPT_CATEGORIES].join(', ')})`;
  if (reason.length < 8) return `reason too short for category "${category}"`;
  return null;
}

/** Scan a source STRING (the testable seam `scanFile` and the self-tests both use). */
export function scanSource(file: string, text: string): Offender[] {
  const sf = parseTsx(file, text);
  const offenders: Offender[] = [];

  const check = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, attrs: ts.JsxAttributes) => {
    const info = controlTag(node, sf);
    if (!info) return;
    const names = attrs.properties.map(attrName).filter(Boolean) as string[];
    const hasPress = names.some((n) => PRESS_PROPS.has(n));
    const hasKeyboard = names.some((n) => KEYBOARD_PROPS.has(n));
    const keyboardCounts = hasKeyboard && !INPUT_TAGS.has(info.base);
    const isLink = info.base === 'a' && hrefIsNavigation(attrs);
    if (!hasPress && !keyboardCounts && !isLink) return;

    const tracked = names.includes('data-track-id');
    const openText = sf.text.slice(node.pos, node.end);
    const hasTrackSpread = /trackProps\(|\.\.\.\s*trackAttrs\b/.test(openText);
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const snippet = openText.replace(/\s+/g, ' ').trim().slice(0, 100);

    if (tracked || hasTrackSpread) return;

    const raw = exemptValue(attrs);
    if (raw !== null) {
      const err = exemptError(raw);
      if (err) offenders.push({ file, line, tag: info.label, snippet, problem: 'bad-exempt', detail: err });
      return; // validly exempt (or already reported as bad)
    }

    offenders.push({ file, line, tag: info.label, snippet, problem: 'untracked' });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node)) check(node, node.attributes);
    else if (ts.isJsxSelfClosingElement(node)) check(node, node.attributes);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offenders;
}

export function scanFile(file: string): Offender[] {
  return scanSource(file, readFileSync(file, 'utf8'));
}

/** Scan every reachable product file for untracked controls / malformed exemptions. */
export function scanAll(srcRoot: string): Offender[] {
  return reachableControlFiles(srcRoot).flatMap(scanFile);
}

// ── Coverage input (real-code `UiElement.X` references) ─────────────────────────

/**
 * Every catalog member accessed as REAL CODE (`UiElement.X`, an AST PropertyAccessExpression) in a
 * single source. Mentions inside comments or string literals are NOT AST property accesses, so they
 * are ignored — coverage reflects what actually fires, not what is merely written down.
 */
export function referencedUiElementNamesInSource(file: string, text: string): Set<string> {
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'UiElement' &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** The same, across every reachable product source file. */
export function referencedUiElementNames(srcRoot: string): Set<string> {
  const all = new Set<string>();
  for (const f of reachableFiles(srcRoot)) {
    if (isSkippable(f) || !CONTROL_EXT.test(f)) continue;
    for (const n of referencedUiElementNamesInSource(f, readFileSync(f, 'utf8'))) all.add(n);
  }
  return all;
}
