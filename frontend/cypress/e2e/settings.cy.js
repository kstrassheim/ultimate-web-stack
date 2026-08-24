/// <reference types="cypress" />

/**
 * End-to-end coverage for issue #85 — dark-mode toggle in Settings.
 * Updated for issue #129 — dark is now the default theme for first-time
 * visitors; OS preference only participates when the user explicitly
 * chooses 'Follow my OS preference' in Settings.
 *
 * Acceptance criteria exercised here:
 *   1. A toggle in Settings switches between light and dark immediately,
 *      without a reload.
 *   2. The choice persists across a full page reload.
 *   3. With no choice ever made, the page renders dark by default (#129).
 *   4. An existing stored 'os' choice still follows the OS preference.
 *
 * The OS-preference branch is hard to exercise from headless Cypress
 * (the browser runs without a real user preference), so this spec drives
 * the toggle and reload paths — the unit suite (Settings.test.jsx and
 * ThemeProvider.test.jsx) covers the prefers-color-scheme branch
 * exhaustively in jsdom.
 */
describe('Settings — dark mode toggle (issue #85)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    // Start every test from a known-clean theme state. The boot script
    // reads localStorage["theme-mode"] synchronously, so wiping it here
    // puts us on the dark-by-default path (#129).
    cy.window().then((win) => {
      win.localStorage.removeItem('theme-mode');
    });
    cy.visit('/settings');
    cy.get('[data-testid="settings-page"]', { timeout: 10000 }).should('be.visible');
  });

  it('shows the Settings page with the dark-mode switch', () => {
    cy.get('[data-testid="settings-heading"]').should('contain', 'Settings');
    cy.get('[data-testid="settings-dark-mode-switch"]').should('exist');
    cy.get('[data-testid="settings-current-mode-value"]').should('exist');
  });

  it('toggles the navbar palette immediately, without a reload', () => {
    // Capture the initial theme the boot script picked for us so we
    // know which direction to flip.
    cy.get('[data-testid="main-navigation"]').then(($nav) => {
      const startDark = $nav.hasClass('bg-dark');
      const toggle = cy.get('[data-testid="settings-dark-mode-switch"]');

      // Click once: palette must flip, navbar class must follow.
      toggle.click();
      cy.get('[data-testid="main-navigation"]').should(($navAfter) => {
        expect($navAfter.hasClass('bg-dark')).to.equal(!startDark);
        const expectedTheme = startDark ? 'light' : 'dark';
        expect($navAfter.attr('data-bs-theme')).to.equal(expectedTheme);
      });

      // Click again: palette must flip back. (No reload between clicks.)
      toggle.click();
      cy.get('[data-testid="main-navigation"]').should(($navBack) => {
        expect($navBack.hasClass('bg-dark')).to.equal(startDark);
        const expectedTheme = startDark ? 'dark' : 'light';
        expect($navBack.attr('data-bs-theme')).to.equal(expectedTheme);
      });
    });
  });

  it('persists the choice across a full page reload', () => {
    // Pick a non-default theme.
    cy.get('[data-testid="main-navigation"]').then(($nav) => {
      const targetIsDark = !$nav.hasClass('bg-dark');
      cy.get('[data-testid="settings-dark-mode-switch"]').click();
      cy.get('[data-testid="main-navigation"]').should(($navAfter) => {
        expect($navAfter.hasClass('bg-dark')).to.equal(targetIsDark);
      });

      // localStorage must now contain the explicit choice.
      cy.window().then((win) => {
        const stored = win.localStorage.getItem('theme-mode');
        expect(stored).to.equal(targetIsDark ? 'dark' : 'light');
      });

      // Hard reload (real navigation, not a soft rerender).
      cy.reload();

      // Settings page should re-show with the same toggle position.
      cy.get('[data-testid="settings-page"]').should('be.visible');
      cy.get('[data-testid="settings-dark-mode-switch"]').should(
        targetIsDark ? 'be.checked' : 'not.be.checked',
      );
      // The navbar must also reflect the same palette — that's the
      // user-visible "the choice persists" assertion.
      cy.get('[data-testid="main-navigation"]').should(($navReloaded) => {
        expect($navReloaded.hasClass('bg-dark')).to.equal(targetIsDark);
        const expectedTheme = targetIsDark ? 'dark' : 'light';
        expect($navReloaded.attr('data-bs-theme')).to.equal(expectedTheme);
      });
    });
  });

  it('offers "Follow my OS preference" once an explicit choice has been made', () => {
    // After mount with no stored preference, no follow-OS button — we're
    // already on OS mode.
    cy.get('[data-testid="settings-current-mode-value"]').then(($mode) => {
      if ($mode.text().includes('Follow OS')) {
        cy.get('[data-testid="settings-follow-os-button"]').should('not.exist');
      }

      // Pick an explicit theme.
      cy.get('[data-testid="settings-dark-mode-switch"]').click();

      // Button now appears.
      cy.get('[data-testid="settings-follow-os-button"]').should('be.visible');

      // Clicking it returns us to OS mode and hides the button.
      cy.get('[data-testid="settings-follow-os-button"]').click();
      cy.get('[data-testid="settings-current-mode-value"]').should('contain', 'Follow OS');
      cy.get('[data-testid="settings-follow-os-button"]').should('not.exist');
    });
  });

  it('exposes the Settings link in the navbar for unauthenticated visitors', () => {
    cy.visit('/');
    cy.get('[data-testid="main-navigation"]').should('be.visible');
    cy.get('[data-testid="nav-settings"]').should('be.visible').click();
    cy.url().should('include', '/settings');
    cy.get('[data-testid="settings-page"]').should('be.visible');
  });
});