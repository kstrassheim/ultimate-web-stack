import { setMockRole } from '../support/msalMock';

describe('Future Gadget Lab - Experiments CRUD Operations', () => {
  beforeEach(() => {
    // Set up admin role before each test
    cy.setMockRole('Admin');
    // Visit the home page
    cy.visit('/');
    // Sign in
    cy.get('[data-testid="sign-in-button"]').click();
    // Navigate to Experiments page directly (no longer in a dropdown)
    cy.get('[data-testid="nav-experiments"]').click();
    // Verify we're on the experiments page
    cy.get('[data-testid="experiments-heading"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="experiments-heading"]').should('contain.text', 'Future Gadget Lab Experiments');
  });
  
  it('should load and display existing experiments with world line change and timestamp columns', () => {
    // Wait for experiments to load
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
    
    // Verify experiments table exists and has data
    cy.get('[data-testid="experiments-table"]').should('be.visible');
    cy.get('[data-testid="experiments-card-header"]').should('contain.text', 'All Experiments');
    
    // Check for toast notification
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Experiments loaded successfully');
    
    // Verify WebSocket connection status
    cy.get('[data-testid="connection-status"]').should('be.visible');
    cy.get('[data-testid="status-badge"]').should('contain.text', 'Connected');
    
    // Verify new columns exist
    cy.get('th').contains('World Line Change').should('be.visible');
    cy.get('th').contains('Timestamp').should('be.visible');
    
    // Verify data cells for the new columns
    cy.get('[data-testid="experiment-worldline"]').should('exist');
    cy.get('[data-testid="experiment-timestamp"]').should('exist');
  });
  
  // Update the create experiment test to use the Now button

  // For the test that fails, update it to check for empty timestamp field first
  it('should create a new experiment with world line change value', () => {
    // Open the create experiment form
    cy.get('[data-testid="new-experiment-btn"]').click();
    
    // Verify form modal opened
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
    cy.get('[data-testid="experiment-form-title"]').should('contain.text', 'Create New Experiment');
    
    // Verify timestamp field is initially empty
    cy.get('#experiment-timestamp').should('have.value', '');
    
    // Fill out the form
    const experimentName = `Test Experiment ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('This is a test experiment created by Cypress');
    cy.get('#experiment-status').select('in_progress');
    cy.get('#experiment-creator').clear().type('Cypress Tester');
    cy.get('#experiment-collaborators').type('Okabe, Daru, Kurisu');
    cy.get('#experiment-results').type('Preliminary results look promising');
    
    // Add world line change value
    cy.get('#experiment-world-line-change').clear().type('0.337192');
    
    // Use the "Now" button to set the timestamp
    cy.contains('button', 'Now').click();
    
    // Verify a timestamp was set in ISO format (without checking exact value)
    cy.get('#experiment-timestamp')
      .should('not.have.value', '')
      .invoke('val')
      .should('match', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    
    // Submit the form
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment created successfully');
    
    // Verify the new experiment appears in the table
    cy.get('[data-testid="experiments-table"]').should('contain.text', experimentName);
    cy.get('[data-testid="experiments-table"]').should('contain.text', 'Cypress Tester');
    
    // Verify the world line change appears correctly
    cy.contains('tr', experimentName).within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '0.337192');
      cy.get('[data-testid="experiment-timestamp"]').should('not.contain.text', 'Unknown');
    });
  });

  // Add a test for timestamp validation
  it('should validate ISO format for timestamps', () => {
    // Open the create experiment form
    cy.get('[data-testid="new-experiment-btn"]').click();
    
    // Verify timestamp is initially empty
    cy.get('#experiment-timestamp').should('have.value', '');
    
    // Fill required fields
    cy.get('#experiment-name').type('Validation Test');
    cy.get('#experiment-description').type('Testing timestamp validation');
    
    // Enter an invalid timestamp
    cy.get('#experiment-timestamp').clear().type('2025-04-07 12:34:56');
    
    // Try to submit - should not work due to validation
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Form should still be open
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
    
    // Should show validation error
    cy.contains('Please enter a valid ISO date').should('be.visible');
    
    // Fix the timestamp with a valid ISO format
    cy.get('#experiment-timestamp').clear().type('2025-04-07T12:34:56Z');
    
    // Submit again
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Should succeed
    cy.get('.notyf__toast--success').should('be.visible');
  });

  // Test that timestamp can't be edited
  it('should disable timestamp field in edit mode', () => {
    // Create an experiment first
    cy.get('[data-testid="new-experiment-btn"]').click();
    const experimentName = `Timestamp Test ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('Testing timestamp field in edit mode');
    
    // Use Now button to set timestamp
    cy.contains('button', 'Now').click();
    
    // Submit to create the experiment
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Wait for creation success
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment created successfully');
    
    // Find and edit the experiment
    cy.contains('tr', experimentName).within(() => {
      cy.get('button').contains('Edit').click();
    });
    
    // Verify timestamp field is disabled
    cy.get('#experiment-timestamp').should('be.disabled');
    
    // Now button should not be present
    cy.contains('button', 'Now').should('not.exist');
  });
  
  it('should update an existing experiment with new world line change value', () => {
    // Create an experiment first
    cy.get('[data-testid="new-experiment-btn"]').click();
    const experimentName = `Experiment to Update ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('This experiment will be updated');
    cy.get('#experiment-creator').clear().type('Original Creator');
    cy.get('#experiment-world-line-change').clear().type('0.571024');
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Wait for success notification and verify experiment was created
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment created successfully');
    cy.get('[data-testid="experiments-table"]').should('contain.text', experimentName);
    
    // Find and click edit button for the experiment we just created
    cy.contains('tr', experimentName).within(() => {
      cy.get('button').contains('Edit').click();
    });
    
    // Verify edit form opened
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
    cy.get('[data-testid="experiment-form-title"]').should('contain.text', 'Edit Experiment');
    
    // Update the experiment
    const updatedName = `${experimentName} - UPDATED`;
    cy.get('#experiment-name').clear().type(updatedName);
    cy.get('#experiment-status').select('completed');
    cy.get('#experiment-results').clear().type('Experiment successful!');
    
    // Update world line change
    cy.get('#experiment-world-line-change').clear().type('1.048596');
    
    // Verify timestamp field is disabled in edit mode
    cy.get('#experiment-timestamp').should('be.disabled');
    
    // Submit the form
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment updated successfully');
    
    // Verify the experiment was updated in the table
    cy.get('[data-testid="experiments-table"]').should('contain.text', updatedName);
    cy.contains('tr', updatedName).should('contain.text', 'completed');
    
    // Verify the world line change was updated
    cy.contains('tr', updatedName).within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '1.048596');
    });
  });
  
  it('should delete an experiment', () => {
    // Create an experiment first
    cy.get('[data-testid="new-experiment-btn"]').click();
    const experimentName = `Experiment to Delete ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('This experiment will be deleted');
    cy.get('#experiment-creator').clear().type('Delete Test');
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Wait for success notification and verify experiment was created
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment created successfully');
    cy.get('[data-testid="experiments-table"]').should('contain.text', experimentName);
    
    // Find and click delete button for the experiment we just created
    cy.contains('tr', experimentName).within(() => {
      cy.get('button').contains('Delete').click();
    });
    
    // Verify delete confirmation modal opened
    cy.get('[data-testid="delete-confirmation-modal"]').should('be.visible');
    cy.get('[data-testid="delete-experiment-name"]').should('contain.text', experimentName);
    
    // Confirm deletion
    cy.get('[data-testid="confirm-delete-btn"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment deleted successfully');
    
    // Verify the experiment was removed from the table
    cy.get('[data-testid="experiments-table"]').should('not.contain.text', experimentName);
  });
  
  it('should handle reload button correctly', () => {
    // Use a simple intercept with inline data instead of a fixture
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      delay: 500, // Add a 500ms delay
      body: [
        {
          "id": "EXP-001",
          "name": "Phone Microwave",
          "description": "Send messages to the past",
          "status": "completed",
          "creator_id": "Okabe",
          "collaborators": ["Kurisu", "Daru"],
          "world_line_change": 0.337192,
          "timestamp": new Date().toISOString()
        },
        {
          "id": "EXP-002",
          "name": "Divergence Meter",
          "description": "Measures worldline divergence",
          "status": "in_progress",
          "creator_id": "Kurisu", 
          "world_line_change": 0.571024,
          "timestamp": new Date().toISOString()
        }
      ]
    }).as('experimentsReload');
    
    // Click reload button
    cy.get('[data-testid="reload-experiments-btn"]').click();
    
    // Wait for the API call to complete
    cy.wait('@experimentsReload');
    
    // Verify success toast appears after reload completes
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Experiments loaded successfully');
    
    // Verify the world line change values are displayed
    cy.get('[data-testid="experiment-worldline"]').first().should('contain.text', '0.337192');
  });
  
  it('should handle error scenarios gracefully', () => {
    // Intercept the API call and force an error
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 500,
      body: { error: 'Server Error' }
    }).as('experimentLoadError');
    
    // Click reload button to trigger the intercepted request
    cy.get('[data-testid="reload-experiments-btn"]').click();
    
    // Wait for the failed request
    cy.wait('@experimentLoadError');
    
    // Verify error toast appears
    cy.get('.notyf__toast--error').should('be.visible');
    cy.get('.notyf__toast--error').should('contain.text', 'Failed to load experiments');
    
    // Verify error state in the UI
    cy.get('[data-testid="experiments-error"]').should('be.visible');
  });
  
  it('should show empty state when no experiments exist', () => {
    // Intercept the API call and return empty array
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      statusCode: 200,
      body: []
    }).as('emptyExperiments');
    
    // Click reload button to trigger the intercepted request
    cy.get('[data-testid="reload-experiments-btn"]').click();
    
    // Wait for the request
    cy.wait('@emptyExperiments');
    
    // Verify empty state appears
    cy.get('[data-testid="no-experiments"]').should('be.visible');
    cy.get('[data-testid="no-experiments"]').should('contain.text', 'No experiments found');
    cy.get('[data-testid="create-first-experiment-btn"]').should('be.visible');
    
    // Test the "Create your first experiment" button
    cy.get('[data-testid="create-first-experiment-btn"]').click();
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
  });
  
  // Removed the navigation test between Future Gadget Lab pages since they no longer exist
});