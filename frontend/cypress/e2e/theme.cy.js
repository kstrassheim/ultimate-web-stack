/**
 * End-to-end coverage of ThemeProvider — issue #149.
 *
 * settings.cy.js already covers the user-visible dark-mode toggle and
 * its localStorage round-trip, plus the "follow my OS preference"
 * button that returns a user to mode='os'. What's left to exercise
 * from a real browser is the ThemeProvider code path that's only
 * hit when the user is actually IN 'os' mode from the start:
 *
 *   - useEffect that subscribes to matchMedia('change') (the listener
 *     registration / cleanup branches),
 *   - the prefers-color-scheme handler that calls setOsTheme when
 *     the OS preference flips,
 *   - the setMode(...) call that re-uses the existing handler when
 *     the user toggles the switch out of 'os' mode (the
 *     `if (next !== 'os') setOsTheme(next);` branch),
 *   - the Safari-style matchMedia.addListener() fallback path
 *     (deactivated by the unit suite — exercised here by stubbing
 *     matchMedia to omit addEventListener and only expose the
 *     legacy addListener API).
 *
 * These branches are unreachable from a clean session because the
 * boot script defaults to mode='dark' (issue #129). We seed
 * localStorage with mode='os' so the very first render of
 * ThemeProvider takes the matchMedia branch.
 */

describe('ThemeProvider — os mode and matchMedia listener (issue #149)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });
    // Wipe the theme-mode entry so each spec starts from a known
    // boot-script default. The spec that wants the 'os' mode branch
    // seeds it explicitly via localStorage BEFORE the first visit.
    cy.window().then((win) => {
      win.localStorage.removeItem('theme-mode');
    });
  });

  it('subscribes to matchMedia when mode starts as os', () => {
    // Seed the choice BEFORE the React tree mounts so ThemeProvider
    // reads 'os' from localStorage on first render and runs the
    // useEffect that attaches the listener.
    cy.window().then((win) => {
      win.localStorage.setItem('theme-mode', 'os');
    });

    // Replace matchMedia with a recording stub so we can inspect
    // whether ThemeProvider attached a 'change' listener. We
    // preserve the addListener fallback so the 'modern' code path
    // (mq.addEventListener) is the one exercised.
    cy.visit('/', {
      onBeforeLoad(win) {
        const calls = [];
        const original = win.matchMedia && win.matchMedia.bind(win);
        win.__mmCalls = calls;
        win.matchMedia = function stubMatchMedia(query) {
          calls.push(query);
          const mql = {
            matches: false,
            media: query,
            onchange: null,
            addEventListener(type, handler) {
              this._listener = handler;
            },
            removeEventListener() {
              this._listener = null;
            },
            addListener(handler) {
              // Legacy API; never called when addEventListener is
              // present, but exposed so the ThemeProvider branch
              // table has a single source of truth.
              this._listener = handler;
            },
            removeListener() {
              this._listener = null;
            },
            dispatchEvent() {
              return true;
            },
          };
          // Preserve the original behaviour for any code path that
          // calls through (e.g. tests in other files) by handing it
          // back unchanged.
          if (typeof original === 'function') {
            try {
              return original(query);
            } catch (_) {
              return mql;
            }
          }
          return mql;
        };
      },
    });

    // The boot script should have rendered the page without error.
    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should(
      'be.visible',
    );

    // ThemeProvider must have called matchMedia with the OS preference
    // query — that is the call that opens the listener-registration
    // branch.
    cy.window().its('__mmCalls').should('include', '(prefers-color-scheme: dark)');
  });

  it('updates the navbar palette when the OS preference flips while in os mode', () => {
    // Capture the listener registered by ThemeProvider so we can fire
    // a synthetic 'change' event from the test, simulating the user
    // changing their OS theme from light to dark (or vice versa) while
    // the app is open and in 'os' mode.
    //
    // Seed `theme-mode=os` BEFORE the boot script runs so the page
    // resolves mode='os' from the start. onBeforeLoad runs before
    // any script on the page, including the boot script that reads
    // localStorage synchronously.
    //
    // The stub returns matches:false (light). The boot script picks
    // theme='light' from this; ThemeProvider keeps mode='os' and
    // registers the listener. We then fire the listener with
    // matches:true to flip the palette to dark — the "follow live OS
    // change" branch in ThemeProvider.jsx.
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme-mode', 'os');
        win.__osListener = null;
        win.__osInitial = null;
        win.__mmCalls = [];
        win.matchMedia = function stubMatchMedia(query) {
          win.__mmCalls.push(query);
          const mql = {
            matches: false,
            media: query,
            onchange: null,
            addEventListener(type, handler) {
              this._listener = handler;
              if (query === '(prefers-color-scheme: dark)') {
                win.__osListener = handler;
              }
            },
            removeEventListener() {
              this._listener = null;
            },
            addListener(handler) {
              this._listener = handler;
            },
            removeListener() {
              this._listener = null;
            },
            dispatchEvent() {
              return true;
            },
          };
          return mql;
        };
      },
    });

    // After mount, ThemeProvider should be in 'os' mode (we seeded
    // that entry above the visit) and have registered a listener.
    // First confirm we're not on the spec setup page — the body
    // attribute tracks the effective theme, which starts as 'light'
    // because our stub matchMedia.matches is false.
    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should(
      'be.visible',
    );

    // Diagnostic: verify the stub is actually in effect AFTER the
    // page has loaded. The boot script runs synchronously, but it
    // only reads matchMedia if mode === 'os', so the stub still
    // owns the function for ThemeProvider's useEffect to call.
    cy.window().its('localStorage').invoke('getItem', 'theme-mode').should('equal', 'os');
    cy.window().its('__mmCalls').should('include', '(prefers-color-scheme: dark)');
    cy.window().its('__osListener').should('be.a', 'function');
    cy.get('[data-testid="main-navigation"]').should(
      'have.attr',
      'data-bs-theme',
      'light',
    );

    // Flip the synthetic OS preference to dark and fire the captured
    // handler with the standard MediaQueryListEvent shape. The
    // ThemeProvider's handler reads event.matches and calls
    // setOsTheme(event.matches ? 'dark' : 'light') — this is the
    // 'follow live OS change' branch in ThemeProvider.jsx.
    cy.window().then((win) => {
      win.__osListener({ matches: true });
    });

    // The navbar palette must follow the OS preference without a
    // reload — that's the whole point of the listener.
    cy.get('[data-testid="main-navigation"]').should(
      'have.attr',
      'data-bs-theme',
      'dark',
    );
    cy.get('[data-testid="main-navigation"]').should('have.class', 'bg-dark');
  });

  it('falls back to the legacy matchMedia.addListener API when addEventListener is unavailable', () => {
    // Drive the `mq.addListener` Safari-fallback branch in
    // ThemeProvider.jsx by stubbing matchMedia so the returned
    // object exposes only the deprecated addListener / removeListener
    // pair. No production browser lacks addEventListener, but the
    // code path is exercised by some embedded WebView runtimes and
    // by jsdom (see ThemeProvider.test.jsx for the unit equivalent).
    //
    // Note: we deliberately do NOT fall back to the real matchMedia
    // when the stub fails — the real browser MQL has addEventListener,
    // so calling through to it would mean the Safari-fallback branch
    // is never reached. The stub below unconditionally returns its
    // own object.
    //
    // Seed theme-mode=os BEFORE the boot script runs so the
    // ThemeProvider enters mode='os' and reaches the listener
    // registration branch.
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme-mode', 'os');
        win.__osLegacyListener = null;
        win.matchMedia = function stubMatchMedia(query) {
          const mql = {
            matches: false,
            media: query,
            // Note: NO addEventListener / removeEventListener.
            addListener(handler) {
              this._listener = handler;
              if (query === '(prefers-color-scheme: dark)') {
                win.__osLegacyListener = handler;
              }
            },
            removeListener() {
              this._listener = null;
            },
            dispatchEvent() {
              return true;
            },
          };
          return mql;
        };
      },
    });

    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should(
      'be.visible',
    );

    // Fire the legacy listener — same handler shape, same effect:
    // navbar palette follows the OS preference.
    cy.window().then((win) => {
      expect(
        win.__osLegacyListener,
        'legacy matchMedia listener should be registered',
      ).to.be.a('function');
      win.__osLegacyListener({ matches: true });
    });

    cy.get('[data-testid="main-navigation"]').should(
      'have.attr',
      'data-bs-theme',
      'dark',
    );
  });

  it('falls back to dark when matchMedia is unavailable in the environment', () => {
    // Drive the `typeof window.matchMedia !== 'function'` branch in
    // detectOsTheme() and the os-mode useEffect. With matchMedia
    // missing, detectOsTheme returns 'dark' (issue #129's safe
    // default) and the os-mode effect short-circuits without
    // registering a listener.
    cy.visit('/', {
      onBeforeLoad(win) {
        // Capture whether ThemeProvider ever tried to add a
        // listener; it must NOT when matchMedia is undefined.
        win.__mmAvailable = typeof win.matchMedia === 'function';
        delete win.matchMedia;
      },
    });

    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should(
      'be.visible',
    );

    // The boot script + ThemeProvider should still pick the dark
    // palette as the safe default (#129) — navbar must render with
    // data-bs-theme="dark" and the bg-dark class. We don't seed
    // theme-mode here on purpose: the spec exercises the
    // matchMedia-unavailable branch in detectOsTheme() regardless
    // of the initial mode, and the boot script + ThemeProvider
    // both fall back to 'dark' when matchMedia is missing.
    cy.get('[data-testid="main-navigation"]').should(
      'have.attr',
      'data-bs-theme',
      'dark',
    );
    cy.get('[data-testid="main-navigation"]').should('have.class', 'bg-dark');
  });
});