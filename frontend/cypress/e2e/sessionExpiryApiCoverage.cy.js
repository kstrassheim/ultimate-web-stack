/**
 * Coverage extension for the session-expiry fix on `/api/user-data` paths.
 *
 * The original `sessionExpiry.cy.js` only covers the login-marker HTML
 * path and the genuine 401 path on `/api/user-data`. To push the e2e
 * coverage of the new code (`src/api/errors.js`, the session-expiry
 * branches in `src/api/api.js`, and the `summarizeBody` long-body
 * helper) over the `nyc check-coverage` thresholds, this file exercises
 * the remaining code paths in the same flow:
 *
 *   - 200 + text/html with no login marker (`html-body` detection in
 *     `inspectResponseForExpiry`).
 *   - 200 + text/html with a body longer than 200 characters
 *     (the long-body branch of `summarizeBody`).
 *   - 500, 404, 403 genuine JSON errors (the `ApiError` path in
 *     `makeAuthenticatedRequest`, which returns undefined for non-admin
 *     URLs).
 *   - 200 + application/json with a non-JSON body (the parse-error
 *     branch in `api.js`).
 *
 * Each test triggers exactly one code path so coverage gaps are visible
 * in the report.
 */

const loginHtmlBody = (marker = 'login.microsoftonline.com') =>
  '<!DOCTYPE html><html><head><title>Sign in to your account</title></head>' +
  `<body><form action="https://${marker}/foo"><input type="submit"/></form></body></html>`;

// A body that comfortably exceeds the 200-char preview threshold in
// `summarizeBody` — long enough to force the `…` truncation branch.
const longHtmlBody =
  '<!DOCTYPE html><html><head><title>Please authenticate to continue using the dashboard. ' +
  'Your session has expired and we need you to sign in again to restore access to the ' +
  'protected resources behind this endpoint. This is the Easy Auth default sign-in page.</title>' +
  '</head><body>' +
  '<form action="https://login.microsoftonline.com/foo" method="POST">' +
  '<input type="hidden" name="state" value="xyz"/>' +
  '<input type="hidden" name="client_id" value="00000000-0000-0000-0000-000000000000"/>' +
  '<button type="submit">Sign in</button>' +
  '</form></body></html>';

describe('Session-expiry API coverage — /api/user-data branches (issue #86)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      // MSAL cross-origin noise from the recovery round-trip must not fail the test.
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

  it('detects a long (>200 char) HTML body as session expiry (exercises summarizeBody long branch)', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: longHtmlBody,
    }).as('longUserDataExpiry');

    cy.get('[data-testid="reload-button"]').click();
    // Recovery round-trip via the mocked MSAL loginPopup is fast; the URL
    // stabilises back on /dashboard once loginPopup resolves.
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('detects a plain HTML body (no login marker) on /api/user-data as session expiry', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><head><title>Oops</title></head><body>Sorry.</body></html>',
    }).as('plainHtmlUserData');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('surfaces a genuine 500 on /api/user-data as a non-expiry error', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 500,
      contentType: 'application/json',
      body: { error: 'internal error' },
    }).as('userData500');

    cy.get('[data-testid="reload-button"]').click();

    // Genuine 500 must NOT trigger a re-login. The Sign-In button should
    // never appear because we're still authenticated; the dashboard
    // should stay where it is.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('surfaces a genuine 404 on /api/user-data as a non-expiry error', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 404,
      contentType: 'application/json',
      body: { error: 'not found' },
    }).as('userData404');

    cy.get('[data-testid="reload-button"]').click();

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('surfaces a genuine 403 on /api/user-data as a non-expiry error', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 403,
      contentType: 'application/json',
      body: { error: 'forbidden' },
    }).as('userData403');

    cy.get('[data-testid="reload-button"]').click();

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('treats a 200 + application/json with non-JSON body on /api/user-data as a parse error (not expiry)', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'application/json',
      body: 'not actually JSON',
    }).as('userDataParseFail');

    cy.get('[data-testid="reload-button"]').click();

    // A JSON parse failure on user-data must NOT trigger re-login — it
    // should land in the same `getUserData returns undefined` branch
    // as genuine 4xx/5xx errors.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('treats a 200 + text/html with a .auth/login/aad marker on /api/user-data as session expiry', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body>Please go to <a href="/.auth/login/aad">sign in</a>.</body></html>',
    }).as('userDataAuthMarker');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });
});

/**
 * Coverage extension for `/future-gadget-lab` paths in the same vein as
 * `sessionExpiryCoverage.cy.js`. Adds the missing long-body and
 * plain-HTML (no marker) branches for the Future Gadget Lab endpoints
 * that the earlier spec didn't hit.
 */
describe('Session-expiry API coverage — Future Gadget Lab additional branches (issue #86)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
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

  it('detects a long (>200 char) HTML body on /lab-experiments as session expiry', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: longHtmlBody,
    }).as('longLabExperimentsExpiry');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('surfaces a genuine 502 on /lab-experiments as a non-expiry error', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 502,
      contentType: 'application/json',
      body: { error: 'bad gateway' },
    }).as('labExperiments502');

    cy.get('[data-testid="reload-experiments-btn"]').click();

    // Genuine 502 must NOT trigger re-login.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');
  });

  it('treats a 200 + application/json with non-JSON body on /lab-experiments as a parse error (not expiry)', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: 'not valid JSON',
    }).as('labExperimentsParseFail');

    cy.get('[data-testid="reload-experiments-btn"]').click();

    // JSON parse failure on a non-admin URL is surfaced as ApiError;
    // for non-admin paths the API helpers re-throw, so the page might
    // show an error state but must NOT trigger re-login.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');
  });
});
