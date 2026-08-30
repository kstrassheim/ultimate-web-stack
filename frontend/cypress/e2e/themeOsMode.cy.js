/**
 * End-to-end coverage for the "Follow my OS preference" mode in
 * Settings — the 'os' mode of `ThemeProvider`.
 *
 * settings.cy.js covers the explicit light/dark toggle (issue #85)
 * and the "first-time visitor is dark" behaviour (issue #129). What
 * it doesn't cover is the `mode === 'os'` path of `ThemeProvider`:
 *
 *   - The `useEffect` that subscribes to
 *     `matchMedia('(prefers-color-scheme: dark)').change`
 *     and updates `osTheme` when the OS preference flips live.
 *   - The `resetToOsPreference` callback (`setMode('os')`).
 *   - The `setMode('os')` write path that stores `'os'` in
 *     localStorage so the choice survives a full reload.
 *   - The `resolveTheme('os', osTheme)` branch that returns `osTheme`
 *     instead of the user's explicit pick.
 *
 * Headless Chromium runs without a real user preference, so we can't
 * exercise the live OS flip (the OS-change listener never fires),
 * but we can still prove the user-visible behaviour:
 *
 *   1. With `localStorage['theme-mode'] === 'os'` set before mount,
 *      the app renders using whatever the OS preference resolves to.
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
    // React effect both see the 'os' choice. Headless Chromium has
    // no `prefers-color-scheme: dark` set, so the ThemeProvider
    // resolves to 'light'.
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

    // Mode is now explicit 'Dark', and the follow-OS button
    // reappears — it's the affordance for "I'm done with the
    // explicit pick, take me back to OS-driven".
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Dark');
    cy.get('[data-testid="settings-follow-os-button"]').should('be.visible');

    // Clicking the follow-OS button restores mode='os'. The
    // current-mode indicator flips back to "Follow OS".
    cy.get('[data-testid="settings-follow-os-button"]').click();
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');
  });

  it('persists "os" mode across a full page reload', () => {
    cy.visit('/settings');
    cy.get('[data-testid="settings-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');

    // Hard reload. After the reload, the boot script reads
    // theme-mode='os' from localStorage and ThemeProvider mounts
    // into mode='os'. The page must still report "Follow OS".
    cy.reload();
    cy.get('[data-testid="settings-page"]').should('be.visible');
    cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');

    // localStorage key still holds the 'os' value — round-tripped
    // through the reload.
    cy.window().then((win) => {
      expect(win.localStorage.getItem(THEME_STORAGE_KEY)).to.equal('os');
    });
  });
});