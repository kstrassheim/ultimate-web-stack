/**
 * End-to-end coverage for the user-visible error paths in the API
 * layer (issue #86 follow-up, and the genuine-error branches of
 * `src/api/api.js`, `src/api/futureGadgetApi.js`, and
 * `src/api/errors.js`).
 *
 * `sessionExpiry.cy.js` already drives the SessionExpiredError /
 * SessionRecoveryGuard path with HTML bodies and verbose login pages.
 * What it does NOT cover is the complementary path: a *genuine*
 * backend failure (HTTP 4xx/5xx, network error, malformed JSON on a
 * non-expiry response). The issue body's "What the suite covers now"
 * list calls this out explicitly:
 *
 *   - `src/api/errors.js` — surface a failed request via `cy.intercept`
 *     with a 500 and assert the user-visible error.
 *
 * The branches that matter here:
 *   - `makeAuthenticatedRequest`'s
 *     `if (!inspection.looksLikeExpiry && (inspection.status < 200 || inspection.status >= 300))`
 *     block — the genuine 4xx/5xx path. Currently 0% branch coverage
 *     for `errors.js` because this branch is only reached when the
 *     API really does return a non-2xx non-expiry response.
 *   - The `notyfService.error(...)` path through Dashboard's
 *     catch-all that surfaces genuine failures to the user.
 *   - The acceptance criterion #3 ("a genuine 401/5xx is NOT
 *     misclassified as session expiry") — we must NOT see a re-login
 *     popup / sign-in button / `/access-denied` redirect.
 *
 * Note: `/api/user-data` is a "soft" endpoint — `makeAuthenticatedRequest`
 * returns `undefined` for non-admin URLs that fail, so a 500 on that
 * endpoint does NOT trigger the user-visible error path. We exercise
 * the throwing paths here: `/me/memberOf` (Microsoft Graph) and the
 * admin endpoints (`/api/admin-data`, `/api/admin/users`), all of
 * which re-throw ApiError on genuine failures.
 */

describe('Genuine backend errors surface as user-visible toasts (issue #86, non-expiry path)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });

    // Sign in as a regular user so the dashboard triggers the
    // authenticated requests (getUserData + getAllGroups via Promise.all).
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');
  });

  it('surfaces a 500 on /me/memberOf as a notyf error without triggering re-login', () => {
    // The Microsoft Graph groups endpoint is the throwing branch
    // (getAllGroups rejects on non-ok responses). Mount-time fetch
    // happens as soon as the dashboard mounts.
    cy.intercept('GET', '**/me/memberOf', {
      statusCode: 500,
      body: { error: 'Graph Service Unavailable' },
    }).as('graph500');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');

    // The intercepted Graph request must have been issued.
    cy.wait('@graph500');

    // The Dashboard's catch-all fires notyfService.error. The user
    // sees a notyf error toast.
    cy.get('.notyf__toast--error', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'Failed to load data');

    // Critically: a real 500 is NOT misclassified as session expiry.
    // SessionRecoveryGuard only fires for SessionExpiredError, never
    // for a genuine ApiError. We assert by absence — no sign-in
    // button has reappeared, no redirect to /access-denied.
    cy.url().should('not.include', '/access-denied');
    cy.get('[data-testid="sign-in-button"]').should('not.exist');

    // The dashboard is still the current page.
    cy.get('[data-testid="dashboard-page"]').should('be.visible');
  });

  it('a 500 response that looks like JSON is NOT misclassified as session expiry', () => {
    // Specifically guard the api/errors inspectResponseForExpiry()
    // branch: a JSON body on a 5xx status must NOT be treated as a
    // session expiry and must NOT trigger a re-login flow. The
    // heuristic looks at the Content-Type AND for login-page
    // markers in the body — neither applies to a clean JSON error
    // payload, so we expect the genuine-error path.
    cy.intercept('GET', '**/me/memberOf', {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: { error: 'Database connection lost' },
    }).as('jsonGraph500');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');

    cy.wait('@jsonGraph500');

    // User-visible error toast.
    cy.get('.notyf__toast--error', { timeout: 10000 }).should('be.visible');

    // No re-login was kicked off.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url().should('not.include', '/access-denied');
  });

  it('surfaces a 500 on /api/admin-data as a notyf error (admin endpoint throwing path)', () => {
    // Admin endpoints are also throwing — `makeAuthenticatedRequest`
    // re-throws ApiError for URLs containing "admin" (see
    // api.js line ~204). The throw bubbles up to whatever caller
    // invoked it; here we drive it via the experiments page reload
    // path, which exercises getAdminData via the experiments
    // fetch-data effect.
    //
    // Sign out the regular user and back in as Admin so the
    // experiments page is reachable and the admin endpoint is
    // actually called.
    cy.setMockRole('Admin');

    // Force a fresh page so the role change is honoured.
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    // Intercept the admin endpoint the experiments page hits.
    cy.intercept('GET', '**/api/admin-data', {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: { error: 'Admin API exploded' },
    }).as('admin500');

    cy.visit('/experiments');
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');

    cy.wait('@admin500');

    // Genuine 500 surfaces as a notyf error toast.
    cy.get('.notyf__toast--error', { timeout: 10000 }).should('be.visible');

    // Not misclassified as expiry — no re-login prompt.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url().should('not.include', '/access-denied');
  });
});