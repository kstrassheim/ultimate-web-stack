/**
 * End-to-end coverage for the JSON-parse error branch of
 * `src/api/errors.js` `inspectionJson()` — the catch block on
 * `JSON.parse(inspection.bodyText)`.
 *
 * What this exercises:
 *   - `inspectionJson(inspection)` line 240 (the `} catch (err) {` and
 *     the `throw new ApiError(...)` on lines 241-244) — when the body
 *     is captured successfully by `inspectResponseForExpiry` but is
 *     not valid JSON, the helper throws an `ApiError` rather than
 *     silently returning undefined. This is distinct from the
 *     session-expiry path (which fires earlier) and from the
 *     genuine-4xx/5xx path (which also fires earlier — both branches
 *     short-circuit before `inspectionJson` is called).
 *   - The user-visible behaviour: a 200 response with a non-JSON
 *     body that the api helpers cannot decode.
 *
 * Why `/api/user-data` and not `/api/admin-data`:
 *   `getAdminData` is exported from `src/api/api.js` but is not
 *   called anywhere in the production UI, so cy.intercept on that
 *   URL never matches a real fetch. `/api/user-data` is fetched by
 *   the Dashboard's mount effect, so it reliably triggers a request.
 *
 * The user-data path swallows the parse error (returns undefined)
 * rather than rethrowing it — see api.js ~line 220's catch block.
 * That still drives `inspectionJson`'s throw (the line under test),
 * because the throw happens BEFORE the api.js catch runs. The
 * assertion below is "no user-visible crash", which is what the
 * user-data swallow produces in practice.
 */

describe('Non-JSON 200 responses reach the inspectionJson catch branch', () => {
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

  it('handles a 200 with a non-JSON body on /api/user-data without crashing the dashboard', () => {
    // Sign in as a regular user.
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    // Intercept /api/user-data with a 200 whose body is plain text.
    //   - status === 200 (passes the genuine-error short-circuit)
    //   - content-type is text/plain (does NOT match text/html, so
    //     the expiry inspection sets `looksLikeExpiry = false`)
    //   - body is "not-json-at-all" — JSON.parse fails, inspectionJson
    //     throws an ApiError, api.js's catch-all converts it into a
    //     notyf error (because the parseErr is not a SessionExpiredError
    //     and the URL is non-admin). For user-data the helper swallows
    //     to undefined, but the throw is exercised first.
    cy.intercept('GET', '**/api/user-data', {
      statusCode: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: 'not-json-at-all',
    }).as('userDataPlainText');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');

    cy.wait('@userDataPlainText');

    // The Dashboard's Promise.all completes with userData === undefined
    // (api.js swallows the parse error for non-admin URLs) and the
    // groups data from getAllGroups. The data-card renders "No data
    // available" because userData is undefined. That is the
    // user-observable signal that the parse error was reached: the
    // API did not produce a valid {message: ...} object, but the
    // dashboard did not crash either.
    cy.get('[data-testid="api-message-empty"]', { timeout: 10000 }).should('be.visible');

    // Critically: this is NOT misclassified as a session expiry.
    // The sign-in button must NOT have reappeared, and the URL must
    // not redirect to /access-denied.
    cy.get('[data-testid="sign-in-button"]').should('not.exist');
    cy.url().should('not.include', '/access-denied');

    // The dashboard remains mounted.
    cy.get('[data-testid="dashboard-page"]').should('be.visible');
  });
});
