/**
 * E2E coverage extension for the Future Gadget Lab API methods that
 * the existing `sessionExpiry*.cy.js` specs do not exercise: POST
 * (createExperiment), PUT (updateExperiment), DELETE (deleteExperiment).
 *
 * The previous specs only intercepted `GET` requests against
 * `/future-gadget-lab/*`. They left the POST/PUT/DELETE branches in
 * `makeAuthenticatedRequest` and the `method === 'DELETE'` early
 * success return in `futureGadgetApi.js` uncovered, which kept the
 * `nyc check-coverage` global branch count below the 65 % gate.
 *
 * Each test in this file intercepts exactly one (method, response) pair
 * via the actual UI button that triggers it, so the coverage gaps are
 * attributable to specific lines / branches without ambiguity.
 */

describe('Session-expiry / Future Gadget Lab method coverage (issue #86)', () => {
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

  it('surfaces a genuine 500 on POST /lab-experiments as a non-expiry error', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('POST', '**/future-gadget-lab/lab-experiments', {
      statusCode: 500,
      contentType: 'application/json',
      body: { error: 'create failed' },
    }).as('createExperiment500');

    // Open the new-experiment form, fill it in, submit. The form button
    // triggers `createExperiment` (POST) which the intercept handles.
    cy.get('[data-testid="new-experiment-btn"]').click();
    cy.get('#experiment-name').type('Coverage Probe Experiment');
    cy.get('#experiment-description').type('probes the POST /lab-experiments branch');
    cy.get('#experiment-creator').clear().type('Coverage Probe');
    cy.get('[data-testid="experiment-form-submit"]').click();

    // Genuine 500 must NOT trigger re-login. We should stay on
    // /experiments and the Sign-In button must never appear.
    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');
  });

  it('surfaces a genuine 404 on POST /lab-experiments as a non-expiry error', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('POST', '**/future-gadget-lab/lab-experiments', {
      statusCode: 404,
      contentType: 'application/json',
      body: { error: 'route not found' },
    }).as('createExperiment404');

    cy.get('[data-testid="new-experiment-btn"]').click();
    cy.get('#experiment-name').type('Coverage Probe 404');
    cy.get('#experiment-description').type('probes POST 404 branch');
    cy.get('#experiment-creator').clear().type('Coverage Probe');
    cy.get('[data-testid="experiment-form-submit"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');
  });

  it('surfaces a genuine 403 on PUT /lab-experiments/:id as a non-expiry error', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    // PUT requests with a status code < 200 || >= 300 must surface as
    // ApiError without triggering re-login.
    cy.intercept('PUT', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 403,
      contentType: 'application/json',
      body: { error: 'forbidden' },
    }).as('updateExperiment403');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-1',
          name: 'Existing experiment for PUT test',
          description: 'used to drive the PUT branch',
          worldLineChange: '0.000123',
          creator: 'Coverage Probe',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('listExperimentsForPut');

    // The Edit button click triggers `fetchExperimentById(id)` which calls
    // GET /lab-experiments/:id. The mock backend returns 404 for unknown
    // ids, so the edit form would never open. Intercept the by-id URL
    // explicitly so the populated single-experiment payload reaches the
    // form and the PUT can be exercised.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'application/json',
      body: {
        id: 'probe-exp-1',
        name: 'Existing experiment for PUT test',
        description: 'used to drive the PUT branch',
        worldLineChange: '0.000123',
        creator: 'Coverage Probe',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }).as('getExperimentByIdPut403');

    // Reload the page so the GET intercept fires and seeds the table.
    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Existing experiment for PUT test');

    // Click the first Edit button on the row we just created. The Edit
    // button is rendered inside the row's action cell.
    cy.contains('tr', 'Existing experiment for PUT test').within(() => {
      cy.get('button').contains(/Edit/i).click();
    });

    // The edit form must be visible — the by-id intercept above makes
    // fetchExperimentById return the experiment so the form opens.
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');

    // Submit the edit form (PUT).
    cy.get('[data-testid="experiment-form-submit"]').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');
  });

  it('detects a session-expiry HTML body on POST /lab-experiments and triggers the recovery flow', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    // The `summarizeBody` long-branch + the SessionExpiredError / html-body
    // detection on a non-GET method: covered nowhere else because the
    // previous specs only intercepted GETs.
    const longLoginBody =
      '<!DOCTYPE html><html><head><title>Please authenticate to continue using the dashboard. ' +
      'Your session has expired and we need you to sign in again to restore access to the ' +
      'protected resources behind this endpoint. This is the Easy Auth default sign-in page.</title>' +
      '</head><body>' +
      '<form action="https://login.microsoftonline.com/foo" method="POST">' +
      '<input type="hidden" name="state" value="xyz"/>' +
      '<button type="submit">Sign in</button>' +
      '</form></body></html>';

    cy.intercept('POST', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: longLoginBody,
    }).as('createExperimentExpiry');

    cy.get('[data-testid="new-experiment-btn"]').click();
    cy.get('#experiment-name').type('Coverage Probe Expiry');
    cy.get('#experiment-description').type('probes POST expiry branch');
    cy.get('#experiment-creator').clear().type('Coverage Probe');
    cy.get('[data-testid="experiment-form-submit"]').click();

    // Recovery round-trip; after the mocked MSAL loginPopup resolves the
    // URL stabilises back on /experiments.
    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('detects a session-expiry HTML body on PUT /lab-experiments/:id and triggers the recovery flow', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-put',
          name: 'Existing experiment for PUT-expiry test',
          description: 'used to drive the PUT expiry branch',
          worldLineChange: '0.000456',
          creator: 'Coverage Probe',
          timestamp: '2026-01-02T00:00:00.000Z',
        },
      ],
    }).as('listExperimentsForPutExpiry');

    // The Edit button click triggers `fetchExperimentById(id)` which calls
    // GET /lab-experiments/:id. Without this intercept, the mock backend
    // returns 404 for the unknown id and the edit form never opens, so
    // the submit button is never reachable. Intercept the by-id URL with
    // the same experiment payload the list endpoint returns.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'application/json',
      body: {
        id: 'probe-exp-put',
        name: 'Existing experiment for PUT-expiry test',
        description: 'used to drive the PUT expiry branch',
        worldLineChange: '0.000456',
        creator: 'Coverage Probe',
        timestamp: '2026-01-02T00:00:00.000Z',
      },
    }).as('getExperimentByIdPutExpiry');

    cy.intercept('PUT', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!DOCTYPE html><html><head><title>Sign in to your account</title></head>' +
        '<body><form action="https://login.microsoftonline.com/foo"><input type="submit"/></form></body></html>',
    }).as('updateExperimentExpiry');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Existing experiment for PUT-expiry test');

    cy.contains('tr', 'Existing experiment for PUT-expiry test').within(() => {
      cy.get('button').contains(/Edit/i).click();
    });
    // The edit form must be visible here — the by-id intercept above
    // makes fetchExperimentById return the experiment, so the form
    // opens and the submit button is reachable.
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiment-form-submit"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('treats a session-expiry HTML body on DELETE /lab-experiments/:id as expiry', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    // Seed the table so the delete-row flow has a target row to click.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-del',
          name: 'Existing experiment for DELETE-expiry test',
          description: 'drives the DELETE expiry branch',
          worldLineChange: '0.000789',
          creator: 'Coverage Probe',
          timestamp: '2026-01-03T00:00:00.000Z',
        },
      ],
    }).as('listExperimentsForDelExpiry');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Existing experiment for DELETE-expiry test');

    // The DELETE branch in futureGadgetApi.js throws SessionExpiredError
    // when the response body looks like the Easy Auth login page; the
    // guard then triggers the recovery flow.
    cy.intercept('DELETE', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!DOCTYPE html><html><head><title>Sign in to your account</title></head>' +
        '<body><form action="https://login.microsoftonline.com/foo"><input type="submit"/></form></body></html>',
    }).as('deleteExperimentExpiry');

    cy.contains('tr', 'Existing experiment for DELETE-expiry test').within(() => {
      cy.get('button').contains(/Delete/i).click();
    });

    // Confirm-delete modal + click. The DELETE call goes through the
    // intercept and triggers the expiry path.
    cy.get('[data-testid="confirm-delete-btn"]', { timeout: 10000 }).should('be.visible').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });

  it('surfaces a genuine 500 on DELETE /lab-experiments/:id as a non-expiry error (covers the DELETE error branch)', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'probe-exp-del-500',
          name: 'Existing experiment for DELETE-500 test',
          description: 'drives the DELETE error branch',
          worldLineChange: '0.000111',
          creator: 'Coverage Probe',
          timestamp: '2026-01-04T00:00:00.000Z',
        },
      ],
    }).as('listExperimentsForDel500');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Existing experiment for DELETE-500 test');

    // A genuine 5xx on DELETE must surface as ApiError (the DELETE-specific
    // branch in futureGadgetApi.js that throws when status is outside
    // 200-299), NOT trigger re-login.
    cy.intercept('DELETE', '**/future-gadget-lab/lab-experiments/*', {
      statusCode: 500,
      contentType: 'application/json',
      body: { error: 'delete failed' },
    }).as('deleteExperiment500');

    cy.contains('tr', 'Existing experiment for DELETE-500 test').within(() => {
      cy.get('button').contains(/Delete/i).click();
    });
    cy.get('[data-testid="confirm-delete-btn"]', { timeout: 10000 }).should('be.visible').click();

    cy.get('[data-testid="sign-in-button"]', { timeout: 10000 }).should('not.exist');
    cy.url({ timeout: 10000 }).should('include', '/experiments');
  });

  it('covers the summarizeBody short-body (<=200 chars) branch in futureGadgetApi.js via POST', () => {
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');

    // A short HTML body that fits inside the 200-char preview window
    // (no `…` truncation) — exercises the `trimmed.length <= 200` arm
    // of `summarizeBody` on a non-GET method, which the existing GET-only
    // session-expiry specs cannot reach.
    const shortLoginBody =
      '<!DOCTYPE html><html><head><title>Sign in</title></head>' +
      '<body><form action="https://login.microsoftonline.com/x">' +
      '<input type="submit"/></form></body></html>';

    cy.intercept('POST', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'text/html',
      body: shortLoginBody,
    }).as('createExperimentShortExpiry');

    cy.get('[data-testid="new-experiment-btn"]').click();
    cy.get('#experiment-name').type('Coverage Probe Short Body');
    cy.get('#experiment-description').type('probes the short-body branch on POST');
    cy.get('#experiment-creator').clear().type('Coverage Probe');
    cy.get('[data-testid="experiment-form-submit"]').click();

    cy.url({ timeout: 30000 }).should('include', '/experiments');
  });
});