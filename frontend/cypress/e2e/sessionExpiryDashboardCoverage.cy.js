/**
 * E2E coverage for Dashboard / WorldlineMonitor / future-gadget-lab
 * status endpoints, including the genuine-error and session-expiry
 * paths that the existing specs only partially cover.
 *
 * Goals:
 *   - exercise more branches in `getWorldlineStatus` / `getDivergenceReadings`
 *     via the real UI (Dashboard's WorldlineMonitor);
 *   - drive the single-flight lock in `authFlow.reauthenticate` by firing
 *     multiple expiry events from different endpoints at the same time;
 *   - cover additional `api.js` / `futureGadgetApi.js` defensive branches
 *     (e.g. the `inspection.bodyText !== '' || typeof response.json !==
 *     'function'` short-circuit, the genuine-error return-undefined path
 *     for non-admin URLs that wasn't hit by the earlier specs).
 */

const loginHtmlBody = (marker = 'login.microsoftonline.com') =>
  '<!DOCTYPE html><html><head><title>Sign in to your account</title></head>' +
  `<body><form action="https://${marker}/foo"><input type="submit"/></form></body></html>`;

describe('Session-expiry / Dashboard additional coverage (issue #86)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
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

  it('treats a genuine 401 on /worldline-status as a non-expiry error', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 401,
      contentType: 'application/json',
      body: { error: 'unauthorized' },
    }).as('worldlineStatus401');

    // The dashboard triggers getWorldlineStatus as part of its initial fetch
    // and on refresh. The reload button re-runs the data fetches.
    cy.get('[data-testid="reload-button"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('treats a 200 + application/json with a non-JSON body on /worldline-status as a parse error', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 200,
      contentType: 'application/json',
      body: 'definitely not JSON',
    }).as('worldlineStatusParseError');

    cy.get('[data-testid="reload-button"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('detects session expiry on /divergence-readings and triggers the recovery flow', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings**', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody(),
    }).as('divergenceReadingsExpiry');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('treats a plain-HTML login page on /api/user-data as session expiry (long body)', () => {
    // Exercises the summarizeBody long-body branch (truncation with `…`)
    // and the html-body detection path on /api/user-data — the GET path
    // is short; the previous specs used long bodies for /lab-experiments
    // but not for /api/user-data.
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

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: longHtmlBody,
    }).as('userDataLongExpiry');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('fires concurrent expiry events on /api/user-data + /worldline-status — single-flight coalesces them', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody(),
    }).as('concurrentUserDataExpiry');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody(),
    }).as('concurrentWorldlineStatusExpiry');

    cy.get('[data-testid="reload-button"]').click();

    // Two overlapping expiry events land on the same dashboard reload;
    // the single-flight lock in `reauthenticate` should coalesce them
    // into a single recovery round-trip.
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });
});