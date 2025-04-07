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
    // Wait for experiments to load without requiring toast
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
    
    // Verify experiments table exists and has data
    cy.get('[data-testid="experiments-table"]').should('be.visible');
    cy.get('[data-testid="experiments-card-header"]').should('contain.text', 'All Experiments');
    
    // Verify WebSocket connection status
    cy.get('[data-testid="connection-status"]').should('be.visible');
    cy.get('[data-testid="status-badge"]').should('contain.text', 'Connected');
    
    // Verify columns exist but note they might be hidden on small screens
    cy.get('th').contains('World Line Change').should('exist');
    cy.get('th').contains('Timestamp').should('exist');
    
    // Check for responsive classes on columns
    cy.get('th.d-none.d-lg-table-cell').contains('World Line Change');
    cy.get('th.d-none.d-sm-table-cell').contains('Timestamp');
    
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

  // Add this test after the other experiments tests

  it('should properly display and handle negative world line changes', () => {
    // Open the create experiment form
    cy.get('[data-testid="new-experiment-btn"]').click();
    
    // Fill out the form with a negative world line change
    const experimentName = `Negative World Line ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('Testing negative world line divergence values');
    cy.get('#experiment-status').select('completed');
    cy.get('#experiment-creator').clear().type('Okabe Rintaro');
    cy.get('#experiment-results').type('Successfully undid effects of previous D-Mails');
    
    // Add negative world line change value
    cy.get('#experiment-world-line-change').clear().type('-0.412591');
    
    // Use the "Now" button to set the timestamp
    cy.contains('button', 'Now').click();
    
    // Submit the form
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment created successfully');
    
    // Verify the new experiment appears in the table with the negative value
    cy.get('[data-testid="experiments-table"]').should('contain.text', experimentName);
    
    // Verify the negative world line change appears correctly with minus sign
    cy.contains('tr', experimentName).within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '-0.412591');
    });
    
    // Edit the experiment to test updating negative values
    cy.contains('tr', experimentName).within(() => {
      cy.get('button').contains('Edit').click();
    });
    
    // Update to another negative value
    cy.get('#experiment-world-line-change').clear().type('-0.275349');
    
    // Submit the update
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Verify update success
    cy.get('.notyf__toast--success').should('contain.text', 'Experiment updated successfully');
    
    // Verify the updated negative value appears correctly
    cy.contains('tr', experimentName).within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '-0.275349');
    });
  });

  // Add a test to verify that positive values show a + sign
  it('should display positive world line changes with a plus sign', () => {
    // Use an intercept to ensure control over the exact data shown
    cy.intercept('GET', '**/future-gadget-lab/lab-experiments', {
      body: [
        {
          "id": "EXP-POSITIVE",
          "name": "Positive World Line Change",
          "description": "Testing positive formatting",
          "status": "completed",
          "creator_id": "Kurisu",
          "world_line_change": 0.337192,
          "timestamp": new Date().toISOString()
        },
        {
          "id": "EXP-NEGATIVE",
          "name": "Negative World Line Change",
          "description": "Testing negative formatting",
          "status": "completed",
          "creator_id": "Okabe",
          "world_line_change": -0.412591,
          "timestamp": new Date().toISOString()
        },
        {
          "id": "EXP-ZERO",
          "name": "Zero World Line Change",
          "description": "Testing zero formatting",
          "status": "completed",
          "creator_id": "Daru",
          "world_line_change": 0,
          "timestamp": new Date().toISOString()
        }
      ]
    }).as('formattedExperiments');
    
    // Click reload button
    cy.get('[data-testid="reload-experiments-btn"]').click();
    
    // Wait for the intercepted request
    cy.wait('@formattedExperiments');
    
    // Verify positive value has + prefix
    cy.contains('tr', 'Positive World Line Change').within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '+0.337192');
    });
    
    // Verify negative value has - prefix
    cy.contains('tr', 'Negative World Line Change').within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '-0.412591');
    });
    
    // Verify zero is shown with + sign
    cy.contains('tr', 'Zero World Line Change').within(() => {
      cy.get('[data-testid="experiment-worldline"]').should('contain.text', '+0.000000');
    });
  });

  // Fix the responsive layout test by ensuring experiments are loaded first

  it('should handle responsive column display correctly', () => {
    // Start with a base viewport size first
    cy.viewport(1200, 800);
    
    // Wait for the initial page to load fully
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
    cy.get('[data-testid="experiments-table"]').should('exist');
    
    // Now test desktop viewport columns (already at desktop size)
    cy.get('table thead tr th:contains("Creator")').should('be.visible');
    cy.get('table thead tr th:contains("World Line Change")').should('be.visible');
    cy.get('table thead tr th:contains("Timestamp")').should('be.visible');
    cy.get('table thead tr th:contains("Description")').should('be.visible');
    
    // Test at tablet viewport - switch viewport and wait
    cy.viewport(768, 1024);
    cy.wait(1000); // Give time for responsive layout to adjust
    
    // Verify which columns are visible/hidden at tablet size
    cy.get('table thead tr th:contains("Timestamp")').should('be.visible');
    cy.get('table thead tr th:contains("Description")').should('be.visible');
    // Use .should with function to check if element exists but is not visible
    cy.get('table thead tr').should(($row) => {
      const text = $row.text();
      expect(text).to.include('Creator');
      expect(text).to.include('World Line Change');
    });
    cy.get('table thead tr th:contains("Creator")').should('not.be.visible');
    cy.get('table thead tr th:contains("World Line Change")').should('not.be.visible');
    
    // Test at mobile viewport
    cy.viewport(375, 667);
    cy.wait(1000); // Give time for responsive layout to adjust
    
    // Verify most columns are hidden on mobile
    cy.get('table thead tr th:contains("Name")').should('be.visible');
    cy.get('table thead tr th:contains("Status")').should('be.visible');
    cy.get('table thead tr th:contains("Actions")').should('be.visible');
    // Check that columns exist in DOM but are not visible
    cy.get('table thead tr').should(($row) => {
      const text = $row.text();
      expect(text).to.include('Description');
      expect(text).to.include('Timestamp');
      expect(text).to.include('Creator');
      expect(text).to.include('World Line Change');
    });
    cy.get('table thead tr th:contains("Description")').should('not.be.visible');
    cy.get('table thead tr th:contains("Timestamp")').should('not.be.visible');
    cy.get('table thead tr th:contains("Creator")').should('not.be.visible');
    cy.get('table thead tr th:contains("World Line Change")').should('not.be.visible');
  });
});

// Add this test at the end of your existing test suite

describe('Future Gadget Lab - Real-time WebSocket Notifications', () => {
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
    
    // Now verify we're on the experiments page, not access denied
    cy.url().should('not.include', 'access-denied');
    
    // Wait for the experiments page to load
    cy.contains('h1', 'Future Gadget Lab Experiments', { timeout: 20000 }).should('be.visible');
    
    // Wait for loading overlay to disappear
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 15000 });
    
    // Wait for experiments table to be visible
    cy.get('[data-testid="experiments-table"]', { timeout: 10000 }).should('be.visible');
    
    // Ensure WebSocket is connected
    cy.get('[data-testid="status-badge"]', { timeout: 15000 })
      .should('be.visible')
      .should('contain.text', 'Connected');
      
    // Expose the WebSocket handler for our tests to use
    cy.window().then((win) => {
      // If we need to expose the handler to the window
      if (!win.experimentsSocketMessageHandler) {
        // Create a helper to ensure our tests can access the WebSocket handler
        const origWebSocketSend = win.WebSocket.prototype.send;
        win.WebSocket.prototype.send = function(data) {
          // Save the WebSocket instance for later use
          win.activeWebSocket = this;
          return origWebSocketSend.call(this, data);
        };
        
        // Expose the handler directly on the window for easy access in tests
        win.experimentsSocket = win.experimentsSocket || {};
        win.experimentsSocket.sendTestMessage = function(message) {
          // Create a MessageEvent-like object our handler will understand
          const event = new win.MessageEvent('message', {
            data: JSON.stringify(message)
          });
          
          // Find the handler and call it
          if (win.activeWebSocket && win.activeWebSocket.onmessage) {
            win.activeWebSocket.onmessage(event);
          } else {
            cy.log('WebSocket or handler not found');
          }
        };
      }
    });
  });
  
  it('should display WebSocket connection status', () => {
    // Check connection status is displayed
    cy.get('[data-testid="connection-status"]').should('be.visible');
    cy.get('[data-testid="status-badge"]').should('contain.text', 'Connected');
    cy.get('[data-testid="status-badge"]').should('have.class', 'bg-success');
  });
  
  it('should simulate receiving a WebSocket create message from another user', () => {
    // Mock WebSocket by intercepting WebSocket traffic and trigger a message
    cy.window().then((win) => {
      // Create a simulated WebSocket message for a new experiment
      const mockMessage = {
        type: 'create',
        id: 'EXP-WEBSOCKET-TEST',
        name: 'WebSocket Created Experiment',
        description: 'This experiment was created via WebSocket',
        status: 'planned',
        creator_id: 'Kurisu Makise',
        world_line_change: 0.571024,
        timestamp: new Date().toISOString(),
        actor: 'kurisu.makise@futuregadgetlab.org' // Different user than current
      };
      
      // Find the WebSocket handler and invoke it directly
      // This is a way to simulate incoming WebSocket messages
      if (win.experimentsSocketMessageHandler) {
        win.experimentsSocketMessageHandler(mockMessage);
      } else {
        // Expose message handler to window for testing purposes
        const originalFunc = win.WebSocket.prototype.addEventListener;
        win.WebSocket.prototype.addEventListener = function(type, listener) {
          if (type === 'message') {
            win.experimentsSocketMessageHandler = listener;
          }
          return originalFunc.call(this, type, listener);
        };
        
        // Force a WebSocket reconnect to use our patched addEventListener
        cy.get('[data-testid="reload-experiments-btn"]').click();
        cy.wait(1000); // Wait for WS to reconnect
        
        // Now try to send the message again if we have a handler
        if (win.experimentsSocketMessageHandler) {
          const event = { data: JSON.stringify(mockMessage) };
          win.experimentsSocketMessageHandler(event);
        }
      }
    });
    
    // Verify the experiment appears in the table after WebSocket message
    cy.contains('WebSocket Created Experiment').should('be.visible');
    
    // Verify notification appears
    cy.get('.notyf__toast--info').should('be.visible');
    cy.get('.notyf__toast--info').should('contain.text', 'New experiment "WebSocket Created Experiment" created by kurisu makise');
  });
  
  it('should simulate receiving a WebSocket update message', () => {
    // First, create an experiment to update
    cy.get('[data-testid="new-experiment-btn"]').click();
    const experimentName = `WS Update Test ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('This will be updated via WebSocket');
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Wait for experiment to be created
    cy.contains(experimentName).should('be.visible');
    
    // Get the experiment ID from the row
    cy.contains('tr', experimentName).invoke('attr', 'data-testid').then((testId) => {
      const experimentId = testId.replace('experiment-row-', '');
      
      // Now simulate receiving a WebSocket update message
      cy.window().then((win) => {
        const mockUpdateMessage = {
          type: 'update',
          id: experimentId,
          name: `${experimentName} (Updated)`,
          description: 'This was updated via WebSocket',
          status: 'completed',
          creator_id: 'Okabe Rintaro',
          world_line_change: 1.048596,
          timestamp: new Date().toISOString(),
          actor: 'okabe.rintaro@futuregadgetlab.org' // Different user
        };
        
        // Send the message through our exposed handler
        const event = { data: JSON.stringify(mockUpdateMessage) };
        if (win.experimentsSocketMessageHandler) {
          win.experimentsSocketMessageHandler(event);
        }
      });
      
      // Verify the experiment was updated in the table
      cy.contains(`${experimentName} (Updated)`).should('be.visible');
      
      // Verify notification appears
      cy.get('.notyf__toast--info').should('be.visible');
      cy.get('.notyf__toast--info').should('contain.text', `Experiment "${experimentName} (Updated)" updated by okabe rintaro`);
    });
  });
  
  it('should show warning when editing an experiment that is updated by another user', () => {
    // First, create an experiment
    cy.get('[data-testid="new-experiment-btn"]').click();
    const experimentName = `WS Edit Conflict ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('This will create an edit conflict');
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Wait for experiment to be created
    cy.contains(experimentName).should('be.visible');
    
    // Open the edit form
    cy.contains('tr', experimentName).within(() => {
      cy.get('button').contains('Edit').click();
    });
    
    // Verify edit form is open
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
    
    // Now simulate receiving a WebSocket update from another user
    cy.window().then((win) => {
      // Get the experiment ID
      cy.contains('tr', experimentName).invoke('attr', 'data-testid').then((testId) => {
        const experimentId = testId.replace('experiment-row-', '');
        
        const mockUpdateMessage = {
          type: 'update',
          id: experimentId,
          name: `${experimentName} (Updated by Someone Else)`,
          description: 'Another user updated this while you were editing',
          status: 'completed',
          creator_id: 'Kurisu Makise',
          world_line_change: 0.337192,
          timestamp: new Date().toISOString(),
          actor: 'kurisu.makise@futuregadgetlab.org'
        };
        
        // Send the message
        const event = { data: JSON.stringify(mockUpdateMessage) };
        if (win.experimentsSocketMessageHandler) {
          win.experimentsSocketMessageHandler(event);
        }
      });
    });
    
    // Verify warning notification appears about form being updated
    cy.get('.notyf__toast--warning').should('be.visible');
    cy.get('.notyf__toast--warning').should('contain.text', 'This experiment has been updated by kurisu makise');
    
    // Verify form data was updated with newest values
    cy.get('#experiment-name').should('have.value', `${experimentName} (Updated by Someone Else)`);
    cy.get('#experiment-description').should('have.value', 'Another user updated this while you were editing');
  });
  
  it('should close edit form and show warning when experiment being edited is deleted by another user', () => {
    // First, create an experiment
    cy.get('[data-testid="new-experiment-btn"]').click();
    const experimentName = `WS Delete While Editing ${Date.now()}`;
    cy.get('#experiment-name').type(experimentName);
    cy.get('#experiment-description').type('This will be deleted while editing');
    cy.get('[data-testid="experiment-form-submit"]').click();
    
    // Wait for experiment to be created
    cy.contains(experimentName).should('be.visible');
    
    // Open the edit form
    cy.contains('tr', experimentName).within(() => {
      cy.get('button').contains('Edit').click();
    });
    
    // Verify edit form is open
    cy.get('[data-testid="experiment-form-modal"]').should('be.visible');
    
    // Now simulate receiving a WebSocket delete message from another user
    cy.window().then((win) => {
      // Get the experiment ID
      cy.contains('tr', experimentName).invoke('attr', 'data-testid').then((testId) => {
        const experimentId = testId.replace('experiment-row-', '');
        
        const mockDeleteMessage = {
          type: 'delete',
          id: experimentId,
          name: experimentName,
          actor: 'okabe.rintaro@futuregadgetlab.org'
        };
        
        // Send the message
        const event = { data: JSON.stringify(mockDeleteMessage) };
        if (win.experimentsSocketMessageHandler) {
          win.experimentsSocketMessageHandler(event);
        }
      });
    });
    
    // Verify form is automatically closed
    cy.get('[data-testid="experiment-form-modal"]').should('not.exist');
    
    // Verify warning notification
    cy.get('.notyf__toast--warning').should('be.visible');
    cy.get('.notyf__toast--warning').should('contain.text', 'The experiment you were editing has been deleted by okabe rintaro');
    
    // Verify experiment is removed from the table
    cy.contains(experimentName).should('not.exist');
  });
});