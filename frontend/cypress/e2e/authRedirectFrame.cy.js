/**
 * End-to-end coverage for issue #151 — the MSAL popup redirect bridge in
 * `src/main.jsx`.
 *
 * `main.jsx` deliberately renders nothing when it decides the current
 * document is a popup carrying an Entra auth response: it hands the response
 * to the opener and relies on `window.close()`. Two failure modes came out of
 * that in an installed Edge PWA on Windows:
 *
 *   1. The old check matched a bare `code=` / `error=` / `state=` anywhere in
 *      the URL, with no popup check at all. A PWA whose install-time
 *      `start_url` captured `?code=…` therefore rendered a permanently blank
 *      app in its MAIN window, on every single launch. `state` is what MSAL
 *      round-trips on every response, so it — not `code` — is the marker.
 *   2. When `window.close()` is refused (COOP severs `window.opener` after
 *      the cross-origin Entra navigation, and a PWA-spawned window is a
 *      separate browsing context) the user was left with a blank window and
 *      nothing to explain it.
 */

describe('Auth redirect frame handling (issue #151)', () => {
  it('renders the app normally for a url carrying only code=', () => {
    // The regression: this URL shape blanked the whole app for an installed
    // PWA whose start_url captured ?code= at install time. Cypress has no
    // opener, and there is no state marker, so this is not a popup response.
    cy.visit('/?code=abc123');

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="auth-popup-fallback"]').should('not.exist');
  });

  it('renders the app normally for a url carrying only error=', () => {
    cy.visit('/?error=access_denied');

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('be.visible');
  });

  it('does not treat an app url that merely contains "state" as a response', () => {
    // The match is anchored on a `#`, `?` or `&` prefix, so a parameter that
    // merely ends in "state" is still an ordinary app URL.
    cy.visit('/?mystate=abc');

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('be.visible');
  });

  it('treats a state-carrying url as a popup response and shows a readable notice', () => {
    // With the state marker present main.jsx takes the bridge branch: the app
    // is deliberately not rendered, and when the window does not close itself
    // the fallback notice must appear rather than a blank document. The mock
    // redirect bridge is a no-op that never closes the window, which is
    // exactly the "close was refused" case being guarded.
    cy.visit('/?code=abc123&state=xyz');

    cy.get('[data-testid="auth-popup-fallback"]', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'close this window');

    // The app itself must not have rendered in this document.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
  });

  it('shows the notice for a fragment-carried state too', () => {
    cy.visit('/#state=xyz');

    cy.get('[data-testid="auth-popup-fallback"]', { timeout: 10000 })
      .should('be.visible');
  });
});
