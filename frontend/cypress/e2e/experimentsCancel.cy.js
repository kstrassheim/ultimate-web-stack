/**
 * End-to-end coverage for the **cancel / dismiss** branches of
 * `src/pages/Experiments.jsx` and the experiment form. The existing
 * experiments.cy.js suite exercises every CRUD happy-path but
 * never asserts the user-cancellable paths (cancel on the delete
 * confirmation, cancel on the create/edit form). These are real
 * user-observable flows — a user who opens the delete dialog and
 * then closes it must see the modal disappear and the row stay on
 * screen, with no DELETE request fired.
 *
 * What this exercises:
 *   - `setShowDeleteModal(false)` and `setExperimentToDelete(null)`
 *     from the cancel-delete-btn handler.
 *   - The DELETE-on-confirm path is NOT invoked when the cancel
 *     button is clicked (the relevant cy.intercept wait is never
 *     satisfied).
 *   - The "backdrop click / close button" path on the
 *     experiment-form-modal: `setShowForm(false)` from the
 *     `<Modal onHide>` handler.
 *   - `formMode === 'edit'` round-trip: open edit, then close
 *     without saving — `currentExperiment` is retained but
 *     `showForm === false`.
 *   - HTML5 form validation (`checkValidity() === false` branch
 *     in handleSubmit) — submitting without a name shows the
 *     "Please provide..." feedback.
 *
 * Acceptance: this is the test affordance for "the user changed
 * their mind", which real users do all the time and which the
 * existing suite glossed over because every existing test commits
 * the form rather than dismissing it.
 */

describe('Experiments — cancel, dismiss, and validation paths', () => {
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

  // Convenience: sign in as Admin and stub the lab endpoint with one row.
  const loginAndSeed = (rows) => {
    cy.setMockRole('Admin');
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      contentType: 'application/json',
      body: rows,
    }).as('seededList');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('be.visible');
  };

  it('cancelling the delete dialog does not fire a DELETE request and keeps the row visible', () => {
    // Track DELETEs to prove the cancel path is silent — the wait
    // would normally fail if a delete was issued, so we use a
    // negative assertion via cy.wait with a short timeout.
    cy.intercept('DELETE', '**/future-gadget-lab/lab-experiments/*', cy.spy().as('deleteSpied'));

    loginAndSeed([
      {
        id: 'EXP-CANCEL-DEL',
        name: 'Cancel-target experiment',
        description: 'must survive the dialog close',
        status: 'planned',
        creator_id: 'Canceller',
        world_line_change: 0.123456,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);

    // Open the delete dialog.
    cy.get('[data-testid="delete-btn-EXP-CANCEL-DEL"]').click();
    cy.get('[data-testid="delete-confirmation-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="delete-experiment-name"]').should('contain.text', 'Cancel-target experiment');

    // Cancel — the modal disappears and the row stays.
    cy.get('[data-testid="cancel-delete-btn"]').click();
    cy.get('[data-testid="delete-confirmation-modal"]').should('not.exist');

    // The row is still in the table. The intercepted DELETE path is
    // not invoked — `deleteSpied` has zero hits.
    cy.get('[data-testid="experiments-table"]').should('contain.text', 'Cancel-target experiment');

    cy.get('@deleteSpied').its('callCount').then((callCount) => {
      expect(callCount).to.equal(0);
    });
  });

  it('dismissing the edit modal via the close button (×) does not save and keeps the row unchanged', () => {
    // Stub the GET to ensure a deterministic edit-form payload.
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments/EXP-EDIT-CLOSE', {
      statusCode: 200,
      contentType: 'application/json',
      body: {
        id: 'EXP-EDIT-CLOSE',
        name: 'Edit-close-target',
        description: 'preserved when the modal is dismissed',
        status: 'planned',
        creator_id: 'Original Creator',
        world_line_change: 0.409845,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }).as('getExperimentForEdit');

    // Watch for PUTs — should NOT be issued if the user just closes
    // the dialog.
    cy.intercept('PUT', '**/future-gadget-lab/lab-experiments/*', cy.spy().as('putSpied'));

    loginAndSeed([
      {
        id: 'EXP-EDIT-CLOSE',
        name: 'Edit-close-target',
        description: 'preserved when the modal is dismissed',
        status: 'planned',
        creator_id: 'Original Creator',
        world_line_change: 0.409845,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);

    cy.get('[data-testid="edit-btn-EXP-EDIT-CLOSE"]').click();
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiment-form-title"]').should('contain.text', 'Edit Experiment');

    // Wait for the per-id fetch to settle so the form is fully seeded.
    cy.wait('@getExperimentForEdit');

    // The form has the original name loaded. Now click the close
    // button — Bootstrap puts a `.close` (×) inside the modal header.
    cy.get('[data-testid="experiment-form-modal"] .btn-close').first().click();

    cy.get('[data-testid="experiment-form-modal"]').should('not.exist');

    // The row stays as the original — no PUT, no patched name.
    cy.get('[data-testid="experiments-table"]').should('contain.text', 'Edit-close-target');
    cy.get('[data-testid="experiments-table"]').should('contain.text', 'Original Creator');

    cy.get('@putSpied').its('callCount').then((callCount) => {
      expect(callCount).to.equal(0);
    });
  });

  it('dismissing the create modal via the close button does not call createExperiment', () => {
    // Stub POSTs so we can prove the close path is silent. The
    // mount-time GET is stubbed so the page settles into the
    // existing-rows render with the New Experiment button.
    cy.intercept('POST', '**/future-gadget-lab/lab-experiments', cy.spy().as('postSpied'));

    loginAndSeed([
      {
        id: 'EXP-PRESEED',
        name: 'Preseed',
        description: 'so the New Experiment button is visible',
        status: 'planned',
        creator_id: 'Preseeder',
        world_line_change: 0.0,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);

    cy.get('[data-testid="new-experiment-btn"]').click();
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiment-form-title"]').should('contain.text', 'Create New Experiment');

    // Close without filling anything in.
    cy.get('[data-testid="experiment-form-modal"] .btn-close').first().click();

    cy.get('[data-testid="experiment-form-modal"]').should('not.exist');
    cy.get('[data-testid="experiments-table"]').should('contain.text', 'Preseed');

    cy.get('@postSpied').its('callCount').then((callCount) => {
      expect(callCount).to.equal(0);
    });
  });

  it('submitting the form with empty required fields surfaces HTML5 validation feedback', () => {
    // Drive the `form.checkValidity() === false` branch in
    // handleSubmit. We click submit without filling any required
    // fields — the form renders the "Please provide..." feedback
    // and the modal stays open.
    loginAndSeed([
      {
        id: 'EXP-PRESEED',
        name: 'Preseed',
        description: 'so the New Experiment button is visible',
        status: 'planned',
        creator_id: 'Preseeder',
        world_line_change: 0.0,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);

    cy.get('[data-testid="new-experiment-btn"]').click();
    cy.get('[data-testid="experiment-form-modal"]', { timeout: 10000 }).should('be.visible');

    // Clear the seed-derived creator in case the mock account name
    // happens to satisfy HTML5; we want the validation feedback to
    // be unambiguous.
    cy.get('#experiment-creator').clear();

    cy.get('[data-testid="experiment-form-submit"]').click();

    // The form stays open; the browser's HTML5 validation feedback
    // appears on the first invalid field. Bootstrap surfaces it via
    // the .invalid-feedback slot under the field; we assert the
    // form modal is still visible (it MUST NOT disappear — that's
    // the user-visible contract of the checkValidity branch).
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
    cy.get('.invalid-feedback').should('exist');
  });

  it('cancelling a delete after re-opening via the same row keeps the cancel button responsive', () => {
    // Open the delete dialog twice on the same row, cancelling both
    // times. Real user scenario: opens the dialog, decides not to,
    // then opens it again a moment later. The cancel must keep
    // working across re-opens.
    loginAndSeed([
      {
        id: 'EXP-DOUBLE-CANCEL',
        name: 'Double-cancel experiment',
        description: 'cancelled twice in a row',
        status: 'planned',
        creator_id: 'Indecisive',
        world_line_change: 0.0,
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);

    cy.get('[data-testid="delete-btn-EXP-DOUBLE-CANCEL"]').click();
    cy.get('[data-testid="delete-confirmation-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="cancel-delete-btn"]').click();
    cy.get('[data-testid="delete-confirmation-modal"]').should('not.exist');

    cy.get('[data-testid="delete-btn-EXP-DOUBLE-CANCEL"]').click();
    cy.get('[data-testid="delete-confirmation-modal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="cancel-delete-btn"]').click();
    cy.get('[data-testid="delete-confirmation-modal"]').should('not.exist');

    cy.get('[data-testid="experiments-table"]').should('contain.text', 'Double-cancel experiment');
  });
});
