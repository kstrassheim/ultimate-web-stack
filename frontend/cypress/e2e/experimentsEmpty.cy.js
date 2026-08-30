/**
 * End-to-end coverage for the empty-state render of
 * `src/pages/Experiments.jsx`, plus the user-observable affordance
 * it provides (the "Create your first experiment" button that opens
 * the create form directly, without first having to click "New
 * Experiment").
 *
 * Why this matters for issue #149:
 *   - Experiments.jsx sits at ~32% branch coverage before this spec.
 *     The empty-state conditional and the create-first-experiment
 *     button are large, untested branches in the production UI.
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
    // deployment.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyList');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // Empty state placeholder is visible. The full table is NOT.
    cy.get('[data-testid="no-experiments"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="no-experiments"]').should('contain.text', 'No experiments found');
    cy.get('[data-testid="experiments-table"]').should('not.exist');

    // The "Create your first experiment" affordance is rendered —
    // this is the empty-state-only button that opens the form
    // directly, which is the user-observable behaviour of the
    // `openCreateForm` branch.
    cy.get('[data-testid="create-first-experiment-btn"]').should('be.visible');
  });

  it('clicking the empty-state create button opens the form with the initial state', () => {
    cy.setMockRole('Admin');

    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: [],
    }).as('emptyListForCreate');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    // Click the empty-state create button. The form modal opens,
    // confirming the openCreateForm branch is reachable from a
    // populated but-no-rows state.
    cy.get('[data-testid="create-first-experiment-btn"]').click();
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');

    // The form is for a new experiment (the title says "Create
    // New Experiment", not "Edit Experiment"). Name is empty;
    // status defaults to 'planned' (drives one of the six
    // getStatusBadgeColor switch cases on first render).
    cy.get('[data-testid="experiment-form-title"]').should('contain', 'Create New Experiment');
    cy.get('#experiment-name').should('have.value', '');
    cy.get('#experiment-status').should('have.value', 'planned');
  });
});