// ESLint flat config for the React 19 frontend (issue #115).
//
// Scope (acceptance criterion #1):
//   - `src/**`                       - production code and tests
//   - `scripts/**`                   - Node-only build / guard scripts
//   - `mock/**`                      - Jest/cypress shims
//   - `vite.config.js`,
//     `start-backend.js`,
//     `jest.setup.js`,
//     `jest.config.cjs`,
//     `jest/*.cjs`                   - Vite / Jest configuration files
//   - `cypress.config.js`            - Cypress configuration (linting
//                                       the config keeps its imports
//                                       honest; the `cypress/` tree of
//                                       tests is intentionally NOT
//                                       linted - Cypress has its own
//                                       runtime and out-of-scope globals).
//
// React 19 + hooks focus is delivered by:
//   - `@eslint/js` recommended rules (ES2024, ESM).
//   - `eslint-plugin-react-hooks` `recommended-latest` preset, which
//     covers `rules-of-hooks` and `exhaustive-deps`. The legacy
//     `eslint-plugin-react` package is intentionally NOT included -
//     its peer dependency range stops at ESLint 9.7 and React 19
//     itself dropped the legacy lifecycle methods those rules
//     targeted, so adding it would only block the upgrade.
//
// Rules that are intentionally downgraded from `error` to `warn`,
// with the rationale, are inline below.
//
// Globals strategy:
//   - `src/**` gets browser globals (React apps) + jest globals
//     (so test files using `describe`/`it`/`jest` resolve cleanly).
//   - `src/**/*.test.jsx` and `.test.js` get an additional
//     `globals.node` layer so the common `global.fetch = jest.fn()`
//     mock pattern (which Node exposes as `globalThis.fetch`) lints
//     cleanly. Jest's jsdom env deliberately leaves `global` as a
//     Node-only alias, so the test override is the right place for
//     it.
//   - `scripts/**`, `vite.config.js`, `start-backend.js`, the jest
//     config files, and `mock/**` get node globals because those
//     files all run under Node.
//   - `mock/azureMsalBrowser.js` and `mock/azureMsalRedirectBridge.js`
//     additionally get browser globals - they intentionally mimic
//     the browser `window` / `location` / `crypto` / `btoa` surface
//     for the MSAL popup flow during tests.
//   - `cypress.config.js` gets node globals + browser globals
//     (Cypress's plugin hooks expose the Node API).

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  // ---------------------------------------------------------------------------
  // Global ignores.
  //
  // We deliberately do NOT ignore `mock/` - the shims are real JS
  // that benefits from the same checks, and the acceptance criterion
  // forbids narrowing the file set to make the run pass. Only paths
  // that contain no source code (build outputs, coverage reports,
  // static assets) are excluded.
  // ---------------------------------------------------------------------------
  {
    ignores: [
      'node_modules/',
      // Vite build output (lives at backend/dist by Vite config)
      'dist/',
      '../backend/dist/',
      // Coverage / instrumentation artefacts
      'coverage/',
      '.nyc_output/',
      // Static assets (no JS source)
      'public/',
      'logo_src/',
      // Cypress test trees have a different env (Cypress globals,
      // Mocha hooks, ...) and would need a second config to lint
      // usefully; that is out of scope for issue #115.
      'cypress/e2e/**',
      'cypress/support/**',
      'cypress/fixtures/**',
    ],
  },

  // ---------------------------------------------------------------------------
  // Base recommended JS rules - applied to every file that survives
  // the global ignore block.
  // ---------------------------------------------------------------------------
  js.configs.recommended,

  // ---------------------------------------------------------------------------
  // Source code (production + tests). React 19 + hooks preset.
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // Vite injects these via `define:` in vite.config.js - see
        // the matching block at the bottom of vite.config.js. They
        // exist in every built bundle and in every `npm run dev`
        // process, so they are real runtime globals from the
        // linter's perspective.
        __MOCK__: 'readonly',
        __PROD_URI__: 'readonly',
        __PROD_SOCKET_URI__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // eslint-plugin-react-hooks v7's flat config export - see
      // node_modules/eslint-plugin-react-hooks/cjs/*.development.js.
      // `recommended-latest` covers rules-of-hooks and
      // exhaustive-deps in their up-to-date form.
      ...reactHooks.configs['recommended-latest'].rules,

      // `no-unused-vars` with a leading-underscore escape hatch.
      // Existing tests deliberately destructure-and-ignore
      // parameters (`const { _unused, ...rest } = ...`, callback
      // parameters named `_event`) and we want to keep that
      // pattern lint-clean.
      'no-unused-vars': ['error', {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }],

      // The codebase uses `console.error` for genuine error
      // reporting (AppInsights `trackException` plus a console
      // fallback when AppInsights itself fails). `no-console`
      // would force the removal of those legitimate calls; keep
      // the rule as a warn so reviewers can spot new debug-style
      // `console.log` additions without blocking on the existing
      // ones.
      'no-console': ['warn', { allow: ['error', 'warn'] }],

      // Empty catch blocks are used legitimately in several
      // places (e.g. `try { ... } catch (_) { /* fallback */ }`).
      // Downgrade to allow `allowEmptyCatch` rather than error so
      // the existing fallbacks stay lint-clean.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // React 19's `react-hooks/refs` rule flags reading
      // `ref.current` during render, but the `useAbortController`
      // hook (src/utils/useAbortController.js) deliberately uses
      // the "lazy initial value via useRef" pattern that React has
      // documented as the recommended escape hatch since hooks
      // were introduced. The ref is read on first render, written
      // once, and never re-read. Keep the rule as warn rather
      // than disable so any FUTURE direct ref-during-render stays
      // visible.
      'react-hooks/refs': 'warn',

      // `exhaustive-deps` is also pre-existing in several places
      // where the dependency is intentionally omitted (the effect
      // reads an `abortController.signal` whose identity is stable
      // across renders, etc.). Promote to warn so the team can
      // chip away at them incrementally without blocking CI.
      'react-hooks/exhaustive-deps': 'warn',

      // `set-state-in-effect` is the React 19 equivalent of "you
      // might not need an effect" - most of the six hits are
      // genuine refactor opportunities but are also pre-existing
      // behaviour the app currently relies on. Keep as warn so
      // they appear in `npm run lint` output without breaking CI.
      'react-hooks/set-state-in-effect': 'warn',

      // Vite's React Fast Refresh needs component-only files.
      // `allowConstantExport` lets the few non-component constants
      // already exported from `src/` (e.g. `SOCKET_URL`) stay
      // clean; the warning still surfaces for any future mixed
      // export so reviewers can see the trade-off.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Test files. Add jest globals + node's `global` alias + the
  // `require` import pattern tests use (Jest's `jest.requireActual`
  // / inline `require()` call patterns are still idiomatic for
  // grabbing mocked modules).
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
        // `jest-preview` exposes `debug()` from jest.setup.js.
        debug: 'readonly',
      },
    },
    rules: {
      // Tests sometimes import a module purely for its side
      // effects (mocking, registering helpers, attaching to
      // `globalThis`). Forbidding unused expressions there is
      // noise.
      'no-unused-expressions': 'off',
      // Fast-refresh's "only export components" rule is about
      // the HMR boundary in dev - it has no meaning inside test
      // files, which legitimately re-export helpers and mocks
      // alongside the component under test.
      'react-refresh/only-export-components': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Node-only scripts, Vite / Jest config files, and the mock shim
  // directory. All run under Node, never under a browser.
  // ---------------------------------------------------------------------------
  {
    files: [
      'scripts/**/*.{js,mjs}',
      'vite.config.js',
      'start-backend.js',
      'jest.setup.js',
      'jest.config.cjs',
      'jest/**/*.cjs',
      'mock/**/*.{js,mjs}',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        // Cypress's plugin hooks (used by `cypress.config.js` below)
        // also expose the browser-global `console` symbol.
        ...globals.browser,
        // `jest.setup.js` calls `jest.mock(...)` and friends; the
        // jest runtime is the consumer, but the symbols are present
        // at parse-time too.
        ...globals.jest,
      },
    },
    rules: {
      // Node scripts may legitimately `console.log` to surface
      // results to the terminal (e.g. `check-no-console-in-build.mjs`
      // prints a regression summary when it fails).
      'no-console': 'off',
      // Same underscore-prefix escape hatch as the source block:
      // a mock shim or setup script frequently wants a callback
      // parameter it doesn't use, and `try { ... } catch (_) { ... }`
      // is a recognised pattern (see jest.setup.js).
      'no-unused-vars': ['error', {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }],
    },
  },

  // ---------------------------------------------------------------------------
  // Cypress configuration file. Cypress's setupNodeEvents callback
  // mixes Node API surface with browser-style console output, so it
  // gets both globals.
  // ---------------------------------------------------------------------------
  {
    files: ['cypress.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];