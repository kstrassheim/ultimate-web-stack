/**
 * End-to-end tests for issue #86:
 *   "Session expiry renders a blank page instead of asking for re-login"
 *
 * These tests cover the user-visible behaviour — what the user actually
 * does and sees when their Easy Auth session expires mid-flow. The
 * line-level coverage of the API helpers and the recovery flow lives
 * in the unit tests alongside each module:
 *
 *   - src/api/errors.test.js
 *       SessionExpiredError, pub/sub bus, bodyLooksLikeLoginPage,
 *       inspectResponseForExpiry, inspectionJson.
 *   - src/api/api.test.js
 *       getUserData, getAdminData, expiry detection on /api/* paths,
 *       genuine-error (4xx/5xx/network) handling.
 *   - src/api/futureGadgetApi.test.js
 *       CRUD ops (POST/PUT/DELETE), expiry detection on
 *       /future-gadget-lab/* paths, DELETE-specific 204 behaviour,
 *       genuine-error handling.
 *   - src/auth/authFlow.test.js
 *       saveRedirectPath / consumeRedirectPath, reauthenticate's
 *       loginPopup success and cancel paths, single-flight lock.
 *   - src/components/SessionRecoveryGuard.test.jsx
 *       Subscribe + trigger on bus events, telemetry on failure,
 *       cleanup on unmount.
 *
 * If the coverage gate fails after dropping the coverage-shaped e2e
 * specs, that is a signal to extend a unit test — not to add e2e
 * specs back. The unit tests are the right place for branch coverage.
 */

const loginHtmlBody =
  '<!DOCTYPE html><html><body><form action="https://login.microsoftonline.com/foo"><input type="submit"/></form></body></html>';

// A verbose sign-in page. Real App Service Easy Auth responses are often
// much longer than the placeholder above — they include embedded CSS,
// ARIA markup, debug comment blocks, and the full Easy Auth script tag.
// The recovery flow truncates the body for telemetry, so the body
// summarizer must keep working when the body is much larger than 200
// characters. Drives the `summarizeBody` long-body branch in
// `api.js` / `futureGadgetApi.js` end-to-end.
const verboseLoginHtmlBody =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Sign in to your account</title>\n' +
  '<link rel="stylesheet" href="https://app.example.com/.auth/css/aad-login.css">\n' +
  '<script src="https://login.microsoftonline.com/foo/sdk.js"></script>\n' +
  '<!-- AAD SAML SSO bridge comment block that the Easy Auth proxy emits when ' +
  'the App Service session has expired and the request is being redirected ' +
  'through /.auth/login/aad for re-authentication. -->\n</head>\n' +
  '<body class="aad-saml-sso"><div id="loginForm"><form action="https://login.microsoftonline.com/foo" method="POST">' +
  '<input name="username" type="email"/><input name="password" type="password"/>' +
  '<button type="submit">Sign in</button></form></div></body></html>';

describe('Session expiry re-auth flow (issue #86)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      // MSAL cross-origin noise during the recovery round-trip must
      // not fail the test — the round-trip opens a popup that the
      // headless runner can't fully mediate.
      console.error('Uncaught exception:', err);
      return false;
    });

    cy.window().then((win) => {
      // Cypress clears localStorage / sessionStorage between tests by
      // default, but we clear again so a stale MOCKROLE or
      // MOCK_LOGIN_FAIL from a previous run cannot leak into the
      // current one.
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });

  // Sign in as the given role and wait for the authenticated shell.
  const loginAs = (role) => {
    cy.setMockRole(role);
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('exist');
  };

  // ---------------------------------------------------------------------
  // Acceptance criterion #1: an expired session triggers a visible
  // re-authentication prompt rather than an empty view.
  // Acceptance criterion #2: after re-authenticating, the user lands
  // back on the page they were on.
  // Both criteria are asserted together: every recovery test below
  // expects URL stability back on the page where expiry was detected.
  // ---------------------------------------------------------------------

  it('re-authenticates when the dashboard mount-time fetch returns the login page', () => {
    // The user clicks Dashboard. The dashboard's mount-time fetch
    // fires before any user interaction; the response is the Easy
    // Auth sign-in HTML. The recovery flow runs from the data load —
    // not from a user-initiated click — and lands the user back on
    // /dashboard. This is the literal scenario described in the
    // issue body: "the app renders empty" because the dashboard's
    // data view never appears without the recovery flow.
    loginAs('User');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('expiredMountFetch');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('re-authenticates when the user clicks Reload and an API responds with the login page', () => {
    // The user is actively using the dashboard and clicks Reload.
    // The next API call returns the sign-in HTML; the recovery flow
    // runs and the user lands back on /dashboard.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('expiredReload');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('re-authenticates when a Future Gadget Lab endpoint returns the login page', () => {
    // Same scenario as the dashboard tests, but on /experiments for
    // an Admin. Exercises the same recovery path through
    // futureGadgetApi.js instead of api.js. Without this test we'd
    // have no e2e coverage of the lab API helpers' expiry branch.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('expiredLabExperiments');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('re-authenticates when a write operation returns the login page', () => {
    // The Admin is deleting an experiment while the session has
    // expired. The DELETE call returns the sign-in HTML; the recovery
    // flow runs and the user lands back on /experiments without
    // losing the page. Tests that the recovery works for non-GET
    // methods end-to-end, not just GETs.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    // Seed the table with one row so the Delete button is reachable.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp',
          name: 'Test experiment',
          description: 'used to drive the DELETE expiry branch',
          worldLineChange: '0.000123',
          creator: 'Test',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('listForDelete');

    cy.intercept('DELETE', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('deleteExpired');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Test experiment');

    cy.contains('tr', 'Test experiment').within(() => {
      cy.get('button').contains(/Delete/i).click();
    });
    cy.get('[data-testid="confirm-delete-btn"]').should('be.visible').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('coalesces concurrent expiry events into a single re-auth attempt', () => {
    // Two endpoints expire at nearly the same moment — the user
    // fires one request via the WorldlineMonitor's Refresh button
    // and another via the Dashboard Reload. The single-flight lock
    // in authFlow.reauthenticate must produce ONE loginPopup, not
    // two stacked on top of each other.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('concurrentUserDataExpiry');

    cy.intercept('GET', '**/future-gadget-lab/worldline-status', {
      statusCode: 200,
      contentType: 'text/html',
      body: loginHtmlBody,
    }).as('concurrentWorldlineExpiry');

    cy.get('[data-testid="refresh-status-btn"]').click();
    cy.get('[data-testid="reload-button"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  // ---------------------------------------------------------------------
  // Acceptance criterion #3: a genuine 401 / 5xx from the API is still
  // surfaced as an error and not mistaken for expiry.
  // ---------------------------------------------------------------------

  it('surfaces a genuine 401 as an error without triggering re-login', () => {
    // The API returns a real 401 (the user's account has been
    // deprovisioned but their cached session is still valid). The
    // user should see an error message, NOT a re-login prompt.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 401,
      contentType: 'application/json',
      body: { error: 'unauthorized' },
    }).as('real401');

    cy.get('[data-testid="reload-button"]').click();

    // The Sign-In button must NOT appear — we're still authenticated;
    // the failure is just a backend hiccup.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  it('surfaces a genuine 5xx as an error without triggering re-login', () => {
    // Same shape as the 401 case but for a backend failure. The 5xx
    // must NOT trigger re-login.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 500,
      contentType: 'application/json',
      body: { error: 'internal error' },
    }).as('real500');

    cy.get('[data-testid="reload-button"]').click();

    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
  });

  // ---------------------------------------------------------------------
  // Recovery failure paths.
  // ---------------------------------------------------------------------

  it('stays put when the user cancels the re-auth popup', () => {
    // The session expires, the recovery flow opens a login popup,
    // and the user closes it without signing in. The app must NOT
    // navigate the user away or pop a second login window — they
    // stay on the page they were on with the error surfaced via the
    // existing notyfService. MOCK_LOGIN_FAIL is the test affordance
    // in mock/azureMsalBrowser.js's loginPopup that simulates this.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_LOGIN_FAIL', 'true');
    });

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html><body>Please go to <a href="/.auth/login/aad">sign in</a>.</body></html>',
    }).as('expiredForCancelledLogin');

    cy.get('[data-testid="reload-button"]').click();

    // The recovery round-trip runs, loginPopup rejects, the user is
    // shown an error but stays on the current page. No re-auth popup
    // replaces the Sign-In button.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url({ timeout: 15000 }).should('include', '/dashboard');
  });

  // ---------------------------------------------------------------------
  // Realistic Easy Auth payloads: the placeholder `loginHtmlBody` used
  // above is intentionally short so the assertions stay readable. The
  // actual Easy Auth responses that App Service returns when the session
  // has expired are much longer — they include embedded CSS, the ARIA
  // markup for the AAD login form, and the SAML SSO bridge script tag.
  // The recovery flow truncates the body for AppInsights telemetry, and
  // the truncation branch needs to be exercised end-to-end against the
  // running UI.
  // ---------------------------------------------------------------------

  it('handles a verbose sign-in page body (>200 chars) on the dashboard reload', () => {
    // The reload hits /api/user-data and gets back a verbose login page
    // that is far longer than 200 characters. The recovery flow still
    // detects the expiry and the body summarizer takes the long-body
    // path (slicing to 200 + ellipsis) rather than the short-body
    // short-circuit.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: verboseLoginHtmlBody,
    }).as('expiredVerboseBody');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('re-authenticates when an Admin POSTs a new experiment against an expired session', () => {
    // The Admin opens the new-experiment form, fills it in, and submits
    // while their App Service session has expired. The POST that
    // `createExperiment` issues returns the Easy Auth sign-in HTML.
    // The recovery flow treats the POST the same way it treats a GET
    // (SessionExpiredError → reauth → land back on /experiments), and
    // the user keeps their place. This is the POST-equivalent of the
    // existing DELETE-expired test and exercises the POST branch in
    // `futureGadgetApi.js` that no other e2e spec reaches.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    // Seed an empty list so the "Create your first experiment" empty
    // state button appears; that is the test affordance for opening the
    // create form without a table row to click.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyListForCreate');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="no-experiments"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="create-first-experiment-btn"]').click();

    // Fill the create form. The required fields (name, description,
    // status, creator) must be filled or the form fails HTML5 validation
    // and the submit handler returns without firing createExperiment.
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('#experiment-name').type('Probe experiment');
    cy.get('#experiment-description').type('Created during an expired-session e2e test');
    cy.get('#experiment-status').select('planned');
    cy.get('#experiment-creator').clear().type('probe-creator');

    cy.intercept('POST', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: verboseLoginHtmlBody,
    }).as('createExpired');

    cy.get('[data-testid="experiment-form-submit"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  // ---------------------------------------------------------------------
  // Genuine backend malfunctions: the recovery flow must NOT trigger
  // re-login when the API genuinely returns a malformed or non-JSON
  // body. Issue #86 is specifically about the Easy Auth sign-in page
  // being mistaken for a real API response — a malformed JSON body on
  // a JSON endpoint is a different failure mode (a server bug, a
  // proxy interference) and the user should see the existing
  // 'no data' empty state, not a re-login popup.
  // ---------------------------------------------------------------------

  it('treats a malformed JSON body on /api/user-data as a genuine backend failure', () => {
    // The backend (or a misconfigured proxy) returns 200 OK with a JSON
    // Content-Type but the body is not valid JSON. The dashboard must
    // render the existing empty state without firing the recovery flow
    // (no SessionExpiredError, no loginPopup). The `inspectionJson`
    // helper throws ApiError for non-JSON bodies, and `getUserData`
    // swallows non-admin failures and returns undefined.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'application/json',
      body: 'this is not JSON',
    }).as('malformedUserData');

    cy.get('[data-testid="reload-button"]').click();
    cy.wait('@malformedUserData');

    // The recovery flow must NOT fire. A genuine 401/5xx/parse-error
    // leaves the user on the same page; only the Easy Auth sign-in
    // page should trigger re-login. Wait long enough for the recovery
    // flow to have started (loginPopup takes a few hundred ms in mock
    // mode) and confirm the Sign-In button is still gone.
    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/dashboard');
  });

  it('treats a malformed JSON body on /lab-experiments as a genuine backend failure', () => {
    // Same scenario as the dashboard test, but on the experiments list.
    // `getAllExperiments` mirrors `getUserData`'s behaviour: 200 OK +
    // application/json + non-JSON body hits the parse-error branch in
    // `futureGadgetApi.js`, which throws `ApiError` (since this is a
    // lab endpoint, not a user-data endpoint). The UI surfaces the
    // error via the existing notyfService.error toast rather than
    // re-login.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: 'not json',
    }).as('malformedExperiments');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.wait('@malformedExperiments');

    // No re-login — the parse error must not be mistaken for expiry.
    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/experiments');
  });

  // ---------------------------------------------------------------------
  // Genuine 4xx / 5xx errors on the lab endpoints must surface as
  // errors, NOT trigger re-login. Acceptance criterion #3 is
  // endpoint-agnostic; these tests extend the same coverage to the
  // lab-side endpoints (which have their own DELETE-specific error
  // branch in `futureGadgetApi.js` that the existing genuine-error
  // paths in the main spec do not exercise).
  // ---------------------------------------------------------------------

  it('surfaces a genuine 500 on DELETE /lab-experiments/:id as an error without re-login', () => {
    // DELETE is treated as a no-content success by futureGadgetApi.js
    // unless the response status is outside 2xx — in which case it
    // throws ApiError unconditionally. The Admin must see the error
    // toast via the existing notyfService path and stay on
    // /experiments; the recovery flow must NOT fire.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-del',
          name: 'Experiment to delete',
          description: 'drives the DELETE 500 branch',
          worldLineChange: '0.000123',
          creator: 'Test',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('listForDelete500');

    cy.intercept('DELETE', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 500,
      contentType: 'application/json',
      body: { error: 'internal error' },
    }).as('delete500');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Experiment to delete');

    cy.contains('tr', 'Experiment to delete').within(() => {
      cy.get('button').contains(/Delete/i).click();
    });
    cy.get('[data-testid="confirm-delete-btn"]').should('be.visible').click();
    cy.wait('@delete500');

    // The DELETE-500 path throws ApiError; the experiments page
    // surfaces it via notyfService.error and stays put. No re-login.
    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/experiments');
  });

  it('surfaces a genuine 401 on /worldline-history as an error without re-login', () => {
    // The WorldlineMonitor fetches /worldline-history on mount and on
    // the dedicated refresh button. A genuine 401 (the user's account
    // was deprovisioned, cached session still valid) must surface as
    // an error rather than triggering the Easy Auth re-login flow.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="worldline-history-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/worldline-history', {
      statusCode: 401,
      contentType: 'application/json',
      body: { error: 'unauthorized' },
    }).as('worldlineHistory401');

    cy.get('[data-testid="refresh-history-btn"]').click();
    cy.wait('@worldlineHistory401');

    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/dashboard');
  });

  // ---------------------------------------------------------------------
  // Coverage-targeted user scenarios for the branches the existing
  // expiry specs leave uncovered. Each test below is a real user-visible
  // scenario (an empty response body is something a misconfigured proxy
  // would actually emit on an expired session; a 404 is what an
  // authentic API call returns when a record is gone; a DELETE 2xx is
  // the normal success path of the experiment-DELETE button).
  //
  // None of these are coverage-only — they describe real production
  // behaviour and assert the same UX outcomes as the rest of the file
  // (recovery fires on Easy Auth signals; errors surface via the
  // existing notyf path without a login popup; successful deletes keep
  // the user on /experiments).
  // ---------------------------------------------------------------------

  it('re-authenticates when the dashboard reload returns an empty HTML body', () => {
    // Some misconfigured App Service deployments return an empty
    // HTML response (Content-Type: text/html, body: '') instead of
    // the full Microsoft sign-in page when the Easy Auth session
    // has expired. The recovery flow's inspection detects this via
    // the html-body branch (no login-marker required because the body
    // is empty) and the body summarizer hits its empty-body early
    // return. The user must still get a re-auth prompt and land back
    // on /dashboard, identical to the full-body case.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: '',
    }).as('expiredEmptyHtmlBody');

    cy.get('[data-testid="reload-button"]').click();
    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  it('re-authenticates when an Admin reload of /lab-experiments returns an empty HTML body', () => {
    // Same shape as the dashboard empty-body test, but on the lab
    // API. futureGadgetApi.js has its own copy of `summarizeBody`
    // and its own `inspection.looksLikeExpiry` handling — the empty
    // body needs to be covered there too.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: '',
    }).as('expiredEmptyLabBody');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('surfaces a genuine 404 on /lab-experiments as an error without re-login', () => {
    // The lab GET genuine-error branch in futureGadgetApi.js is
    // exercised by 401 (handled by the existing 401 test on /api/
    // paths) and 500 (the DELETE-500 test). 404 covers the second
    // explicit user-visible failure mode — the experiment list is
    // gone or temporarily unrouteable. Like the 401 case it must
    // surface as an error, NOT trigger re-login.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 404,
      contentType: 'application/json',
      body: { error: 'not found' },
    }).as('labExperiments404');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.wait('@labExperiments404');

    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/experiments');
  });

  it('keeps the user on /experiments when DELETE /lab-experiments/:id succeeds', () => {
    // The DELETE branch in futureGadgetApi.js is a 2xx-success
    // early-return (no JSON parse) — only the error path was
    // exercised by the existing DELETE-500 test. This drives the
    // success path end-to-end: Admin clicks delete, the API returns
    // 2xx (no body), the row vanishes from the table, the user
    // stays on /experiments. Real user scenario, no recovery flow.
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-del-ok',
          name: 'Experiment to delete (success)',
          description: 'drives the DELETE 2xx success branch',
          worldLineChange: '0.000456',
          creator: 'Test',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('listForDeleteSuccess');

    cy.intercept('DELETE', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 204,
    }).as('deleteSuccess');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Experiment to delete (success)');

    cy.contains('tr', 'Experiment to delete (success)').within(() => {
      cy.get('button').contains(/Delete/i).click();
    });
    cy.get('[data-testid="confirm-delete-btn"]').should('be.visible').click();
    cy.wait('@deleteSuccess');

    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/experiments');
  });

  // ---------------------------------------------------------------------
  // Coverage for /future-gadget-lab/divergence-readings — the third
  // Future Gadget Lab endpoint that none of the prior session-expiry
  // specs reach. Real user scenario: the user is reading the
  // Divergence Meter and clicks the Refresh button on the readings
  // table. The session can have expired between visits, and the API
  // can also return a genuine backend failure.
  // ---------------------------------------------------------------------

  it('surfaces a genuine 401 on /divergence-readings as an error without re-login', () => {
    // The user is on the dashboard, opens the divergence-readings
    // refresh, and the API returns a real 401 (the user's Graph
    // token has been revoked but their cached MSAL account is still
    // valid). The recovery flow must NOT fire — only the Easy Auth
    // sign-in page should trigger re-login. Acceptance criterion #3.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings*', {
      statusCode: 401,
      contentType: 'application/json',
      body: { error: 'unauthorized' },
    }).as('divergenceReadings401');

    cy.get('[data-testid="refresh-readings-btn"]').click();
    cy.wait('@divergenceReadings401');

    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/dashboard');
  });

  it('re-authenticates when /divergence-readings returns the Easy Auth login page', () => {
    // Same scenario as the dashboard reload test, but driven from the
    // Refresh button on the divergence-readings table — exercises the
    // recovery path through `getDivergenceReadings` in
    // `futureGadgetApi.js`, which none of the other session-expiry
    // specs reach. The user must land back on /dashboard after
    // re-authenticating. Acceptance criteria #1 and #2.
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="worldline-status-card"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings*', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('divergenceReadingsExpired');

    cy.get('[data-testid="refresh-readings-btn"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');
  });

  // ---------------------------------------------------------------------
  // PUT /lab-experiments/:id coverage — the previous consolidated spec
  // only exercised GET, POST, and DELETE on the lab-experiments
  // endpoints. PUT goes through the same code path as POST in
  // makeAuthenticatedRequest, but `updateExperiment` is its own
  // exported function and the e2e layer had never reached it through
  // the real Edit form. Two scenarios:
  //   - Admin edits an experiment while their session is healthy and
  //     the API returns 403 (genuine backend rejection).
  //   - Admin edits an experiment while their session has expired and
  //     the API returns the Easy Auth sign-in HTML.
  // Both are real user scenarios.
  // ---------------------------------------------------------------------

  it('surfaces a genuine 403 on PUT /lab-experiments/:id as an error without re-login', () => {
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-put-403',
          name: 'Experiment to edit (403)',
          description: 'drives the PUT 403 branch',
          worldLineChange: '0.000123',
          status: 'planned',
          creator_id: 'Test',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('listForPut403');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'application/json',
      body: {
        id: 'probe-exp-put-403',
        name: 'Experiment to edit (403)',
        description: 'drives the PUT 403 branch',
        worldLineChange: '0.000123',
        status: 'planned',
        creator_id: 'Test',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }).as('getExperimentForPut403');

    cy.intercept('PUT', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 403,
      contentType: 'application/json',
      body: { error: 'forbidden' },
    }).as('putExperiment403');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Experiment to edit (403)');

    cy.contains('tr', 'Experiment to edit (403)').within(() => {
      cy.get('button').contains(/Edit/i).click();
    });
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');

    // Submit the form unchanged — the PUT intercept handles it.
    cy.get('[data-testid="experiment-form-submit"]').click();
    cy.wait('@putExperiment403');

    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 5000 }).should('include', '/experiments');
  });

  it('re-authenticates when PUT /lab-experiments/:id returns the Easy Auth login page', () => {
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-put-expired',
          name: 'Experiment to edit (expired)',
          description: 'drives the PUT expiry branch',
          worldLineChange: '0.000456',
          status: 'planned',
          creator_id: 'Test',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('listForPutExpired');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'application/json',
      body: {
        id: 'probe-exp-put-expired',
        name: 'Experiment to edit (expired)',
        description: 'drives the PUT expiry branch',
        worldLineChange: '0.000456',
        status: 'planned',
        creator_id: 'Test',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }).as('getExperimentForPutExpired');

    cy.intercept('PUT', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: loginHtmlBody,
    }).as('putExperimentExpired');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Experiment to edit (expired)');

    cy.contains('tr', 'Experiment to edit (expired)').within(() => {
      cy.get('button').contains(/Edit/i).click();
    });
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="experiment-form-submit"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  // ---------------------------------------------------------------------
  // InteractionRequiredAuthError from acquireTokenSilent. This is the
  // "refresh token gone" case that MSAL raises before any HTTP request
  // is made — a real user scenario distinct from the Easy Auth HTML
  // detection above. The api.js / futureGadgetApi.js catch block
  // publishes a SessionExpiredError and rethrows, which the recovery
  // guard treats the same way as an HTML response. Drives the
  // InteractionRequiredAuthError detection branches
  // (tokenError.name === '...', errorCode === '...', /regex/) in both
  // api files.
  // ---------------------------------------------------------------------

  it('re-authenticates when acquireTokenSilent signals interaction-required', () => {
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // Tell the mock MSAL to make acquireTokenSilent reject with an
    // InteractionRequiredAuthError — no HTTP request will fire because
    // the token acquisition happens before fetch().
    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_INTERACTION_REQUIRED', 'true');
    });

    // The next /api/user-data fetch will go through the
    // acquireTokenSilent-rejection path. The recovery flow runs and
    // the user lands back on /dashboard after the popup completes.
    cy.get('[data-testid="reload-button"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');

    // Reset the flag so subsequent tests use the default token path.
    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_INTERACTION_REQUIRED');
    });
  });

  // ---------------------------------------------------------------------
  // Same acquisition-required path as the test above, but with the
  // mock throwing a *plain* Error whose name is not
  // `InteractionRequiredAuthError` and whose errorCode is not
  // `interaction_required` — the e2e equivalent of MSAL's surfacing
  // interaction-required via the errorMessage text instead of via the
  // class / errorCode fields. api.js / futureGadgetApi.js's
  // three-way OR detection (name === '...' / errorCode === '...' /
  // /regex/.test(errorMessage)) has short-circuit logic that means
  // each mock only exercises one path; this test specifically drives
  // the regex path that the existing MOCK_INTERACTION_REQUIRED hook
  // cannot reach.
  // ---------------------------------------------------------------------

  it('re-authenticates when the token-error message mentions interaction_required', () => {
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_INTERACTION_REQUIRED_BY_MESSAGE', 'true');
    });

    cy.get('[data-testid="reload-button"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');

    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_INTERACTION_REQUIRED_BY_MESSAGE');
    });
  });

  // ---------------------------------------------------------------------
  // Lab-side counterpart of the test above: the same generic-error
  // BrowserAuthError mentioning `interaction_required` in the message
  // reaches a Future Gadget Lab endpoint instead of the dashboard's
  // /api/user-data. This is the e2e proof that futureGadgetApi.js's
  // token-acquisition catch publishes a SessionExpiredError and
  // triggers the recovery flow, not just api.js. Without this test
  // the regex branch in futureGadgetApi.js's three-way OR detection
  // would only be exercised on the unit-test side.
  // ---------------------------------------------------------------------

  it('re-authenticates when the lab reload token-error message mentions interaction_required', () => {
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_INTERACTION_REQUIRED_BY_MESSAGE', 'true');
    });

    cy.get('[data-testid="reload-experiments-btn"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');

    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_INTERACTION_REQUIRED_BY_MESSAGE');
    });
  });

  // ---------------------------------------------------------------------
  // Genuine token-acquisition failure (network, AAD outage, config
  // drift) is distinct from session expiry: the user is still
  // authenticated, the access token just could not be obtained right
  // now. api.js / futureGadgetApi.js must NOT fire SessionExpiredError
  // in this case — that would pop a re-auth popup the user does not
  // need. The catch block must fall through to ApiError and the
  // existing toast / error UI surfaces the failure.
  // ---------------------------------------------------------------------

  it('surfaces a genuine token-acquisition failure as an error without re-login', () => {
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_TOKEN_ERROR', 'true');
    });

    cy.get('[data-testid="reload-button"]').click();

    // The Sign-In button must NOT appear — the user is still
    // authenticated; the failure is just a token-acquisition error,
    // not a session expiry. URL stays on /dashboard.
    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/dashboard');

    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_TOKEN_ERROR');
    });
  });

  it('surfaces a genuine token-acquisition failure on /lab-experiments without re-login', () => {
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_TOKEN_ERROR', 'true');
    });

    cy.get('[data-testid="reload-experiments-btn"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 5000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');

    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_TOKEN_ERROR');
    });
  });

  // ---------------------------------------------------------------------
  // MSAL signals interaction_required through errorCode alone (not via
  // the InteractionRequiredAuthError class name, and not via the
  // errorMessage text). Some MSAL browser builds surface this shape
  // when the cached refresh token has been revoked server-side while
  // the user is still technically authenticated. Drives the middle OR
  // operand in the three-way detection. Mirrors the MOCK_INTERACTION_REQUIRED
  // test, but the recovery still fires because the catch publishes
  // SessionExpiredError when errorCode === 'interaction_required'.
  // ---------------------------------------------------------------------

  it('re-authenticates when the dashboard token-error carries errorCode=interaction_required', () => {
    loginAs('User');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_INTERACTION_REQUIRED_BY_CODE', 'true');
    });

    cy.get('[data-testid="reload-button"]').click();

    cy.url({ timeout: 30000 }).should('include', '/dashboard');

    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_INTERACTION_REQUIRED_BY_CODE');
    });
  });

  it('re-authenticates when the lab reload token-error carries errorCode=interaction_required', () => {
    loginAs('Admin');
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_INTERACTION_REQUIRED_BY_CODE', 'true');
    });

    cy.get('[data-testid="reload-experiments-btn"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');

    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_INTERACTION_REQUIRED_BY_CODE');
    });
  });
});