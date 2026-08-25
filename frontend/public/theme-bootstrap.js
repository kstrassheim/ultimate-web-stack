/*
 * Synchronous theme bootstrap (issue #85, updated for #129).
 *
 * This script is loaded from `frontend/index.html` via a
 * `<script src="/theme-bootstrap.js">` tag in `<head>` — it MUST
 * stay in head, without `defer`/`async`, so it runs synchronously
 * before `<body>` is parsed and the very first paint already
 * carries the right Bootstrap 5.3 theme (`data-bs-theme` cascades
 * from <html> to navbar, cards, forms, dropdowns, …).
 *
 * The script lives in `public/` (instead of inline in `index.html`)
 * because the SPA's CSP is `script-src 'self'` with no
 * `'unsafe-inline'` / no nonce / no hash (issue #98, tightened by
 * the same change set that introduced this header). An inline
 * `<script>` would be silently blocked at runtime, leaving the
 * React-side `ThemeProvider` to set `data-bs-theme` from a
 * `useEffect` after first paint — visible as a brief light-themed
 * flash on a dark-by-default site.
 *
 * `script-src 'self'` allows a script file served from the same
 * origin (Vite copies `public/theme-bootstrap.js` verbatim to
 * `dist/theme-bootstrap.js` during build; in dev it is served from
 * the same path), so we keep CSP clean — no `'unsafe-inline'`, no
 * `sha256-…` hash to keep in lockstep with the script bytes.
 *
 * Resolution order, in lockstep with `src/theme/ThemeProvider.jsx`:
 *   1. localStorage["theme-mode"] if it is 'light' or 'dark' — the
 *      user already chose, honour it.
 *   2. localStorage["theme-mode"] === 'os' — the user explicitly
 *      asked to follow the OS, so resolve via prefers-color-scheme.
 *      If matchMedia is unavailable we fall back to dark.
 *   3. No stored value (first visit, or localStorage throws) —
 *      'dark' is the safe default per issue #129. OS preference
 *      does NOT participate unless the user opts into 'os' mode
 *      in Settings.
 *
 * `theme-mode` === 'os' is the only stored value where this script
 * needs to look at matchMedia; explicit light/dark choices skip
 * that step entirely so a user who picked light stays on light even
 * when their OS reports dark.
 */
(function () {
  var KEY = 'theme-mode';
  var DARK_QUERY = '(prefers-color-scheme: dark)';
  var theme;
  try {
    var stored = null;
    try { stored = window.localStorage.getItem(KEY); } catch (_) { stored = null; }
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (stored === 'os') {
      theme = (window.matchMedia && window.matchMedia(DARK_QUERY).matches) ? 'dark' : 'light';
      if (!window.matchMedia) theme = 'dark'; // match ThemeProvider.detectOsTheme
    } else {
      // No stored value — dark is the safe default (issue #129).
      theme = 'dark';
    }
    document.documentElement.setAttribute('data-bs-theme', theme);
  } catch (_) {
    // If anything explodes (very old browsers), default to dark
    // (issue #129 — light is no longer the safe default).
    document.documentElement.setAttribute('data-bs-theme', 'dark');
  }
})();