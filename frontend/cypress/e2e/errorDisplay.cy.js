/**
 * End-to-end coverage for the **genuine-error** branch of
 * `src/api/errors.js` `inspectResponseForExpiry()` — when the
 * response is a clean 4xx/5xx that is NOT a session expiry.
 *
 * The branch exercised (errors.js `inspectResponseForExpiry` plus the
 * `if (!inspection.looksLikeExpiry && (inspection.status < 200 || inspection.status >= 300))`
 * check in `src/api/api.js` and `src/api/futureGadgetApi.js`) is:
 *
 *   - response body is JSON (not HTML, no login markers)
 *   - response was not redirected to a login URL
 *   - status is >= 300
 *
 * → inspectResponseForExpiry returns `looksLikeExpiry: false`,
 * the api helpers throw a plain `ApiError`, and the calling page
 * surfaces a `notyfService.error(...)` toast.
 *
 * Acceptance criterion #3 of issue #86 ("a genuine 401/5xx is NOT
 * misclassified as session expiry") is exercised here too: every test
 * below asserts the user-visible error toast AND that no sign-in
 * button has reappeared and the URL has not redirected to
 * /access-denied.
 *
 * Note: an earlier draft of this spec intercepted `/me/memberOf` and
 * `/api/admin-data`, but neither is reachable from the e2e in mock mode
 * (the Graph endpoint is replaced by `mock/graphApi.js` which returns
 * mock data without a network call, and `getAdminData` is not invoked
 * by any page in the production UI). The tests below use the throwing
 * endpoints that the dashboard and experiments page actually call.
 */

describe('Genuine 4xx/5xx backend errors surface as user-visible toasts', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });

  it('surfaces a 500 on /worldline-status as a notyf error on the dashboard', () => {
    // The dashboard's WorldlineMonitor issues a fresh GET on
    // /worldline-status when the user clicks the "refresh status"
    // button. That is the throwing branch in
    // futureGadgetApi.js#makeAuthenticatedRequest — a 5xx with a
    // JSON body and no login markers falls through to ApiError.
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    // Wait for the mount-time fetch to settle so the intercept below
    // matches the refresh request and not the initial load.
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });

    cy.intercept('GET', '**/worldline-status', {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: { error: 'Worldline service unavailable' },
    }).as('worldlineStatus500');

    cy.get('[data-testid="refresh-status-btn"]').click();
    cy.wait('@worldlineStatus500');

    // The genuine-error branch surfaces as a notyf error toast.
    cy.get('.notyf__toast--error', { timeout: 10000 }).should('be.visible');

    // Acceptance criterion #3 — a real 5xx is NOT misclassified as
    // session expiry. No re-login prompt, no /access-denied redirect.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url().should('not.include', '/access-denied');

    // The dashboard is still mounted and interactive.
    cy.get('[data-testid="dashboard-page"]').should('be.visible');
    cy.get('[data-testid="worldline-monitor"]').should('be.visible');
  });

  it('surfaces a 500 on /worldline-history as a notyf error on the dashboard', () => {
    // Sibling test — same code path, different endpoint. Confirms
    // the genuine-error branch is the per-fetch throw, not something
    // specific to /worldline-status.
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });

    cy.intercept('GET', '**/worldline-history', {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: { error: 'Worldline history unavailable' },
    }).as('worldlineHistory500');

    cy.get('[data-testid="refresh-history-btn"]').click();
    cy.wait('@worldlineHistory500');

    cy.get('.notyf__toast--error', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url().should('not.include', '/access-denied');
  });

  it('surfaces a 500 on /lab-experiments (GET) as a notyf error on the experiments page', () => {
    // The experiments page is admin-gated. Sign in as Admin and
    // drive a reload to trigger the throwing branch on
    // /lab-experiments. Exercises the same genuine-error code path
    // through Experiments.jsx's fetchExperiments catch handler.
    cy.setMockRole('Admin');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');

    // The mount-time fetchExperiments has already fired and resolved
    // against the mock backend. Set up the intercept and click
    // Reload to drive a controlled failure.
    cy.intercept('GET', '**/lab-experiments', {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: { error: 'Lab API unavailable' },
    }).as('labExperiments500');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.wait('@labExperiments500');

    // User-visible error toast on the experiments page.
    cy.get('.notyf__toast--error', { timeout: 10000 }).should('be.visible');

    // The page itself remains mounted.
    cy.get('[data-testid="experiments-page"]').should('be.visible');

    // Not misclassified as expiry.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url().should('not.include', '/access-denied');
  });
});