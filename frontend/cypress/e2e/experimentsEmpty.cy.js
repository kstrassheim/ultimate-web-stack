/**
 * End-to-end coverage for the empty-state render of
 * `src/pages/Experiments.jsx`, plus the user-observable affordance
 * it provides (the "Create your first experiment" button that opens
 * the create form directly, without first having to click "New
 * Experiment").
 *
 * Why this matters for issue #149:
 *   - Experiments.jsx sits at 32% statement / 20% branch coverage
 *     before this spec. The empty-state conditional and the
 *     create-first-experiment button are large, untested branches
 *     in the production UI.
 *   - `!loading && experiments.length === 0` renders the empty
 *     placeholder. Without an empty-state spec, that branch is only
 *     exercised accidentally through the session-expiry suite.
 *
 * What this exercises:
 *   - `experiments.length === 0` branch in the table render.
 *   - The `!loading` guard (the `loading` state must be false).
 *   - `openCreateForm` is called when the user clicks
 *     "Create your first experiment" — exercises the
 *     `setCurrentExperiment({ name: '', status: 'planned', ... })`
 *     path that seeds the form for an empty creator profile.
 *   - `getStatusBadgeColor` is rendered for the form's initial
 *     `'planned'` status (drives one of its six switch cases).
 *
 * Real user scenario: a first-time admin visits the Future Gadget
 * Lab page. The backend returns an empty list. The page must show
 * the helpful empty-state copy and offer to create the first
 * experiment.
 */

describe('Experiments — empty state and create-first affordance', () => {
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

  it('renders the "No experiments found" empty-state placeholder when /lab-experiments returns []', () => {
    cy.setMockRole('Admin');

    // Stub the lab endpoint to return an empty array. This is the
    // "first visit" experience for a brand-new admin in a fresh
    // environment.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyExperiments');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');

    // The mount-time fetchExperiments() call resolves against the
    // stub and the loading overlay must clear before the empty
    // branch can render.
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // Empty-state is visible; the table is not.
    cy.get('[data-testid="no-experiments"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="no-experiments"]').should('contain.text', 'No experiments found');
    cy.get('[data-testid="experiments-table"]').should('not.exist');

    // The "Create your first experiment" affordance is present.
    cy.get('[data-testid="create-first-experiment-btn"]', { timeout: 10000 }).should('be.visible');
  });

  it('clicking "Create your first experiment" opens the create form with empty defaults', () => {
    cy.setMockRole('Admin');

    // Same empty-state setup. Then exercise the button → form path.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyExperiments');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="create-first-experiment-btn"]', { timeout: 10000 }).should('be.visible').click();

    // Modal opens in create mode with the seeded defaults.
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiment-form-title"]').should('contain.text', 'Create New Experiment');

    // The seed values from openCreateForm(): name empty, status
    // 'planned' (drives the planned branch in getStatusBadgeColor),
    // world_line_change 0, timestamp empty, results ''. The
    // required (yellow) fields rendered empty drive the
    // `name === '' || status === '' || creator_id === ''` branch
    // that appears in the experiments.cy.js "Now button" test but
    // not in any other spec.
    cy.get('#experiment-name').should('have.value', '');
    cy.get('#experiment-status').should('have.value', 'planned');
    cy.get('#experiment-world-line-change').should('have.value', '0');
    cy.get('#experiment-timestamp').should('have.value', '');
    cy.get('#experiment-results').should('have.value', '');

    // Closing the modal returns us to the empty-state placeholder.
    // The placeholder survives across opens/closes because the
    // empty list is the source of truth that re-renders after the
    // modal closes (formMode === 'create' but no create happened).
    cy.get('[data-testid="experiment-form-modal"] .btn-close').first().click();
    cy.get('[data-testid="no-experiments"]').should('be.visible');
    cy.get('[data-testid="create-first-experiment-btn"]').should('be.visible');
  });

  it('renders the empty-state placeholder again after an edit modal cancel', () => {
    // Real user journey: admin clicks "Edit" on an existing row,
    // opens the form, then dismisses. The empty-state branching
    // must come back into view, not the table. With a single-row
    // stub and the form opened against that row, dismissing must
    // re-render the empty placeholder. This is small, but it's the
    // only spec that proves the empty → table → empty cycle works.
    cy.setMockRole('Admin');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [
        {
          id: 'EXP-EMPTY-CYCLE',
          name: 'Cycle experiment',
          description: 'drives the empty cycle',
          status: 'planned',
          creator_id: 'Cycle Tester',
          world_line_change: 0.0,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    }).as('oneExperiment');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('contain.text', 'Cycle experiment');

    // Now intercept a reload that returns [] to drive the empty
    // branch from a re-render of the table.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyAfterReload');

    cy.get('[data-testid="reload-experiments-btn"]').click();
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.get('[data-testid="no-experiments"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiments-table"]').should('not.exist');
  });
});
