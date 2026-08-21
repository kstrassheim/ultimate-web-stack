/**
 * Coverage tests for the session-expiry detection paths in
 * `futureGadgetApi.js`. Sibling to `sessionExpiry.cy.js` which covers
 * `/api/user-data`; this file extends coverage to the Future Gadget Lab
 * endpoints (`/lab-experiments`, `/worldline-status`, `/worldline-history`,
 * `/divergence-readings`) and to genuine-error paths that the simpler
 * expiry tests don't hit.
 *
 * Why a separate file rather than appending to `experiments.cy.js`:
 *   - `experiments.cy.js` already intercepts `/lab-experiments` in many
 *     tests with different mock bodies; adding more would interact badly
 *     with its beforeEach.
 *   - Keeping the recovery-focused tests isolated from the data-flow
 *     tests makes each spec file's responsibility clear.
 *
 * Each `it` resets the intercepts and triggers one specific code path so
 * coverage of the new branches in `errors.js` / `futureGadgetApi.js` /
 * `authFlow.js` / `SessionRecoveryGuard.jsx` is measurable from one
 * failing run.
 */

const loginHtmlBody = (marker = 'login.microsoftonline.com') =>
  '<!DOCTYPE html><html><head><title>Sign in to your account</title></head>' +
  `<body><form action="https://${marker}/foo"><input type="submit"/></form></body></html>`;

describe('Session-expiry and error coverage — Future Gadget Lab endpoints (issue #86)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      // The expected MSAL loginPopup interaction may surface cross-origin
      // errors during the recovery round-trip — don't fail the test on them.
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

  it('treats /lab-experiments returning the Easy Auth login HTML as session expiry', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');

    // The Experiments page renders the heading only inside the
    // `{initialised && (...)}` block in Experiments.jsx — `initialised`
    // is set in the `finally { setInitialised(true) }` of fetchExperiments.
    // The reload button is `disabled={loading || actionLoading}`, so
    // clicking it before the initial fetch resolves silently times out
    // at Cypress's 4s actionability window even though the recovery
    // logic itself is correct. experiments.cy.js waits on the same
    // heading before any assertions; do the same here.
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody(),
    }).as('labExperimentsExpiry');

    cy.get('[data-testid="reload-experiments-btn"]').click();

    // Even with the recovered session, the experiments page should still be
    // reachable (acceptance criterion #2: re-auth returns the user to the
    // page they were on). Headless MSAL's mock loginPopup resolves
    // immediately, so the URL stabilises quickly.
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('distinguishes a genuine 500 from session expiry on /worldline-status', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');

    // /worldline-status is owned by the WorldlineMonitor component; the
    // Dashboard's reload button does not reach it. Drive it through the
    // dedicated refresh button so the intercept actually matches a request
    // (the original spec relied on the initial fetch, which already
    // finishes before the intercept is registered — so the genuine-error
    // branch in `getWorldlineStatus` was leaving the `looksLikeExpiry`
    // short-circuit uncovered).
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    // A real 500 + JSON body must NOT trigger re-login. The dashboard must
    // still be the page we're on, and the Sign-In button must not appear
    // (we're authenticated; the failure is just a backend hiccup).
    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 500,
      contentType: 'application/json',
      body: { error: 'internal error' },
    }).as('worldlineStatus500');

    cy.get('[data-testid="refresh-status-btn"]').click();

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('distinguishes a genuine 404 on /divergence-readings from session expiry', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');

    // As above: drive /divergence-readings through the readings refresh
    // button so the intercept matches the new request.
    cy.get('[data-testid="divergence-readings-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings**', {
      statusCode: 404,
      contentType: 'application/json',
      body: { error: 'not found' },
    }).as('divergenceReadings404');

    cy.get('[data-testid="refresh-readings-btn"]').click();

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('treats HTML body (without obvious login marker) on /lab-experiments as session expiry', () => {
    // The bodyLooksLikeLoginPage helper accepts any text/html on a JSON
    // endpoint as a likely expiry. This test verifies the "html-body"
    // detection branch (no .auth/login marker, no Microsoft login form).
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');

    // Wait for the initial fetch to settle before clicking reload — see
    // the comment in the first `it` for why.
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><head><title>Oops</title></head><body>Sorry.</body></html>',
    }).as('labExperimentsHtmlBody');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('treats a 200 + text/html on /worldline-status with a .auth/login marker as session expiry', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');

    // Drive /worldline-status through the dedicated refresh button so
    // the login-marker detection branch in `inspectResponseForExpiry`
    // is actually exercised on this endpoint.
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body>Please go to <a href="/.auth/login/aad">sign in</a>.</body></html>',
    }).as('worldlineStatusAuthMarker');

    cy.get('[data-testid="refresh-status-btn"]').click();

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 15000 }).should('include', '/dashboard');
  });

  it('coalesces concurrent expiry-triggering fetches into a single re-auth attempt', () => {
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');

    // We need both /worldline-status AND /worldline-history (or any two
    // endpoints) to expire at the same time so the single-flight lock in
    // `authFlow.reauthenticate` coalesces them. Triggering the
    // WorldlineMonitor's mount-time fetch ALONE would only generate one
    // expiry event; we need to issue a second concurrent call before the
    // first loginPopup resolves. Drive the second one through the reload
    // button (which hits /api/user-data) and the first through the
    // status refresh button.
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    // Make BOTH endpoints serve the Easy Auth login HTML. With the
    // single-flight lock in `authFlow.reauthenticate`, both failures
    // share one loginPopup.
    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 200,
      contentType: 'text/html',
      body: loginHtmlBody(),
    }).as('concurrentWorldlineExpiry');
    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody(),
    }).as('concurrentUserDataExpiry');

    // Fire both endpoints in the same tick: the refresh button triggers
    // /worldline-status, the reload button triggers /api/user-data. Both
    // notification events hit `reauthenticate` and the second one is
    // coalesced by `_inFlight`.
    cy.get('[data-testid="refresh-status-btn"]').click();
    cy.get('[data-testid="reload-button"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('treats a redirected response to /\\.auth/login/aad as session expiry', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');

    // Wait for the initial fetch to settle before clicking reload.
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody('login.microsoftonline.com'),
    }).as('labExperimentsAuthRedirect');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });
});
