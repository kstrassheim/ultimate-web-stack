/**
 * Regression guard for issue #145 — CSP blocks the synchronous theme
 * bootstrap script in `index.html`.
 *
 * Background:
 *   The SPA's CSP is `script-src 'self'` with no `'unsafe-inline'`,
 *   no nonce, and no `sha256-…` hash (issue #98). A pre-#145
 *   `frontend/index.html` carried the theme-bootstrap as an inline
 *   `<script>` whose content was therefore silently blocked at
 *   runtime; the React-side `ThemeProvider` masked the visible
 *   effect by re-applying `data-bs-theme` from a `useEffect` after
 *   first paint — visible as a brief light-themed flash on a
 *   dark-by-default site.
 *
 *   The fix chosen here (issue option 2) moves the boot script into
 *   `frontend/public/theme-bootstrap.js` and loads it via
 *   `<script src="/theme-bootstrap.js">` in `<head>`. External
 *   same-origin scripts are allowed by `'self'`, so CSP stays clean
 *   and the script content can change without the CSP needing to
 *   follow a new SHA-256 (the option-1 alternative).
 *
 * These tests pin all three load-bearing parts of that contract:
 *
 *   1. `frontend/public/theme-bootstrap.js` exists and contains the
 *      expected resolution logic. A future change that deletes the
 *      file or strips the localStorage/matchMedia branches fails
 *      here.
 *
 *   2. `frontend/index.html` references it via
 *      `<script src="/theme-bootstrap.js">` — without `defer` /
 *      `async`, in `<head>`, so it still runs synchronously before
 *      `<body>` is parsed. A future refactor that drops the script
 *      tag, moves it to the body, or adds `defer`/`async` would
 *      silently re-introduce the FOUC and these tests catch it.
 *
 *   3. `frontend/index.html` does NOT contain an inline `<script>`
 *      tag with executable content. This is the regression guard
 *      for the actual #145 failure mode: a future PR that moves the
 *      boot logic back into `index.html` (e.g. someone trying to
 *      inline a snippet for "convenience") fails here with a clear
 *      message, instead of silently re-opening the FOUC + CSP block.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.resolve(__dirname);
const INDEX_HTML_PATH = path.resolve(__dirname, '..', 'index.html');
const BOOT_SCRIPT_PATH = path.join(PUBLIC_DIR, 'theme-bootstrap.js');

// Read both files once at module load. They're tiny and the regex
// assertions are simpler when the source is a single string.
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const bootScript = fs.readFileSync(BOOT_SCRIPT_PATH, 'utf8');

describe('theme-bootstrap.js (issue #145)', () => {
  test('public/theme-bootstrap.js exists', () => {
    // Sanity check — fs.readFileSync above would have thrown
    // ENOENT at module load if the file is missing. Asserting
    // explicitly gives a clearer failure message than the catch-all
    // "bootScript is undefined" that would follow from a missing
    // file.
    expect(fs.existsSync(BOOT_SCRIPT_PATH)).toBe(true);
  });

  test('public/theme-bootstrap.js contains the expected resolution logic', () => {
    // Pin every behavioural branch. A future change that rewrites
    // the script using a different storage key, an unsupported
    // default, or skips matchMedia silently regresses #85/#129 and
    // is caught here.
    //
    // The exact string literals are stable contract markers, not
    // implementation details — they must stay in lockstep with the
    // key/attribute used by ThemeProvider.jsx (THEME_STORAGE_KEY
    // === 'theme-mode', attribute === 'data-bs-theme') and the OS
    // query string used by both ThemeProvider.detectOsTheme and
    // detectOsTheme in the script.
    expect(bootScript).toMatch(/'theme-mode'/);
    expect(bootScript).toMatch(/prefers-color-scheme: dark/);
    expect(bootScript).toMatch(/setAttribute\('data-bs-theme'/);
  });

  test('public/theme-bootstrap.js preserves the dark default (issue #129)', () => {
    // The pre-#129 default was 'light'; #129 made dark the safe
    // default. Pin both the no-stored-value branch AND the
    // catch-all error branch so a future "simplification" that
    // reverts the default to light fails this test.
    expect(bootScript).toMatch(/theme\s*=\s*'dark'/);
  });
});

describe('index.html — boot script wiring (issue #145)', () => {
  test('references /theme-bootstrap.js via <script src="...">', () => {
    // The whole point of the fix — the boot script is loaded via
    // an external src, not as an inline <script>. Match the tag
    // shape so a future change that adds a `defer`, an `async`, or
    // a `type="module"` (any of which would change the script's
    // synchronous-before-body-paint timing) fails this test.
    expect(indexHtml).toMatch(
      /<script\s+src="\/theme-bootstrap\.js"\s*><\/script>/,
    );
  });

  test('boot script tag is in <head>, before <body>', () => {
    // The script must execute before the body parses; Vite / the
    // browser only guarantee that ordering for tags in <head>
    // without `defer` / `async`. Pin the order so a future move to
    // the bottom of <body> (which would break the FOUC prevention
    // even with the external script) fails here.
    const headOpen = indexHtml.indexOf('<head>');
    const bodyOpen = indexHtml.indexOf('<body>');
    const scriptAt = indexHtml.indexOf('/theme-bootstrap.js');
    expect(headOpen).toBeGreaterThan(-1);
    expect(bodyOpen).toBeGreaterThan(headOpen);
    expect(scriptAt).toBeGreaterThan(headOpen);
    expect(scriptAt).toBeLessThan(bodyOpen);
  });

  test('index.html contains no inline <script> with executable content', () => {
    // The regression guard for the original #145 failure mode.
    //
    // The pre-#145 HTML contained a `<script>...</script>` block
    // with the boot logic inline; CSP blocked it at runtime. If
    // someone re-inlines the script (e.g. "for convenience", or as
    // part of an unrelated cleanup that moves assets around), CSP
    // blocks it again and the FOUC comes back. This test fails
    // fast in CI with a clear pointer to the offending tag.
    //
    // Two stripping passes:
    //
    //   1. Drop HTML comments so the `<script src="...">` text
    //      inside the boot-script explanatory comment doesn't
    //      count as an executable tag.
    //   2. Drop the two allowed `<script>` tags (the external
    //      boot script and the Vite `/src/main.jsx` module entry)
    //      so the residual-text assertion is precisely "any other
    //      `<script>` would be an inline script CSP blocks".
    //
    // After both passes, the only `<script>` text left would be a
    // re-introduced inline `<script>...</script>` block, which is
    // the regression this test is here to catch.
    const withoutComments = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
    const withoutExternalScripts = withoutComments
      .replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '')
      .replace(/<script\s+type="module"[^>]*><\/script>/g, '');
    expect(withoutExternalScripts).not.toMatch(/<script[\s>]/i);
  });
});