/**
 * Fallback for the generated Smithy SDK (`@onehook/api-client`).
 *
 * WHY THIS EXISTS
 * ---------------
 * `@onehook/api-client` is a `file:` dependency that points at generated
 * codegen output inside the sibling OneHookBackend repository:
 *
 *   file:../OneHookBackend/packages/api-models/build/smithy/source/typescript-codegen
 *
 * That path only exists on a machine that has the backend repo checked out AND
 * has run the Smithy codegen. In CI (and for anyone who only clones this repo)
 * the module cannot be resolved, which previously failed the production build
 * outright:
 *
 *   [vite]: Rollup failed to resolve import "@onehook/api-client"
 *
 * `vite.config.ts` therefore aliases `@onehook/api-client` to this file *only
 * when the real package is missing*. When the real SDK is present nothing
 * changes — local development keeps the fully typed, functional client.
 *
 * BEHAVIOUR
 * ---------
 * The public marketing site (Landing, Careers, Contact, Privacy, Terms) makes
 * no backend calls, so it builds and runs perfectly against this stub. Any
 * auth/app route that *does* call an operation gets a rejected promise with a
 * clear, actionable message instead of a hard crash at import time — matching
 * the "gracefully degrade when the backend is unavailable" approach already
 * used by the stubs in `src/types.ts` and `src/api/profile.ts`.
 */

const UNAVAILABLE_HINT =
  'The generated @onehook/api-client SDK was not available at build time, so ' +
  'backend operations are disabled in this build. Build the Smithy codegen in ' +
  'OneHookBackend (or install a published @onehook/api-client) and rebuild.';

/** Anything the generated client exposes that is not an API operation. */
const NON_OPERATION_KEYS = new Set<string | symbol>([
  'middlewareStack',
  'config',
  'destroy',
  'then',
  'catch',
  'finally',
  Symbol.toPrimitive,
  Symbol.toStringTag,
  Symbol.iterator,
  Symbol.asyncIterator,
]);

/**
 * Minimal stand-in for the generated `OneHookService` client. Typed loosely
 * (returns `any`) because the real client's operation surface is generated and
 * must not be duplicated by hand here.
 */
export const OneHookService: new (config?: Record<string, unknown>) => any = class OneHookServiceStub {
  /** Mirrors the real client so `sdkClient.middlewareStack.add(...)` is safe. */
  middlewareStack = {
    add: () => {
      /* no-op: there are no requests to intercept in this build */
    },
    remove: () => {},
  };

  config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;

    // Every unknown property is treated as an API operation and returns a
    // rejected promise, so callers fail predictably at call time (not import
    // time) and can surface a normal error state.
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target || NON_OPERATION_KEYS.has(prop)) {
          return Reflect.get(target, prop, receiver);
        }
        return () =>
          Promise.reject(
            new Error(`OneHook API is unavailable: cannot call "${String(prop)}()". ${UNAVAILABLE_HINT}`)
          );
      },
    });
  }

  destroy() {
    /* no-op */
  }
};

export default { OneHookService };
