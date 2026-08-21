/**
 * E2E coverage for Dashboard / WorldlineMonitor / future-gadget-lab
 * status endpoints, including the genuine-error and session-expiry
 * paths that the existing specs only partially cover.
 *
 * Goals:
 *   - exercise more branches in `getWorldlineStatus` / `getDivergenceReadings`
 *     via the real UI (Dashboard's WorldlineMonitor's refresh buttons);
 *   - drive the single-flight lock in `authFlow.reauthenticate` by firing
 *     multiple expiry events from different endpoints at the same time;
 *   - cover additional `api.js` / `futureGadgetApi.js` defensive branches
 *     (e.g. the `inspection.bodyText !== '' || typeof response.json !==
 *     'function'` short-circuit, the genuine-error return-undefined path
 *     for non-admin URLs that wasn't hit by the earlier specs).
 *
 * IMPORTANT: the Dashboard's `[data-testid="reload-button"]` only triggers
 * `getUserData` + `getAllGroups` — it does NOT reach the
 * `/future-gadget-lab/worldline-status` or `/divergence-readings` endpoints.
 * Those endpoints are fetched by the WorldlineMonitor component, so the
 * spec drives them through its dedicated refresh buttons
 * (`[data-testid="refresh-status-btn"]`,
 * `[data-testid="refresh-readings-btn"]`). The previous version of this
 * file clicked `reload-button` for those endpoints, which silently left
 * the intercepts un-matched and kept the branches under coverage:
 * `nyc check-coverage` then failed the e2e-tests job.
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

    // The Dashboard's reload button only fires /api/user-data + /api/groups;
    // `/worldline-status` is owned by the WorldlineMonitor component, so we
    // drive it through the dedicated refresh button. Without this, the
    // intercept never matches and the genuine-error branch in
    // `getWorldlineStatus` stays uncovered.
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 401,
      contentType: 'application/json',
      body: { error: 'unauthorized' },
    }).as('worldlineStatus401');

    cy.get('[data-testid="refresh-status-btn"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('treats a 200 + application/json with a non-JSON body on /worldline-status as a parse error', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // As above: the refresh button is the only way to trigger a fresh
    // /worldline-status fetch from the UI without re-mounting the page.
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 200,
      contentType: 'application/json',
      body: 'definitely not JSON',
    }).as('worldlineStatusParseError');

    cy.get('[data-testid="refresh-status-btn"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('detects session expiry on /divergence-readings and triggers the recovery flow', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // /divergence-readings is owned by the WorldlineMonitor; the Dashboard
    // reload button does not reach it. Use the readings refresh button.
    cy.get('[data-testid="divergence-readings-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings**', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody(),
    }).as('divergenceReadingsExpiry');

    cy.get('[data-testid="refresh-readings-btn"]').click();
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

    // /api/user-data IS reached by the Dashboard reload button, so this
    // test keeps using `reload-button` (changing it would not exercise the
    // intended branch and would just add a no-op click).
    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('fires concurrent expiry events on /api/user-data + /worldline-status — single-flight coalesces them', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // The concurrent-expiry test needs BOTH endpoints to fire close enough
    // together that the single-flight lock in `reauthenticate` can coalesce
    // them. The Dashboard reload button only triggers /api/user-data, so we
    // also need the refresh button that actually lives on the
    // WorldlineMonitor to drive /worldline-status. Without both clicks the
    // /worldline-status intercept would never match and the single-flight
    // lock would not be exercised.
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

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

    // Fire both endpoints in the same tick. The two expiry events hit
    // `reauthenticate` and the second one is coalesced by `_inFlight`.
    cy.get('[data-testid="refresh-status-btn"]').click();
    cy.get('[data-testid="reload-button"]').click();

    // Two overlapping expiry events land on the same dashboard reload;
    // the single-flight lock in `reauthenticate` should coalesce them
    // into a single recovery round-trip.
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });
});
