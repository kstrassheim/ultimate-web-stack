// jest/transform-import-meta.cjs
//
// React Router 8 is published as ESM-only and contains `import.meta.hot`
// checks in `lib/dom/ssr/routeModules.js` (the dev HMR guard
// `if (... && import.meta.hot) throw error`). Jest still evaluates
// transformed sources as CJS, so when swc emits `import.meta` unchanged
// (it does, by design — swc doesn't have a built-in transform for
// `import.meta` going to CJS) the runner hits:
//
//     SyntaxError: Cannot use 'import.meta' outside a module
//
// We only need to neutralise the `import.meta.hot` access path that
// the RR source uses — there is no other `import.meta` usage in the
// codebase. Substituting it with the literal `false` is the correct
// semantic match: `import.meta.hot` is `undefined` in a non-HMR
// runtime anyway, and the guard in routeModules.js short-circuits on
// falsy values (its HMR-rethrow path is unreachable in tests because
// no route loads via `route.module` import in declarative mode).
//
// The rest of the work is delegated to @swc/jest, so all the
// existing JSX / TS / syntax behaviour is preserved.
const { createTransformer } = require('@swc/jest');

// Allow-list: only react-router's ssr/routeModules subpath actually
// uses `import.meta`. We don't want to mask real bugs elsewhere —
// future source-level `import.meta` usage in this repo will surface
// here first because the regex below would also neutralise it, so
// keep this scoped.
const REACT_ROUTER_ROUTE_MODULES_PATTERN =
  /\/node_modules\/react-router\/dist\/[^/]+\/lib\/dom\/ssr\/routeModules\.[mc]?js$/;

// `import.meta.hot` (the only expression RR uses) is replaced with
// the literal `false`, which is the value Jest would observe at
// runtime anyway because no HMR client is attached.
const IMPORT_META_HOT_REGEX = /\bimport\s*\.\s*meta\s*\.\s*hot\b/g;

const transformer = createTransformer();

module.exports = {
  canInstrument: transformer.canInstrument,
  process(src, filename, jestOptions) {
    const result = transformer.process(src, filename, jestOptions);
    // @swc/jest returns `{ code, map }` (not a string). Most tests
    // never hit the allow-list path, so the fast-path returns the
    // object untouched; only the RR route-modules file gets post-
    // processed.
    if (!REACT_ROUTER_ROUTE_MODULES_PATTERN.test(filename)) {
      return result;
    }
    if (result && typeof result.code === 'string') {
      result.code = result.code.replace(IMPORT_META_HOT_REGEX, 'false');
    }
    return result;
  },
  processAsync: transformer.processAsync,
  getCacheKey: transformer.getCacheKey,
};
