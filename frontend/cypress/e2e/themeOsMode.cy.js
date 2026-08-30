/**
 * End-to-end coverage for the "Follow my OS preference" mode in
 * Settings — the 'os' mode of `ThemeProvider`.
 *
 * Settings.cy.js covers the explicit light/dark toggle (issue #85)
 * and the "first-time visitor is dark" behaviour (issue #129). What
 * it doesn't cover is the `mode === 'os'` path of `ThemeProvider`:
 *
 *   - The `useEffect` that subscribes to `matchMedia('(prefers-color-scheme: dark)').change`
 *     and updates `osTheme` when the OS preference flips live.
 *   - The `resetToOsPreference` callback (`setMode('os')`).
 *   - The `setMode('os')` write path that stores `'os'` in
 *     localStorage so the choice survives a full reload.
 *   - The `resolveTheme('os', osTheme)` branch that returns `osTheme`
 *     instead of the user's explicit pick.
 *
 * The settings.cy.js test "offers 'Follow my OS preference' once an
 * explicit choice has been made" clicks the follow-OS button from a
 * previously-explicit choice — that exercises `resetToOsPreference`.
 * It does NOT cover the cold-start case: arriving at the app with
 * `theme-mode === 'os'` already in localStorage. That is exactly
 * the path that exercises the OS-following `useEffect` and the
 * `setMode('os')` code paths from a non-default starting state.
 *
 * Headless Chromium runs without a real user preference, so we can't
 * exercise the live OS flip (the OS-change listener never fires),
 * but we can still prove the user-visible behaviour:
 *
 *   1. With `localStorage['theme-mode'] === 'os'` set before mount,
 *      the app renders using whatever the OS preference resolves to
 *      (in headless Chromium that is 'light' by default — so we
 *      assert the navbar is `bg-light`).
 *   2. The Settings page shows "Follow OS" as the current mode.
 *   3. Clicking the explicit-toggle when in 'os' mode switches to
 *      an explicit dark/light choice, hiding the follow-OS button.
 *   4. Toggling back to the OS-driven state and reloading preserves
 *      the 'os' choice across reload.
 */

// Mirrors the THEME_STORAGE_KEY export from src/theme/ThemeProvider.jsx
// (the same string is used by the boot script in public/theme-bootstrap.js).
const THEME_STORAGE_KEY = 'theme-mode';

describe('Settings — "Follow my OS preference" mode', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    // Seed localStorage BEFORE the visit so the boot script + the
    // React effect both see the 'os' choice. The browser-level
    // matchMedia in headless Chromium defaults to "no preference",
    // which the ThemeProvider resolves to 'light'.
    cy.window().then((win) => {
      win.localStorage.setItem(THEME_STORAGE_KEY, 'os');
    });
  });

  it('renders with the OS preference when the stored mode is "os"', () => {
    // Land on the home page first so the navbar's effect runs and
    // paints <html data-bs-theme="...">.
    cy.visit('/');

    // Navbar reflects the resolved OS theme. Headless Chromium has no
    // `prefers-color-scheme: dark` set, so the resolve falls through
    // to 'light'.
    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="main-navigation"]').should(($nav) => {
      expect($nav.hasClass('bg-light')).to.equal(true);
      expect($nav.attr('data-bs-theme')).to.equal('light');
    });
  });

  it('shows "Follow OS" as the current mode and hides the follow-OS button in Settings', () => {
    cy.visit('/settings');
    cy.get('[data-testid="settings-page"]', { timeout: 10000 }).should('be.visible');

    // Settings reflects the stored 'os' mode.
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');

    // No follow-OS button — we're already following the OS, the
    // button only appears when the user has made an explicit choice
    // and wants to opt back into OS-driven theming.
    cy.get('[data-testid="settings-follow-os-button"]').should('not.exist');
  });

  it('clicking the explicit toggle while in "os" mode switches to an explicit choice', () => {
    cy.visit('/settings');
    cy.get('[data-testid="settings-page"]', { timeout: 10000 }).should('be.visible');

    // Sanity-check we're starting from OS mode.
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');

    // Click the dark-mode toggle once. Because the current resolved
    // theme is 'light' (OS preference), the toggle is unchecked;
    // clicking it on switches the mode to 'dark' via `setMode`. This
    // exercises the `setMode` callback from ThemeProvider.
    cy.get('[data-testid="settings-dark-mode-switch"]').click();

    // The mode badge now reads 'Dark' (not 'Follow OS').
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Dark');

    // The follow-OS button is now visible — we've left the OS-driven
    // state, and Settings offers a way back.
    cy.get('[data-testid="settings-follow-os-button"]').should('be.visible');

    // Navbar palette reflects the explicit choice.
    cy.get('[data-testid="main-navigation"]').should(($nav) => {
      expect($nav.hasClass('bg-dark')).to.equal(true);
      expect($nav.attr('data-bs-theme')).to.equal('dark');
    });

    // localStorage was written with the explicit choice (not 'os'
    // any more). This is the `writeStoredMode(next)` branch of
    // ThemeProvider.
    cy.window().then((win) => {
      expect(win.localStorage.getItem(THEME_STORAGE_KEY)).to.equal('dark');
    });
  });

  it('"os" mode survives a full page reload', () => {
    // Start in 'os' mode (set in beforeEach) and reload — the
    // boot script reads localStorage synchronously, so the navbar
    // is painted with the OS-resolved theme before React mounts.
    cy.visit('/');
    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="main-navigation"]').should(($nav) => {
      expect($nav.hasClass('bg-light')).to.equal(true);
      expect($nav.attr('data-bs-theme')).to.equal('light');
    });

    cy.reload();

    // After reload, navbar still reflects the OS-resolved theme and
    // localStorage still reads 'os'.
    cy.get('[data-testid="main-navigation"]').should(($nav) => {
      expect($nav.hasClass('bg-light')).to.equal(true);
      expect($nav.attr('data-bs-theme')).to.equal('light');
    });
    cy.window().then((win) => {
      expect(win.localStorage.getItem(THEME_STORAGE_KEY)).to.equal('os');
    });

    // Settings page reports "Follow OS" as the current mode.
    cy.visit('/settings');
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');
  });
});