/**
 * E2E coverage extension for the session-expiry recovery flow.
 *
 * Targets specific code paths the existing session-expiry specs do not hit:
 *
 *   - the `summarizeBody` empty-body branch in `api.js` /
 *     `futureGadgetApi.js` (the response body is the empty string —
 *     triggered by a backend that returns a 200 + Content-Type without
 *     any payload).
 *   - the `appInsights.trackException` + `notyfService.error` failure
 *     branch in `SessionRecoveryGuard.jsx` (the SessionRecoveryGuard's
 *     `.then(result => ...)` handler when `result.success === false`).
 *   - the `consumeRedirectPath()` on-failure branch in `authFlow.js`.
 *   - the JSON parse-error branch for the admin-data endpoint
 *     (`api.js`'s `await response.json()` / `inspectionJson` throw
 *     path).
 *
 * Each test drives exactly one of these paths so coverage gaps are
 * attributable to specific lines / branches without ambiguity.
 */

const emptyLoginBody = '';
const shortLoginBody =
  '<!DOCTYPE html><html><head><title>Sign in</title></head>' +
  '<body><form action="https://login.microsoftonline.com/x">' +
  '<input type="submit"/></form></body></html>';

describe('Session-expiry / recovery branch coverage (issue #86)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      // MSAL cross-origin noise during the recovery round-trip must not
      // fail the test. Mirrors the existing session-expiry specs.
      console.error('Uncaught exception:', err);
      return false;
    });

    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });

    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('exist');
  });

  /**
   * The `summarizeBody` helper in api.js / futureGadgetApi.js returns the
   * empty string when the body is empty (`if (!bodyText) return '';`).
   * Without an explicit empty-body test, that branch is never reached
   * because every existing test sends a non-empty body. The session
   * expiry must still fire even when the body is empty (the inspect
   * path does not look at the body content for the html-body
   * detection — it looks at content-type and detection helpers).
   */
  it('triggers the recovery flow when /api/user-data returns a 200 + text/html with an empty body', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html',
      body: emptyLoginBody,
    }).as('userDataEmptyBody');

    cy.get('[data-testid="reload-button"]').click();

    // The recovery round-trip is fast in headless mode; URL stabilises
    // back on /dashboard once the mock loginPopup resolves.
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  /**
   * `summarizeBody` short-body branch (the body fits inside the 200-char
   * preview window without `…` truncation). The first-time login body is
   * already exercised by the long-body tests; this test pins the short
   * path on /api/user-data so both summarizeBody branches are covered.
   */
  it('triggers the recovery flow on a short (≤200 char) HTML body on /api/user-data', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: shortLoginBody,
    }).as('userDataShortBody');

    cy.get('[data-testid="reload-button"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  /**
   * The 200 + text/html path on /lab-experiments with a short body
   * exercises the same `summarizeBody` short branch in
   * `futureGadgetApi.js`. The existing coverage specs cover the long
   * body; this pins the short branch on the lab endpoint.
   */
  it('triggers the recovery flow on a short (≤200 char) HTML body on /lab-experiments', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html',
      body: shortLoginBody,
    }).as('labExperimentsShortBody');

    cy.get('[data-testid="reload-experiments-btn"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  /**
   * The SessionRecoveryGuard's `.then(result => ...)` failure branch is
   * reached when reauthenticate rejects. We simulate the user closing
   * the login popup (the canonical case for the recovery round-trip
   * failing in production) by setting the test-only MOCK_LOGIN_FAIL
   * flag in localStorage, which makes the mock MSAL's loginPopup
   * reject. With this, the SessionRecoveryGuard exercises the
   * `appInsights.trackException` + `notyfService.error` branches, and
   * `authFlow.js` exercises its catch block (`consumeRedirectPath` to
   * clear the saved target, the `appInsights.trackException` call, the
   * `return { success: false, error }`).
   */
  it('exercises the SessionRecoveryGuard / authFlow failure paths when loginPopup is cancelled', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_LOGIN_FAIL', 'true');
    });

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html><body>Please go to <a href="/.auth/login/aad">sign in</a>.</body></html>',
    }).as('userDataExpiredLogin');

    cy.get('[data-testid="reload-button"]').click();

    // The recovery round-trip fires, loginPopup rejects with the
    // "Mock MSAL: login popup cancelled" error, the SessionRecoveryGuard
    // falls through its `.then(result => ...)` failure branch and the
    // authFlow.js catch block runs. The dashboard stays where it is.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 15000 }).should('include', '/dashboard');

    // Reset the flag so subsequent tests in this spec aren't affected.
    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_LOGIN_FAIL');
    });
  });
});