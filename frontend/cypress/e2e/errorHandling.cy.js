/**
 * End-to-end coverage of api/error surfaces — issue #149.
 *
 * api/errors.js is heavily exercised by sessionExpiry.cy.js (login
 * page body → SessionExpiredError; 4xx/5xx → ApiError; etc.), but the
 * data-driven story around the user-visible path is split between
 * the dashboard's "Failed to load data" toast and the Worldline
 * monitor's per-section error messages. This spec targets the bits
 * that sessionExpiry.cy.js doesn't reach from a *successful* page
 * load — i.e. a 500 on the worldline endpoint while the Dashboard
 * is in a known-good state, and the user-visible failure surface
 * that follows from it. That exercises:
 *
 *   - WorldlineMonitor.jsx's fetchWorldlineStatus failure branch
 *     (setError inline + notyfService.error toast + trackException),
 *   - api/errors.js's ApiError construction with a real 5xx status
 *     code (not the inspection-without-body case the unit suite covers).
 *
 * Note: the user-data 500 path that would test
 * Dashboard.jsx's `setError(err.message)` branch (lines 60-62) is
 * not reachable from a Cypress run because api.js deliberately
 * converts /user-data 5xx responses into `return undefined` for
 * backward compatibility with the legacy "no data available" UI
 * (api.js's `if (url.includes('admin')) throw err; return undefined;`
 * block). The admin endpoint does throw, but the Dashboard never
 * calls it. So the worldline path is the honest target.
 */

describe('Error surfaces — failed-request paths (issue #149)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });
  });

  it('shows a "Failed to load worldline status" error when /worldline-status returns 500', () => {
    // Force the WorldlineMonitor's status fetch to fail. The mount
    // effect's try/catch sets the inline error state AND fires a
    // notyf error toast — both branches in
    // WorldlineMonitor.jsx's fetchWorldlineStatus are reached.
    cy.intercept('GET', '**/worldline-status', {
      statusCode: 500,
      body: { error: 'worldline-status unavailable' },
    }).as('worldlineStatus500');

    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]').should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should(
      'not.exist',
    );

    // The WorldlineMonitor sets inline error text in the failure
    // branch; assert on the prefix the component uses.
    cy.contains('[data-testid="worldline-monitor"]', 'Failed to load worldline status', {
      timeout: 10000,
    }).should('be.visible');

    // And the matching notyf error toast.
    cy.get('.notyf__toast--error', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'Failed to load worldline status');

    cy.wait('@worldlineStatus500');
  });
});