/**
 * End-to-end coverage for the **empty-state** render branches of
 * `src/pages/components/WorldlineMonitor.jsx`. The component has
 * four distinct "no data to show" placeholders, and none of them
 * are reached by the existing dashboard.cy.js happy-path tests
 * (which always seed the dashboard with worldline/status/history/
 * readings fixtures).
 *
 * What this exercises:
 *   - `worldlineStatus` is null AND `!loading.status` →
 *     `data-testid="no-worldline-status"` placeholder ("No
 *     worldline status available.").
 *   - `worldlineHistory.length === 0` AND `!loading.history` →
 *     `data-testid="no-worldline-history"` ("No worldline history
 *     available.").
 *   - `filteredReadings.length === 0` AND `!loading.readings` →
 *     `data-testid="no-readings"` ("No divergence readings
 *     found.").
 *   - `worldlineHistory.length === 0 && readings.length === 0`
 *     (the chart card) → `data-testid="no-chart-data"` ("No data
 *     available to generate chart.").
 *
 * All four placeholders are real user-visible copy the dashboard
 * renders when the backend has no data — the existing dashboard
 * tests bypass this by seeding populated arrays.
 *
 * Real user scenario: a fresh deployment with no telemetry yet,
 * or a moment after the user changes filters to something that
 * matches nothing.
 */

describe('WorldlineMonitor — empty-state placeholders', () => {
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

  it('renders the "No worldline status available." placeholder when /worldline-status returns nothing', () => {
    cy.setMockRole('User');

    // Return a 204 No Content from /worldline-status. The
    // worldlineMonitor fetch treats a non-2xx (or empty body) as
    // 'no status yet' — the status card renders the
    // `data-testid="no-worldline-status"` placeholder rather than
    // the badge / value pair.
    cy.intercept('GET', '**/worldline-status', {
      statusCode: 204,
    }).as('emptyStatus');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // Status card renders but with no current status — the
    // placeholder is visible. The value / badge are not.
    cy.get('[data-testid="no-worldline-status"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="no-worldline-status"]').should('contain.text', 'No worldline status available');
    cy.get('[data-testid="worldline-value"]').should('not.exist');
    cy.get('[data-testid="worldline-badge"]').should('not.exist');
  });

  it('renders the "No worldline history available." placeholder when /worldline-history returns []', () => {
    cy.setMockRole('User');

    cy.intercept('GET', '**/worldline-history', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyHistory');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // History card renders the empty-history placeholder.
    cy.get('[data-testid="no-worldline-history"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="no-worldline-history"]').should('contain.text', 'No worldline history available');
  });

  it('renders the "No divergence readings found." placeholder when /divergence-readings returns []', () => {
    cy.setMockRole('User');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings*', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyReadings');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // Readings card renders the empty-readings placeholder. The
    // Export CSV button is still rendered but is disabled (no
    // `filteredReadings.length > 0`), because the empty branch is
    // the user-visible signal that there is nothing to export.
    cy.get('[data-testid="no-readings"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="no-readings"]').should('contain.text', 'No divergence readings found');
    cy.get('[data-testid="export-readings-csv-btn"]').should('be.disabled');
    cy.get('[data-testid="readings-table"]').should('not.exist');
  });

  it('renders the "No data available to generate chart." placeholder when both history and readings are empty', () => {
    cy.setMockRole('User');

    // Both endpoints return [].
    cy.intercept('GET', '**/worldline-history', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyHistory');
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings*', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyReadings');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // The chart card's combined-emptiness placeholder renders.
    cy.get('[data-testid="no-chart-data"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="no-chart-data"]').should('contain.text', 'No data available to generate chart');
    cy.get('[data-testid="worldline-chart"]').should('not.exist');
    cy.get('[data-testid="loading-chart"]').should('not.exist');
  });

  it('applying a status filter that matches nothing drives the filtered-readings empty branch', () => {
    // The user-observable empty-state is reachable through the
    // filter UI too: pick a status that no record carries and the
    // table disappears into the "No divergence readings found"
    // placeholder, even though the underlying fetch had rows.
    cy.setMockRole('User');

    cy.intercept('GET', '**/future-gadget-lab/divergence-readings*', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'READ-FILTER-1',
          reading: 0.409845,
          status: 'alpha',
          recorded_by: 'Kiryu Moeka',
          notes: 'alpha worldline',
        },
      ],
    }).as('oneReading');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="readings-table"]', { timeout: 10000 }).should('be.visible');

    // Pick a status the lone alpha row doesn't match.
    cy.get('[data-testid="status-filter"]').select('steins_gate');
    // applyFilters re-runs synchronously inside the useEffect; the
    // filtered table disappears and the empty placeholder appears.
    cy.get('[data-testid="no-readings"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="readings-table"]').should('not.exist');
    cy.get('[data-testid="export-readings-csv-btn"]').should('be.disabled');
  });
});
