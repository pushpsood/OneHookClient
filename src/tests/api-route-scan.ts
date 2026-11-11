/**
 * Static scanner behind api-route-contract.test.ts: finds every HTTP request the web app makes and
 * resolves it to `{base, method, path}` (or, for the generated SDK, to an operationId) so the test can
 * check each one against the Smithy route manifest (src/lib/analytics/generated/apiManifest.ts).
 *
 * Uses the TypeScript compiler API, never regex. What counts as a request (a "sink"):
 *
 *  - `fetch(url, init)`: the global, `window.fetch` / `globalThis.fetch` / `self.fetch`, or a local
 *    alias (`const doFetch = t.fetchImpl ?? fetch`). Any other use of `fetch` as a value is reported
 *    as unresolved, so an untracked alias can't hide a request.
 *  - `xhr.open(method, url)` on a `const xhr = new XMLHttpRequest()`.
 *  - `sdkClient.<op>(...)` / `(sdkClient as any).<op>(...)` / `sdkClient.send(new <Op>Command(...))`
 *    on the generated `onehook-api-client` (api/sdk-client.ts), and any `<Op>Command` imported from it.
 *  - `navigator.sendBeacon`, `new EventSource`, `new WebSocket`: always unresolved (none exist today).
 *
 * How a URL resolves. The expression is evaluated into parts:
 *
 *  - the BASE: one of the known origins below (`apiBaseUrl`, `chatbotUrl`, `portalModerationBaseUrl`
 *    imported from utils/env.config, or a local helper such as `resolveUrl(path)` that the scanner
 *    checks really reads that origin). The URL must start with a base;
 *  - literal text, followed through local consts and imported string constants
 *    (e.g. `MEMBER_CHAT_PATH` from lib/mr-onehook-contract.ts);
 *  - path segments: any other value inside the template (`${encodeURIComponent(id)}`), written `{}`.
 *
 * When the URL or method comes from a parameter of the enclosing function, that function is a request
 * helper (api/rest.ts `request`, api/chat.ts `chatRest`, Mr. OneHook's `authorizedFetch`, ...). The
 * scanner then resolves every call of the helper in its file with the call's own arguments. A helper
 * it cannot follow (an exported helper that other files call, an object method, a helper used as a
 * value) makes the sink UNRESOLVED. Nothing is ever skipped: every sink ends up as a resolved route, a
 * resolved SDK call, an unresolved site, or (for an exported helper nobody imports) an uncalled helper.
 *
 * AppSync GraphQL (`appSyncClient().graphql(...)`) is not an HTTP route of the Smithy API (its contract
 * is schema.graphql), so it is not a sink here.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

/** Where a request goes. `api` and `mr-onehook` are checked against the Smithy manifest. */
export type Base = 'api' | 'mr-onehook' | 'admin-portal';

export interface SourceInput {
  /** Repo-relative POSIX path, e.g. `src/api/rest.ts`. */
  path: string;
  text: string;
}

export interface ResolvedRoute {
  file: string;
  line: number;
  base: Base;
  method: string;
  /** Literal path with every path parameter written `{}` and the query string removed. */
  path: string;
  /** The helper the request went through, when it went through one. */
  via?: string;
}

export interface SdkCall {
  file: string;
  line: number;
  operationId: string;
  /** Source text of the call, for messages. */
  call: string;
}

export interface UnresolvedSite {
  file: string;
  line: number;
  /** Nearest named owner of the sink (function, variable or property), or `<module>`. */
  owner: string;
  /** Source text of the URL expression (or of the sink when there is no URL). */
  target: string;
  reason: string;
}

export interface ScanResult {
  routes: ResolvedRoute[];
  sdkCalls: SdkCall[];
  unresolved: UnresolvedSite[];
  /** Exported request helpers that no scanned file imports (`file:name`). They make no request. */
  uncalledHelpers: string[];
}

// ── The known origins ───────────────────────────────────────────────────────────────────────────

/** Base-URL constants; each must be imported from utils/env.config. */
const BASE_IDENTIFIERS: Readonly<Record<string, Base>> = {
  apiBaseUrl: 'api',
  chatbotUrl: 'mr-onehook',
  portalModerationBaseUrl: 'admin-portal',
};

/**
 * Local URL helpers. Each must be a function declared in the calling file whose body reads the
 * base-URL constant of the same base (checked), so a renamed or repointed helper fails loudly.
 */
const BASE_FUNCTIONS: Readonly<Record<string, { base: Base; takesPath: boolean }>> = {
  /** api/rest.ts, api/analytics.ts: `resolveUrl(path)` = API origin + path. */
  resolveUrl: { base: 'api', takesPath: true },
  /** api/chat.ts: `await chatRestBaseUrl()` = API origin. */
  chatRestBaseUrl: { base: 'api', takesPath: false },
  /** features/moderation/report/evidence-api.ts: `resolveBaseUrl(t)` = portal moderation origin. */
  resolveBaseUrl: { base: 'admin-portal', takesPath: false },
};

const ENV_CONFIG_MODULE = /(^|\/)utils\/env\.config$/;
const SDK_CLIENT_MODULE = /(^|\/)sdk-client$/;
const SDK_PACKAGE = 'onehook-api-client';
const SDK_CLIENT_FILE = 'src/api/sdk-client.ts';
const REACT_DEPS_HOOKS = new Set(['useCallback', 'useEffect', 'useMemo', 'useLayoutEffect']);

// ── Reading the sources ─────────────────────────────────────────────────────────────────────────

/** True for files the scan skips: tests and generated code are not the shipped request surface. */
export function isSkipped(path: string): boolean {
  return (
    path.startsWith('src/tests/') ||
    path.startsWith('src/lib/analytics/generated/') ||
    path.endsWith('.d.ts') ||
    /\.(test|spec)\.tsx?$/.test(path)
  );
}

/** Every `.ts`/`.tsx` under `<root>/src` that {@link isSkipped} keeps. */
export function readSources(root: string): SourceInput[] {
  const out: SourceInput[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      const path = relative(root, abs).split(sep).join('/');
      if (!isSkipped(path)) out.push({ path, text: readFileSync(abs, 'utf8') });
    }
  };
  walk(join(root, 'src'));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ── Scanning ────────────────────────────────────────────────────────────────────────────────────

interface FileInfo {
  path: string;
  sf: ts.SourceFile;
}

type Part =
  | { k: 'lit'; text: string }
  | { k: 'seg' }
  | { k: 'base'; base: Base }
  | { k: 'param'; fn: ts.SignatureDeclaration; index: number; prop?: string };

type MethodSpec =
  | { k: 'lit'; method: string }
  | { k: 'param'; fn: ts.SignatureDeclaration; index: number }
  /** The method lives in an `init` object parameter that is spread into fetch's init. */
  | { k: 'init'; fn: ts.SignatureDeclaration; index: number };

type Binding =
  | { k: 'param'; fn: ts.SignatureDeclaration; index: number }
  | { k: 'var'; decl: ts.VariableDeclaration; isConst: boolean }
  | { k: 'function'; decl: ts.FunctionDeclaration }
  | { k: 'import'; module: string; imported: string }
  | { k: 'dynamic' };

/** Evaluation level: at a sink, parameters make a helper; at a helper's call site they are values. */
type Level = 'sink' | 'call';

class Unresolvable extends Error {}

const fail = (reason: string): never => {
  throw new Unresolvable(reason);
};

export function scanSources(inputs: SourceInput[]): ScanResult {
  const files = new Map<string, FileInfo>();
  for (const { path, text } of inputs) {
    const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    files.set(path, { path, sf: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind) });
  }
  const result: ScanResult = { routes: [], sdkCalls: [], unresolved: [], uncalledHelpers: [] };
  const uncalled = new Set<string>();

  for (const file of files.values()) {
    const lineOf = (n: ts.Node) => file.sf.getLineAndCharacterOfPosition(n.getStart(file.sf)).line + 1;
    const unresolved = (site: ts.Node, target: ts.Node, reason: string) =>
      result.unresolved.push({ file: file.path, line: lineOf(site), owner: ownerName(site), target: target.getText(file.sf), reason });

    // ── module resolution and name lookup ──
    const resolveModule = (spec: string): FileInfo | undefined => {
      let base: string;
      if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
      else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(file.path), spec));
      else return undefined;
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
        const hit = files.get(candidate);
        if (hit) return hit;
      }
      return undefined;
    };

    /** An imported string constant (e.g. MEMBER_CHAT_PATH), or undefined when it is anything else. */
    const importedString = (module: string, imported: string): string | undefined => {
      const target = resolveModule(module);
      if (!target) return undefined;
      for (const s of target.sf.statements) {
        if (!ts.isVariableStatement(s) || !(s.declarationList.flags & ts.NodeFlags.Const)) continue;
        for (const d of s.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || d.name.text !== imported || !d.initializer) continue;
          const init = unwrap(d.initializer);
          return ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) ? init.text : undefined;
        }
      }
      return undefined;
    };

    // ── expression evaluation ──
    const evalExpr = (expr: ts.Expression, level: Level, seen: Set<ts.Node> = new Set()): Part[] => {
      const e = unwrap(expr);
      if (seen.has(e)) fail('circular constant');
      seen.add(e);
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ k: 'lit', text: e.text }];
      if (ts.isNumericLiteral(e)) return [{ k: 'seg' }];
      if (ts.isTemplateExpression(e)) {
        const parts: Part[] = [{ k: 'lit', text: e.head.text }];
        for (const span of e.templateSpans) {
          parts.push(...evalExpr(span.expression, level, seen), { k: 'lit', text: span.literal.text });
        }
        return parts;
      }
      if (ts.isBinaryExpression(e)) {
        if (e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          return [...evalExpr(e.left, level, seen), ...evalExpr(e.right, level, seen)];
        }
        return fail(`"${e.getText(file.sf)}" is chosen at runtime`);
      }
      if (ts.isConditionalExpression(e)) return fail(`"${e.getText(file.sf)}" is chosen at runtime`);
      if (ts.isCallExpression(e)) {
        if (ts.isIdentifier(e.expression)) {
          const helper = BASE_FUNCTIONS[e.expression.text];
          const b = lookup(e.expression.text, e);
          if (helper && b?.k === 'function') {
            checkBaseFunction(b.decl, helper.base);
            if (!helper.takesPath) return [{ k: 'base', base: helper.base }];
            const arg = e.arguments[0];
            if (!arg) return fail(`${e.expression.text}() called without a path`);
            return [{ k: 'base', base: helper.base }, ...evalExpr(arg, level, seen)];
          }
        }
        // encodeURIComponent(x), String(x), ...: a value inside the path.
        return [{ k: 'seg' }];
      }
      if (ts.isIdentifier(e)) {
        const name = e.text;
        const b = lookup(name, e);
        const base = BASE_IDENTIFIERS[name];
        if (base && b?.k === 'import' && ENV_CONFIG_MODULE.test(b.module)) return [{ k: 'base', base }];
        if (!b) return [{ k: 'seg' }];
        switch (b.k) {
          case 'param':
            return level === 'sink' ? [{ k: 'param', fn: b.fn, index: b.index }] : [{ k: 'seg' }];
          case 'var':
            return b.isConst && b.decl.initializer ? evalExpr(b.decl.initializer, level, seen) : [{ k: 'seg' }];
          case 'import': {
            const text = importedString(b.module, b.imported);
            return text === undefined ? [{ k: 'seg' }] : [{ k: 'lit', text }];
          }
          default:
            return [{ k: 'seg' }];
        }
      }
      if (ts.isPropertyAccessExpression(e)) {
        if (level === 'sink' && ts.isIdentifier(e.expression)) {
          const b = lookup(e.expression.text, e);
          if (b?.k === 'param') return [{ k: 'param', fn: b.fn, index: b.index, prop: e.name.text }];
        }
        return [{ k: 'seg' }];
      }
      if (ts.isElementAccessExpression(e)) return [{ k: 'seg' }];
      return fail(`unsupported URL expression (${ts.SyntaxKind[e.kind]})`);
    };

    const checkBaseFunction = (decl: ts.FunctionDeclaration, base: Base) => {
      let reads = false;
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && BASE_IDENTIFIERS[n.text] === base) {
          const b = lookup(n.text, n);
          if (b?.k === 'import' && ENV_CONFIG_MODULE.test(b.module)) reads = true;
        }
        n.forEachChild(visit);
      };
      decl.body?.forEachChild(visit);
      if (!reads) fail(`URL helper ${decl.name?.text}() does not read the ${base} base URL from utils/env.config`);
    };

    const lookup = (name: string, from: ts.Node): Binding | undefined => {
      for (let n: ts.Node | undefined = from; n; n = n.parent) {
        if (isFunctionLike(n)) {
          const index = n.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === name);
          if (index >= 0) return { k: 'param', fn: n, index };
          if (n.parameters.some((p) => !ts.isIdentifier(p.name) && bindsName(p.name, name))) return { k: 'dynamic' };
        }
        const statements = statementsOf(n);
        if (!statements) continue;
        for (const s of statements) {
          if (ts.isVariableStatement(s)) {
            for (const d of s.declarationList.declarations) {
              if (ts.isIdentifier(d.name) && d.name.text === name) {
                return { k: 'var', decl: d, isConst: (s.declarationList.flags & ts.NodeFlags.Const) !== 0 };
              }
              if (!ts.isIdentifier(d.name) && bindsName(d.name, name)) return { k: 'dynamic' };
            }
          } else if (ts.isFunctionDeclaration(s) && s.name?.text === name) {
            return { k: 'function', decl: s };
          } else if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
            const imported = importedName(s, name);
            if (imported) return { k: 'import', module: s.moduleSpecifier.text, imported };
          }
        }
      }
      return undefined;
    };

    // ── request helpers (functions whose parameters feed a sink) ──
    const callersOf = (fn: ts.SignatureDeclaration): ts.CallExpression[] | 'uncalled' => {
      const { name, exported } = helperName(fn);
      const calls: ts.CallExpression[] = [];
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === name && isValueReference(n)) {
          const b = lookup(name, n);
          const declaresThisFn =
            (b?.k === 'function' && b.decl === fn) ||
            (b?.k === 'var' && b.decl.initializer && containsNode(b.decl.initializer, fn));
          if (!declaresThisFn) fail(`the name ${name} is also bound to something else in this file`);
          const parent = n.parent;
          if (ts.isCallExpression(parent) && parent.expression === n) calls.push(parent);
          else if (!isReactDepsEntry(n)) fail(`request helper ${name} is used as a value (line ${lineOf(n)})`);
        }
        n.forEachChild(visit);
      };
      visit(file.sf);
      if (exported) {
        const importers = [...files.values()].filter((f) => f !== file && importsNameFrom(f, name, file));
        if (importers.length) {
          fail(`exported request helper ${name} is called from ${importers.map((f) => f.path).join(', ')} with runtime values`);
        }
      }
      if (!calls.length) {
        if (!exported) fail(`request helper ${name} is never called`);
        return 'uncalled';
      }
      return calls;
    };

    const importsNameFrom = (f: FileInfo, name: string, target: FileInfo): boolean =>
      f.sf.statements.some((s) => {
        if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !importedName(s, name, true)) return false;
        const spec = s.moduleSpecifier.text;
        const base = spec.startsWith('@/') ? 'src/' + spec.slice(2) : posix.normalize(posix.join(posix.dirname(f.path), spec));
        return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].includes(target.path);
      });

    const argParts = (call: ts.CallExpression, p: Extract<Part, { k: 'param' }>): Part[] => {
      if (call.arguments.some(ts.isSpreadElement)) fail('helper called with a spread argument');
      const param = p.fn.parameters[p.index];
      const arg = call.arguments[p.index] ?? param?.initializer;
      if (!arg) return fail(`helper called without argument ${p.index + 1}`);
      if (p.prop) {
        const obj = unwrap(arg);
        if (!ts.isObjectLiteralExpression(obj)) return fail(`argument ${p.index + 1} is not an object literal with "${p.prop}"`);
        const prop = obj.properties.find((x) => propName(x) === p.prop);
        if (!prop || !ts.isPropertyAssignment(prop)) return fail(`argument ${p.index + 1} has no "${p.prop}"`);
        return evalExpr(prop.initializer, 'call');
      }
      return evalExpr(arg, 'call');
    };

    const callMethod = (call: ts.CallExpression, m: MethodSpec): string => {
      if (m.k === 'lit') return m.method;
      const param = m.fn.parameters[m.index];
      const arg = call.arguments[m.index] ?? param?.initializer;
      if (m.k === 'param') {
        if (!arg) return fail('helper called without a method');
        return literalMethod(evalExpr(arg, 'call'));
      }
      if (!arg) return 'GET';
      const obj = unwrap(arg);
      if (!ts.isObjectLiteralExpression(obj)) return fail('helper init argument is not an object literal');
      const prop = obj.properties.find((x) => propName(x) === 'method');
      if (!prop) return 'GET';
      if (!ts.isPropertyAssignment(prop)) return fail('helper init "method" is not a plain property');
      return literalMethod(evalExpr(prop.initializer, 'call'));
    };

    const sinkMethod = (init: ts.Expression | undefined): MethodSpec => {
      if (!init) return { k: 'lit', method: 'GET' };
      const obj = unwrap(init);
      if (!ts.isObjectLiteralExpression(obj)) return fail('request init is not an object literal');
      let spread: MethodSpec | undefined;
      for (const prop of obj.properties) {
        if (propName(prop) === 'method') {
          const value = ts.isPropertyAssignment(prop) ? prop.initializer : ts.isShorthandPropertyAssignment(prop) ? prop.name : undefined;
          if (!value) return fail('request "method" is not a plain property');
          return methodFromParts(evalExpr(value, 'sink'));
        }
        if (ts.isSpreadAssignment(prop)) {
          const b = ts.isIdentifier(prop.expression) ? lookup(prop.expression.text, prop) : undefined;
          if (b?.k !== 'param') return fail('request init spreads a value that may carry the method');
          spread = { k: 'init', fn: b.fn, index: b.index };
        }
      }
      return spread ?? { k: 'lit', method: 'GET' };
    };

    const methodFromParts = (parts: Part[]): MethodSpec => {
      const p = parts.filter((x) => !(x.k === 'lit' && x.text === ''));
      if (p.length === 1 && p[0].k === 'param' && !p[0].prop) return { k: 'param', fn: p[0].fn, index: p[0].index };
      return { k: 'lit', method: literalMethod(parts) };
    };

    /** Resolve one sink to routes (several when it is a helper with several calls). */
    const resolveSink = (site: ts.Node, urlExpr: ts.Expression, methodOf: () => MethodSpec) => {
      try {
        const parts = evalExpr(urlExpr, 'sink');
        const method = methodOf();
        const params = parts.filter((p): p is Extract<Part, { k: 'param' }> => p.k === 'param');
        const fns = new Set<ts.SignatureDeclaration>(params.map((p) => p.fn));
        if (method.k !== 'lit') fns.add(method.fn);
        if (fns.size === 0) {
          result.routes.push({ file: file.path, line: lineOf(site), ...toRoute(parts), method: (method as { method: string }).method });
          return;
        }
        if (fns.size > 1) fail('the URL mixes parameters of nested functions');
        const fn = [...fns][0];
        const callers = callersOf(fn);
        const via = helperName(fn).name;
        if (callers === 'uncalled') {
          uncalled.add(`${file.path}:${via}`);
          return;
        }
        // Resolve every call first, so one bad call reports the helper instead of half its routes.
        const routes = callers.map((call) => {
          try {
            const resolved = parts.flatMap((p) => (p.k === 'param' ? argParts(call, p) : [p]));
            return { file: file.path, line: lineOf(call), ...toRoute(resolved), method: callMethod(call, method), via };
          } catch (err) {
            if (err instanceof Unresolvable) fail(`${via}() call at line ${lineOf(call)}: ${err.message}`);
            throw err;
          }
        });
        result.routes.push(...routes);
      } catch (err) {
        if (!(err instanceof Unresolvable)) throw err;
        unresolved(site, urlExpr, err.message);
      }
    };

    // ── sinks ──
    const fetchAliases = new Set<string>();
    const allowedFetchRefs = new Set<ts.Node>();
    const findAliases = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const init = unwrap(n.initializer);
        const ref =
          ts.isIdentifier(init) && init.text === 'fetch'
            ? init
            : ts.isBinaryExpression(init) &&
                (init.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
                  init.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
                ts.isIdentifier(unwrap(init.right)) &&
                (unwrap(init.right) as ts.Identifier).text === 'fetch'
              ? unwrap(init.right)
              : undefined;
        if (ref) {
          fetchAliases.add(n.name.text);
          allowedFetchRefs.add(ref);
        }
      }
      n.forEachChild(findAliases);
    };
    findAliases(file.sf);

    const sdkImported = file.sf.statements.some(
      (s) =>
        ts.isImportDeclaration(s) &&
        ts.isStringLiteral(s.moduleSpecifier) &&
        SDK_CLIENT_MODULE.test(s.moduleSpecifier.text) &&
        importedName(s, 'sdkClient')
    );

    const visit = (n: ts.Node) => {
      // fetch(...) and its aliases
      if (ts.isCallExpression(n)) {
        const callee = unwrap(n.expression);
        const isFetch =
          (ts.isIdentifier(callee) && (callee.text === 'fetch' || fetchAliases.has(callee.text))) ||
          (ts.isPropertyAccessExpression(callee) &&
            callee.name.text === 'fetch' &&
            ts.isIdentifier(callee.expression) &&
            ['window', 'globalThis', 'self'].includes(callee.expression.text));
        if (isFetch) {
          const url = n.arguments[0];
          if (!url) unresolved(n, n, 'fetch() without a URL');
          else resolveSink(n, url, () => sinkMethod(n.arguments[1]));
        } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'fetch') {
          unresolved(n, n, `${callee.getText(file.sf)}() is not a known fetch`);
        } else if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'sendBeacon' &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'navigator'
        ) {
          unresolved(n, n, 'navigator.sendBeacon is not resolved by this scanner');
        }
      }

      // `fetch` (or a recognised alias of it) used as a value: anything but a call or the alias itself
      if (ts.isIdentifier(n) && (n.text === 'fetch' || fetchAliases.has(n.text)) && isValueReference(n) && !allowedFetchRefs.has(n)) {
        const parent = n.parent;
        const isCallee = ts.isCallExpression(parent) && unwrap(parent.expression) === n;
        const shadowed = n.text === 'fetch' && lookup('fetch', n) !== undefined;
        if (!isCallee && !shadowed) unresolved(n, n, `${n.text} is passed or stored as a value`);
      }

      // XMLHttpRequest / EventSource / WebSocket
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
        const ctor = n.expression.text;
        if (ctor === 'XMLHttpRequest') {
          const decl = n.parent;
          if (!ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) {
            unresolved(n, n, 'new XMLHttpRequest() is not assigned to a const');
          } else {
            const xhr = decl.name.text;
            const scope = enclosingFunction(n) ?? file.sf;
            const opens: ts.CallExpression[] = [];
            const findOpen = (m: ts.Node) => {
              if (
                ts.isCallExpression(m) &&
                ts.isPropertyAccessExpression(m.expression) &&
                m.expression.name.text === 'open' &&
                ts.isIdentifier(m.expression.expression) &&
                m.expression.expression.text === xhr
              ) {
                opens.push(m);
              }
              m.forEachChild(findOpen);
            };
            findOpen(scope);
            if (!opens.length) unresolved(n, n, `no ${xhr}.open(...) found for this XMLHttpRequest`);
            for (const open of opens) {
              const [method, url] = open.arguments;
              if (!method || !url) unresolved(open, open, `${xhr}.open() without a method and URL`);
              else resolveSink(open, url, () => methodFromParts(evalExpr(method, 'sink')));
            }
          }
        } else if (ctor === 'EventSource' || ctor === 'WebSocket') {
          unresolved(n, n, `new ${ctor}() is not resolved by this scanner`);
        } else if ((ctor === 'OneHook' || ctor === 'OneHookClient') && file.path !== SDK_CLIENT_FILE) {
          unresolved(n, n, `a second ${ctor} SDK client outside ${SDK_CLIENT_FILE}`);
        }
      }

      // The generated SDK client
      if (ts.isIdentifier(n) && n.text === 'sdkClient' && isValueReference(n)) {
        sdkReference(n);
      }

      // `<Op>Command` imported from the SDK package
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === SDK_PACKAGE) {
        const named = n.importClause?.namedBindings;
        if (named && ts.isNamedImports(named)) {
          for (const el of named.elements) {
            const imported = (el.propertyName ?? el.name).text;
            if (/^[A-Z]\w*Command$/.test(imported) && !el.isTypeOnly && !n.importClause?.isTypeOnly) {
              result.sdkCalls.push({ file: file.path, line: lineOf(el), operationId: imported.slice(0, -'Command'.length), call: `import ${imported}` });
            }
          }
        }
      }
      n.forEachChild(visit);
    };

    const sdkReference = (n: ts.Identifier) => {
      let expr: ts.Node = n;
      while (
        (ts.isParenthesizedExpression(expr.parent) || ts.isAsExpression(expr.parent) || ts.isNonNullExpression(expr.parent) || ts.isTypeAssertionExpression(expr.parent)) &&
        expr.parent.expression === expr
      ) {
        expr = expr.parent;
      }
      const access = expr.parent;
      if (file.path === SDK_CLIENT_FILE) {
        // The declaration and the middleware setup in sdk-client.ts itself.
        if (ts.isPropertyAccessExpression(access) && access.expression === expr && access.name.text === 'middlewareStack') return;
      } else if (!sdkImported) {
        unresolved(n, n, 'sdkClient is not imported from api/sdk-client');
        return;
      }
      if (!ts.isPropertyAccessExpression(access) || access.expression !== expr) {
        unresolved(n, n, 'sdkClient is used as a value; its calls cannot be traced');
        return;
      }
      const call = access.parent;
      if (!ts.isCallExpression(call) || call.expression !== access) {
        unresolved(n, access, `sdkClient.${access.name.text} is not called directly`);
        return;
      }
      const op = access.name.text;
      if (op === 'send') {
        const arg = call.arguments[0] && unwrap(call.arguments[0]);
        if (arg && ts.isNewExpression(arg) && ts.isIdentifier(arg.expression) && /Command$/.test(arg.expression.text)) {
          result.sdkCalls.push({ file: file.path, line: lineOf(call), operationId: arg.expression.text.slice(0, -'Command'.length), call: call.getText(file.sf) });
        } else {
          unresolved(n, call, 'sdkClient.send() without a `new <Op>Command(...)` argument');
        }
        return;
      }
      result.sdkCalls.push({
        file: file.path,
        line: lineOf(call),
        operationId: op.charAt(0).toUpperCase() + op.slice(1),
        call: access.getText(file.sf),
      });
    };

    visit(file.sf);
  }

  result.uncalledHelpers = [...uncalled].sort();
  return result;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

function unwrap(e: ts.Expression): ts.Expression {
  let x = e;
  while (
    ts.isParenthesizedExpression(x) ||
    ts.isAsExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isTypeAssertionExpression(x) ||
    ts.isSatisfiesExpression(x) ||
    ts.isAwaitExpression(x)
  ) {
    x = x.expression;
  }
  return x;
}

function isFunctionLike(n: ts.Node): n is ts.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n)
  );
}

function enclosingFunction(n: ts.Node): ts.Node | undefined {
  for (let p = n.parent; p; p = p.parent) if (isFunctionLike(p)) return p;
  return undefined;
}

function statementsOf(n: ts.Node): ts.NodeArray<ts.Statement> | undefined {
  if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n)) {
    return n.statements;
  }
  return undefined;
}

function bindsName(pattern: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(pattern)) return pattern.text === name;
  return pattern.elements.some((el) => !ts.isOmittedExpression(el) && bindsName(el.name, name));
}

/** The name an import declaration binds locally as `local` (or exports as `local` when `byExport`). */
function importedName(decl: ts.ImportDeclaration, local: string, byExport = false): string | undefined {
  const clause = decl.importClause;
  if (!clause) return undefined;
  if (clause.name?.text === local) return 'default';
  const named = clause.namedBindings;
  if (named && ts.isNamedImports(named)) {
    for (const el of named.elements) {
      const exported = (el.propertyName ?? el.name).text;
      if ((byExport ? exported : el.name.text) === local) return exported;
    }
  }
  return undefined;
}

function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  if (ts.isSpreadAssignment(p)) return undefined;
  const name = p.name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
}

function containsNode(root: ts.Node, target: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (n === target) found = true;
    else n.forEachChild(visit);
  };
  visit(root);
  return found;
}

/** True when the identifier is a value reference (not a declaration name, property name or type). */
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isParameter(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)) && p.name === id) return false;
  if (ts.isBindingElement(p) && (p.name === id || p.propertyName === id)) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isExportSpecifier(p) || ts.isNamespaceImport(p)) return false;
  if (ts.isQualifiedName(p) || ts.isJsxAttribute(p) || ts.isLabeledStatement(p)) return false;
  for (let a: ts.Node | undefined = p; a; a = a.parent) {
    if (ts.isTypeNode(a) && !ts.isExpressionWithTypeArguments(a)) return false;
  }
  return true;
}

function isReactDepsEntry(id: ts.Identifier): boolean {
  const arr = id.parent;
  if (!ts.isArrayLiteralExpression(arr)) return false;
  const call = arr.parent;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    REACT_DEPS_HOOKS.has(call.expression.text) &&
    call.arguments[1] === arr
  );
}

function hasExportModifier(n: ts.Node): boolean {
  return (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ?? false;
}

function exportedByName(sf: ts.SourceFile, name: string): boolean {
  return sf.statements.some(
    (s) =>
      ts.isExportDeclaration(s) &&
      !s.moduleSpecifier &&
      s.exportClause !== undefined &&
      ts.isNamedExports(s.exportClause) &&
      s.exportClause.elements.some((el) => (el.propertyName ?? el.name).text === name)
  );
}

/** A request helper's name and whether it is exported. Throws when the helper has no traceable name. */
function helperName(fn: ts.SignatureDeclaration): { name: string; exported: boolean } {
  const sf = fn.getSourceFile();
  if (ts.isFunctionDeclaration(fn) && fn.name) {
    return { name: fn.name.text, exported: hasExportModifier(fn) || exportedByName(sf, fn.name.text) };
  }
  let p: ts.Node = fn.parent;
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && REACT_DEPS_HOOKS.has(p.expression.text)) p = p.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
    const statement = p.parent.parent;
    return { name: p.name.text, exported: hasExportModifier(statement) || exportedByName(sf, p.name.text) };
  }
  return fail('the URL comes from a parameter of a function whose callers cannot be traced (e.g. an object method)');
}

/** Nearest named function owning a node (declaration, method, or a function assigned to a name). */
export function ownerName(n: ts.Node): string {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      let holder: ts.Node = p.parent;
      if (ts.isCallExpression(holder) && ts.isIdentifier(holder.expression) && REACT_DEPS_HOOKS.has(holder.expression.text)) {
        holder = holder.parent;
      }
      if ((ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) && ts.isIdentifier(holder.name)) {
        return holder.name.text;
      }
    }
  }
  return '<module>';
}

function literalMethod(parts: Part[]): string {
  const p = parts.filter((x) => !(x.k === 'lit' && x.text === ''));
  if (p.length === 1 && p[0].k === 'lit' && /^[A-Za-z]+$/.test(p[0].text)) return p[0].text.toUpperCase();
  return fail('the HTTP method is not a literal');
}

function toRoute(parts: Part[]): { base: Base; path: string } {
  const p = parts.filter((x) => !(x.k === 'lit' && x.text === ''));
  const first = p[0];
  if (!first || first.k !== 'base') {
    return fail('the URL does not start with a known OneHook base URL (apiBaseUrl, chatbotUrl, portalModerationBaseUrl)');
  }
  let path = '';
  for (const part of p.slice(1)) {
    if (part.k === 'lit') path += part.text;
    else if (part.k === 'seg') path += '{}';
    else return fail('a base URL appears inside the path');
  }
  path = path.split(/[?#]/)[0];
  if (!path.startsWith('/')) return fail(`the path "${path}" does not start with "/"`);
  return { base: first.base, path };
}

/** `/a/{userId}/b` → `/a/{}/b`: path-parameter names are not part of the contract. */
export function normalizePath(path: string): string {
  return path.replace(/\{[^}]*\}/g, '{}');
}
