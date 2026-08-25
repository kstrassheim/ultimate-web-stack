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
 *
 * The HTML assertions go through JSDOM rather than regex stripping.
 * JSDOM's HTML parser handles attribute whitespace, comment nesting,
 * `<script>`/`<SCRIPT>` case variants, and other quirks that a
 * naive `<script…</script>` regex would silently get wrong — and
 * more importantly, it's what CodeQL's "bad HTML filtering regexp"
 * check is steering us away from. JSDOM is already loaded by the
 * Jest `jsdom` environment so no extra dependency is added.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC_DIR = path.resolve(__dirname);
const INDEX_HTML_PATH = path.resolve(__dirname, '..', 'index.html');
const BOOT_SCRIPT_PATH = path.join(PUBLIC_DIR, 'theme-bootstrap.js');

// Read both files once at module load. They're tiny and the regex
// assertions are simpler when the source is a single string.
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const bootScript = fs.readFileSync(BOOT_SCRIPT_PATH, 'utf8');

// One JSDOM parse per test run — re-used by every assertion that
// needs to walk the parsed DOM tree. Parsing is the slow part; the
// resulting Document object is read-only for these assertions.
const parsedIndex = new JSDOM(indexHtml);
const document = parsedIndex.window.document;

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
    // the script's DARK_QUERY constant.
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
  // Pull the boot-script <script> tag (and only that one) out of
  // the parsed DOM. This is the load-bearing assertion: the file
  // MUST load the boot script via an external `src`, not inline.
  // Using the JSDOM-parsed tag (rather than regex on the source)
  // means the test accepts any attribute order / whitespace, and
  // is robust to a future "tighten the tag shape" refactor that
  // keeps the semantics identical.
  const scriptTags = Array.from(document.querySelectorAll('script'));
  const bootScriptTag = scriptTags.find(
    (tag) => tag.getAttribute('src') === '/theme-bootstrap.js',
  );

  test('references /theme-bootstrap.js via <script src="...">', () => {
    // The whole point of the fix — the boot script is loaded via
    // an external src, not as an inline <script>. Asserting on the
    // parsed tag (not the raw markup) means the test is robust to
    // a future refactor that tightens attribute whitespace but
    // keeps semantics identical. The tag MUST exist, MUST have the
    // src we expect, and MUST NOT carry executable inline content.
    expect(bootScriptTag).toBeDefined();
    // Inline script tags have no `src`; double-check the parsed
    // tag really is external so the regression guard below
    // ("no inline `<script>`") is meaningful.
    expect(bootScriptTag.hasAttribute('src')).toBe(true);
    // The text content of an external `<script src="...">` is
    // intentionally empty — anything in there would be a CSP
    // violation AND a sign someone tried to inline something for
    // "convenience". Empty-string check catches that mistake.
    expect(bootScriptTag.textContent).toBe('');
    // No defer/async — either of those would change the script's
    // synchronous-before-body-paint timing and silently re-open
    // the FOUC.
    expect(bootScriptTag.hasAttribute('defer')).toBe(false);
    expect(bootScriptTag.hasAttribute('async')).toBe(false);
  });

  test('boot script tag is in <head>, before <body>', () => {
    // The script must execute before the body parses; the browser
    // only guarantees that ordering for tags in <head> without
    // `defer`/`async`. Pin the order so a future move to the
    // bottom of <body> (which would break the FOUC prevention
    // even with the external script) fails here.
    const head = document.querySelector('head');
    const body = document.querySelector('body');
    expect(head).not.toBeNull();
    expect(body).not.toBeNull();
    // document.querySelectorAll returns elements in document
    // order; the boot script must precede the body.
    const allElements = Array.from(document.querySelectorAll('head, script[src="/theme-bootstrap.js"], body'));
    const headIdx = allElements.indexOf(head);
    const bootIdx = allElements.indexOf(bootScriptTag);
    const bodyIdx = allElements.indexOf(body);
    expect(headIdx).toBeGreaterThanOrEqual(0);
    expect(bootIdx).toBeGreaterThan(headIdx);
    expect(bodyIdx).toBeGreaterThan(bootIdx);
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
    // Walk every <script> tag in the parsed DOM and flag the ones
    // that have NO external `src` attribute (those are the inline
    // ones — CSP blocks them, the FOUC comes back). The two
    // allowed inline-looking tags are:
    //   - `<script src="/theme-bootstrap.js">` (the boot script
    //     that this PR introduces), and
    //   - `<script type="module" src="/src/main.jsx">` (Vite's
    //     module entry, present in the original HTML).
    // Both have an `src`, so neither trips this assertion. The
    // `<script type="module" src="...">` from the Vite build's
    // bundle is also caught by `hasAttribute('src')` — same rule.
    const inlineScripts = scriptTags.filter((tag) => !tag.hasAttribute('src'));
    expect(inlineScripts).toEqual([]);
  });
});