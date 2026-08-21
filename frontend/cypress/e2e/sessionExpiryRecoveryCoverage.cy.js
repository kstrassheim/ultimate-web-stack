/**
 * E2E coverage extension for the session-expiry recovery flow.
 *
 * Targets specific code paths the existing session-expiry specs do not hit:
 *
 *   - the `await response.json()` branch in `api.js`'s parse-error
 *     path (the existing JSON-parse test uses a non-empty body, which
 *     routes through `inspectionJson`; this spec exercises the path
 *     taken when the body is empty).
 *   - the `summarizeBody` short-body (≤200 char) arm on both
 *     `/api/user-data` and `/lab-experiments` (the long-body case
 *     was already covered by the existing specs).
 *
 * Each test drives exactly one of these paths so coverage gaps are
 * attributable to specific lines / branches without ambiguity.
 */

const shortLoginBody =
  '<!DOCTYPE html><html><head><title>Sign in</title></head>' +
  '<body><form action="https://login.microsoftonline.com/x">' +
  '<input type="submit"/></form></body></html>';

/**
 * The two `/api/user-data` tests live in a `User`-role describe block:
 * the navbar `nav-experiments` link is `ProtectedLink` wrapped to
 * `["Admin"]`, so a `User`-role auth state hides the link and the
 * `/lab-experiments` test below would time out looking for it. The
 * `/lab-experiments` test runs in its own Admin-role block.
 */
describe('Session-expiry / recovery branch coverage (issue #86) — User role', () => {
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
   * The `await response.json()` branch in `api.js`'s parse-error path is
   * reached only when `inspection.bodyText === ''`. The existing JSON
   * parse-error test in `sessionExpiryApiCoverage.cy.js` uses a
   * non-empty body so it routes through `inspectionJson` instead.
   * Here, we send a 200 + `application/json` with an empty body: the
   * bodyText falls through to '' (so the `bodyText !== ''` guard in
   * `api.js` is false), then `typeof response.json !== 'function'` is
   * also false, so `api.js` actually calls `await response.json()`.
   * That call throws because the body is empty, the catch block runs
   * (returning undefined for the non-admin `/user-data` path) — and
   * importantly, NO session-expiry recovery is triggered because the
   * content-type is JSON, not HTML.
   */
  it('exercises the response.json() parse-error branch on /api/user-data with an empty body', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'application/json',
      body: '',
    }).as('userDataEmptyJsonBody');

    cy.get('[data-testid="reload-button"]').click();

    // The Sign-In button must NEVER appear — this is a genuine parse
    // error on /user-data, not a session expiry, so the recovery flow
    // must not fire.
    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  /**
   * `summarizeBody` short-body branch (the body fits inside the 200-char
   * preview window without `…` truncation). The long-body case was
   * already covered by the existing specs; this test pins the short
   * path on /api/user-data so both summarizeBody branches are hit.
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

    // The recovery round-trip is fast in headless mode; URL stabilises
    // back on /dashboard once the mock loginPopup resolves.
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });
});

/**
 * The `/lab-experiments` recovery test needs an `Admin` role because
 * `nav-experiments` is wrapped in `ProtectedLink requiredRoles={["Admin"]}`
 * (`App.jsx:65-67`). Running it from a `User`-role describe block leaves
 * the link hidden and `cy.get('[data-testid="nav-experiments"]')` times
 * out at Cypress's default 4s actionability window.
 */
describe('Session-expiry / recovery branch coverage (issue #86) — Admin role', () => {
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

    cy.setMockRole('Admin');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('exist');
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
});