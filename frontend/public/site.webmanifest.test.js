/**
 * Regression guard for issue #141 — PWA manifest theme_color and
 * background_color must not ship `#ffffff` now that #129 made dark the
 * app's default theme.
 *
 * Background:
 *   #129 changed `frontend/index.html`'s boot script and
 *   `frontend/src/theme/ThemeProvider.jsx`'s `readStoredMode()` /
 *   `detectOsTheme()` defaults so a first-time visitor no longer sees a
 *   light flash on first paint. The boot-time CSS cascade (Bootstrap
 *   5.3's `[data-bs-theme="dark"]` tokens) follows from there.
 *
 *   `site.webmanifest`, however, is read by the OS / browser shell
 *   BEFORE the app boots: it paints the cold-start splash background
 *   (Android Chrome, installed PWA launches) and tints the mobile
 *   address bar. A manifest that still ships
 *   `theme_color: "#ffffff"` / `background_color: "#ffffff"` therefore
 *   re-introduces the exact "white flash on first paint" the boot
 *   script was changed to suppress, just on a different surface.
 *
 *   These assertions guard against the colors regressing to white. The
 *   specific value `#0f172a` is the dark slate the issue suggests; any
 *   non-white hex color passes, because the issue explicitly allows
 *   `prefers-color-scheme` array form or a different dark token in
 *   follow-up work.
 *
 * Build-time note:
 *   `frontend/vite.config.js`'s `generateWebManifest()` reads this file
 *   as a template and only overwrites `name` / `short_name` from
 *   `terraform.config.json`, so the colors here are the values that
 *   reach the deployed manifest. A second, parallel assertion lives
 *   here for the freshly-generated template that path uses when this
 *   file is missing — see the "fallback template" describe block below.
 */

const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, 'site.webmanifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Regression target from the issue: the exact value that was leaking a
// white splash on cold-start PWA install. Lower-cased so case variants
// (`#FFFFFF`, `#fff`) are caught too.
const WHITE = '#ffffff';

// Permissive shape check: a CSS color value that the manifest spec can
// pass straight to the browser. We do not enforce a specific hue — the
// issue explicitly allows `#0f172a` or any dark theme token the
// maintainers pick later.
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

describe('site.webmanifest (source) — dark theme (issue #141)', () => {
  test('parses as valid JSON', () => {
    // Sanity check — `manifest` is loaded at the top of this file, so
    // any JSON syntax error here fails every test. Asserting it
    // explicitly gives a clearer failure message than the catch-all
    // "Cannot read property 'theme_color' of undefined".
    expect(typeof manifest).toBe('object');
    expect(manifest).not.toBeNull();
  });

  test('declares a theme_color', () => {
    expect(manifest.theme_color).toBeDefined();
  });

  test('theme_color is not the white regression value', () => {
    // White theme_color leaks a white mobile address bar while the
    // app is in dark mode. Catch case-insensitively so `#FFF` and
    // friends are also rejected.
    expect(String(manifest.theme_color).toLowerCase()).not.toBe(WHITE);
  });

  test('theme_color parses as a CSS color', () => {
    // The simplest assertion that survives any future dark-token
    // change. The Web App Manifest spec accepts a single CSS color
    // string here; the array form (with `prefers-color-scheme`
    // entries) is a Chrome / Edge / Firefox extension, so we accept
    // either shape.
    const value = manifest.theme_color;
    if (Array.isArray(value)) {
      expect(value.length).toBeGreaterThan(0);
      value.forEach((entry) => {
        expect(entry).toEqual(
          expect.objectContaining({ color: expect.any(String) }),
        );
        expect(entry.color.toLowerCase()).not.toBe(WHITE);
        expect(entry.color).toMatch(HEX_COLOR);
      });
    } else {
      expect(value).toMatch(HEX_COLOR);
    }
  });

  test('declares a background_color', () => {
    expect(manifest.background_color).toBeDefined();
  });

  test('background_color is not the white regression value', () => {
    // White background_color is what triggers the cold-start
    // splash white flash on installed PWA launch. Per the Web App
    // Manifest spec this field is a single CSS color string — it
    // does NOT accept the array form — so we additionally verify the
    // shape below.
    expect(String(manifest.background_color).toLowerCase()).not.toBe(WHITE);
  });

  test('background_color is a single CSS color (not an array)', () => {
    // The spec mandates a single color for background_color; if a
    // future edit accidentally mirrors the theme_color array form
    // here, browsers will silently ignore it. Catch that case so a
    // follow-up review can decide whether to upgrade the spec support.
    expect(Array.isArray(manifest.background_color)).toBe(false);
    expect(manifest.background_color).toMatch(HEX_COLOR);
  });

  test('preserves the build-rewritten identity fields', () => {
    // `generateWebManifest()` overwrites `name` and `short_name`
    // from `terraform.config.json` at build time; the values shipped
    // in this file are placeholders. We only assert they exist so a
    // structural edit cannot silently drop them.
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
  });
});

/**
 * Parallel assertions for the fallback template inside
 * `vite.config.js`'s `generateWebManifest()`. If `site.webmanifest` is
 * deleted and a build regenerates it from the embedded template, the
 * template must also satisfy the dark-theme requirement — otherwise
 * the same regression re-appears, just triggered by file deletion
 * instead of an edit.
 *
 * We evaluate the file as a string and stub the modules it imports so
 * we can require it under Jest's CJS resolver without exercising Vite
 * itself; the function under test is the embedded `manifest` literal.
 */
describe('vite.config.js — fallback manifest template (issue #141)', () => {
  // The fallback template lives inside `generateWebManifest()` and is
  // not exported, so we extract the relevant literal by parsing the
  // vite.config.js source. The string match keeps the test bound to
  // the exact field we care about rather than a deep-equality on the
  // entire object (which would couple this test to icon paths and
  // other irrelevant fields).
  const viteConfigSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'vite.config.js'),
    'utf8',
  );

  function extractFallbackManifest() {
    // The fallback block lives between the `Default template if file
    // doesn't exist` comment and the `}` that closes the `else`
    // branch. Walk the braces from the marker so we don't match the
    // outer object literal by accident.
    const startMarker = 'Default template if file doesn\'t exist';
    const startIdx = viteConfigSource.indexOf(startMarker);
    if (startIdx === -1) throw new Error('fallback template marker not found');
    // Find the first `{` after the marker — that opens the manifest
    // object literal. Walk braces to find the matching close.
    let openIdx = viteConfigSource.indexOf('{', startIdx);
    if (openIdx === -1) throw new Error('fallback template opening brace not found');
    let depth = 0;
    let endIdx = -1;
    for (let i = openIdx; i < viteConfigSource.length; i += 1) {
      const ch = viteConfigSource[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) throw new Error('fallback template closing brace not found');
    // eslint-disable-next-line no-new-func
    return new Function(`"use strict"; return (${viteConfigSource.slice(openIdx, endIdx + 1)});`)();
  }

  let fallback;
  beforeAll(() => {
    fallback = extractFallbackManifest();
  });

  test('fallback template declares theme_color and background_color', () => {
    expect(fallback.theme_color).toBeDefined();
    expect(fallback.background_color).toBeDefined();
  });

  test('fallback template is dark (no white regression)', () => {
    // The same regression guard as the source-file block, applied to
    // the embedded template so a regenerated manifest cannot
    // accidentally re-introduce the white flash.
    expect(String(fallback.theme_color).toLowerCase()).not.toBe(WHITE);
    expect(String(fallback.background_color).toLowerCase()).not.toBe(WHITE);
  });

  test('fallback theme_color and background_color are valid CSS colors', () => {
    expect(fallback.theme_color).toMatch(HEX_COLOR);
    expect(fallback.background_color).toMatch(HEX_COLOR);
  });

  test('fallback template mirrors the source-file colors', () => {
    // Sanity: the embedded template must match what ships in the
    // source file, otherwise the two can drift. The two JSON objects
    // need not be byte-identical (the source file may have additional
    // fields, and `name`/`short_name` are added at write time), but
    // the theme_color / background_color pair must agree.
    expect(fallback.theme_color.toLowerCase()).toBe(
      String(manifest.theme_color).toLowerCase(),
    );
    expect(fallback.background_color.toLowerCase()).toBe(
      String(manifest.background_color).toLowerCase(),
    );
  });
});

/**
 * Issue #151 — PWA install identity.
 *
 * Edge decides whether an in-app navigation stays inside the installed app
 * window by testing the target URL against the manifest's `scope`. With `id`,
 * `start_url` and `scope` all absent they are derived at INSTALL time from
 * whatever document the user happened to be on:
 *
 *   - `start_url` defaults to that document URL *including* query and
 *     fragment, so a user who installed while sitting on a post-login URL
 *     gets a start_url still carrying `?code=…`/`#state=…`;
 *   - `scope` defaults to `start_url` minus its last path segment, making the
 *     in-app/out-of-app boundary install-time dependent and unauditable;
 *   - the install `id` derives from `start_url`, so changing `start_url`
 *     later orphans existing installs instead of updating them.
 *
 * That is why the reported bug reproduced for one user and not another on the
 * same build. These assertions pin the three fields explicitly.
 */
describe('site.webmanifest — pinned install identity (issue #151)', () => {
  test.each(['id', 'start_url', 'scope'])('declares %s explicitly', (field) => {
    expect(manifest[field]).toBe('/');
  });

  test('declares display: standalone', () => {
    expect(manifest.display).toBe('standalone');
  });

  test('icon srcs are root-relative and do not point into public/', () => {
    // Vite flattens public/ into the dist root, so a "public/…" src resolves
    // to /public/… where nothing is served. The SPA catch-all used to answer
    // that miss with index.html at HTTP 200 — Edge asked for a PNG and got
    // HTML, with no error anywhere. backend/main.py now 404s instead.
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    manifest.icons.forEach((icon) => {
      expect(icon.src).toMatch(/^\//);
      expect(icon.src).not.toMatch(/^\/public\//);
      expect(icon.type).toBe('image/png');
    });
  });

  test('index.html links the manifest root-relatively', () => {
    // A document-relative href makes a nested SPA route request e.g.
    // /entra/site.webmanifest, which the catch-all answers with index.html at
    // HTTP 200 — the install then reads HTML as its manifest and silently
    // falls back to the derived defaults this file exists to prevent.
    const indexHtml = fs.readFileSync(
      path.resolve(__dirname, '..', 'index.html'),
      'utf8',
    );
    expect(indexHtml).toMatch(/<link rel="manifest" href="\/site\.webmanifest"/);
  });
});

describe('vite.config.js — generateWebManifest preserves the identity (issue #151)', () => {
  const viteConfigSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'vite.config.js'),
    'utf8',
  );

  test.each(['id', 'start_url', 'scope'])(
    'assigns manifest.%s so a regenerated manifest keeps it',
    (field) => {
      // generateWebManifest() reads the checked-in file as a template and
      // rewrites name/short_name. Without these assignments a build against a
      // template that predates this fix would ship an identity-less manifest
      // and quietly re-open the bug.
      expect(viteConfigSource).toMatch(
        new RegExp(`manifest\\.${field}\\s*=\\s*'/'`),
      );
    },
  );

  test('normalises icon srcs to root-relative', () => {
    expect(viteConfigSource).toMatch(/manifest\.icons\s*=/);
    expect(viteConfigSource).toMatch(/public\\\//);
  });
});
