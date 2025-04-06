import { setMockRole } from '../support/msalMock';

describe('Future Gadget Lab - D-Mail System CRUD Operations', () => {
  beforeEach(() => {
    // Set up admin role before each test
    cy.setMockRole('Admin');
    // Visit the home page
    cy.visit('/');
    // Sign in
    cy.get('[data-testid="sign-in-button"]').click();
    // Navigate to D-Mails page through dropdown
    cy.get('[data-testid="nav-future-gadget"]').click();
    cy.get('[data-testid="nav-dmails"]').click();
    // Verify we're on the D-Mails page
    cy.get('[data-testid="dmails-heading"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="dmails-heading"]').should('contain.text', 'D-Mail System');
  });
  
  it('should load and display existing D-Mails', () => {
    // Wait for D-Mails to load
    cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
    
    // Verify D-Mails table exists and has data
    cy.get('[data-testid="dmails-table"]').should('be.visible');
    cy.get('[data-testid="dmails-card-header"]').should('contain.text', 'All D-Mails');
    
    // Check for toast notification
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mails loaded successfully');
    
    // Verify WebSocket connection status
    cy.get('[data-testid="connection-status"]').should('be.visible');
    cy.get('[data-testid="status-badge"]').should('contain.text', 'Connected');
  });
  
  it('should create a new D-Mail', () => {
    // Open the create D-Mail form
    cy.get('[data-testid="new-dmail-btn"]').click();
    
    // Verify form modal opened
    cy.get('[data-testid="dmail-form-modal"]').should('be.visible');
    cy.get('[data-testid="dmail-form-title"]').should('contain.text', 'Send New D-Mail');
    
    // Fill out the form
    const subject = `Test D-Mail ${Date.now()}`;
    cy.get('#dmail-subject').type(subject);
    cy.get('#dmail-content').type('This is a test D-Mail created by Cypress');
    cy.get('#dmail-sender').clear().type('Cypress Tester');
    cy.get('#dmail-recipient').type('past-self@future-gadget-lab.org');
    cy.get('#dmail-origin').clear().type('1.130205');
    cy.get('#dmail-destination').type('1.048596');
    cy.get('#dmail-divergence').clear().type('0.081609');
    cy.get('#dmail-status').select('sent');
    
    // Submit the form
    cy.get('[data-testid="dmail-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mail sent successfully');
    
    // Verify the new D-Mail appears in the table
    cy.get('[data-testid="dmails-table"]').should('contain.text', subject);
    cy.get('[data-testid="dmails-table"]').should('contain.text', 'Cypress Tester');
  });
  
  it('should update an existing D-Mail', () => {
    // Create a D-Mail first
    cy.get('[data-testid="new-dmail-btn"]').click();
    const subject = `D-Mail to Update ${Date.now()}`;
    cy.get('#dmail-subject').type(subject);
    cy.get('#dmail-content').type('This D-Mail will be updated');
    cy.get('#dmail-sender').clear().type('Original Sender');
    cy.get('#dmail-recipient').type('someone@example.com');
    cy.get('#dmail-origin').clear().type('1.130205');
    cy.get('[data-testid="dmail-form-submit"]').click();
    
    // Wait for success notification and verify D-Mail was created
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mail sent successfully');
    cy.get('[data-testid="dmails-table"]').should('contain.text', subject);
    
    // Find and click edit button for the D-Mail we just created
    cy.contains('tr', subject).within(() => {
      cy.get('button').contains('View/Edit').click();
    });
    
    // Verify edit form opened
    cy.get('[data-testid="dmail-form-modal"]').should('be.visible');
    cy.get('[data-testid="dmail-form-title"]').should('contain.text', 'View/Edit D-Mail');
    
    // Update the D-Mail
    const updatedSubject = `${subject} - UPDATED`;
    cy.get('#dmail-subject').clear().type(updatedSubject);
    cy.get('#dmail-status').select('received');
    cy.get('#dmail-content').clear().type('This D-Mail has been updated by Cypress test');
    
    // Submit the form
    cy.get('[data-testid="dmail-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mail updated successfully');
    
    // Verify the D-Mail was updated in the table
    cy.get('[data-testid="dmails-table"]').should('contain.text', updatedSubject);
    cy.contains('tr', updatedSubject).should('contain.text', 'received');
  });
  
  it('should delete a D-Mail', () => {
    // Create a D-Mail first
    cy.get('[data-testid="new-dmail-btn"]').click();
    const subject = `D-Mail to Delete ${Date.now()}`;
    cy.get('#dmail-subject').type(subject);
    cy.get('#dmail-content').type('This D-Mail will be deleted');
    cy.get('#dmail-sender').clear().type('Delete Test');
    cy.get('#dmail-recipient').type('somebody@example.com');
    cy.get('#dmail-origin').clear().type('1.130205');
    cy.get('[data-testid="dmail-form-submit"]').click();
    
    // Wait for success notification and verify D-Mail was created
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mail sent successfully');
    cy.get('[data-testid="dmails-table"]').should('contain.text', subject);
    
    // Find and click delete button for the D-Mail we just created
    cy.contains('tr', subject).within(() => {
      cy.get('button').contains('Delete').click();
    });
    
    // Verify delete confirmation modal opened
    cy.get('[data-testid="delete-confirmation-modal"]').should('be.visible');
    cy.get('[data-testid="delete-dmail-subject"]').should('contain.text', subject);
    
    // Confirm deletion
    cy.get('[data-testid="confirm-delete-btn"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mail deleted successfully');
    
    // Verify the D-Mail was removed from the table
    cy.get('[data-testid="dmails-table"]').should('not.contain.text', subject);
  });
  
  it('should handle reload button correctly', () => {
    // Intercept the API call and delay response
    cy.intercept('GET', '**/future-gadget-lab/d-mails', {
      delay: 500, // Add a 500ms delay
      body: [
        {
          "id": "DM-001",
          "subject": "Lottery Numbers",
          "content": "Buy ticket with numbers 03, 07, 10, 26, 41, 42",
          "sender": "okabe.rintaro@future-gadget-lab.org",
          "recipient": "past-self@future-gadget-lab.org",
          "worldLineOrigin": "1.130426",
          "worldLineDestination": "1.048596",
          "divergence": 0.081830,
          "status": "sent"
        },
        {
          "id": "DM-002",
          "subject": "IBN 5100 Location",
          "content": "Check Yanabayashi Shrine for the IBN 5100",
          "sender": "suzuha.amane@future-gadget-lab.org",
          "recipient": "okabe.rintaro@future-gadget-lab.org",
          "worldLineOrigin": "1.130205",
          "worldLineDestination": "1.130426",
          "divergence": 0.000221,
          "status": "received"
        }
      ]
    }).as('dmailsReload');
    
    // Click reload button
    cy.get('[data-testid="reload-dmails-btn"]').click();
    
    // Wait for the API call to complete
    cy.wait('@dmailsReload');
    
    // Verify success toast appears
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'D-Mails loaded successfully');
  });
  
  it('should handle error scenarios gracefully', () => {
    // Intercept the API call and force an error
    cy.intercept('GET', '**/future-gadget-lab/d-mails', {
      statusCode: 500,
      body: { error: 'Server Error' }
    }).as('dmailLoadError');
    
    // Click reload button to trigger the intercepted request
    cy.get('[data-testid="reload-dmails-btn"]').click();
    
    // Wait for the failed request
    cy.wait('@dmailLoadError');
    
    // Verify error toast appears
    cy.get('.notyf__toast--error').should('be.visible');
    cy.get('.notyf__toast--error').should('contain.text', 'Failed to load D-Mails');
    
    // Verify error state in the UI
    cy.get('[data-testid="dmails-error"]').should('be.visible');
  });
  
  it('should show empty state when no D-Mails exist', () => {
    // Intercept the API call and return empty array
    cy.intercept('GET', '**/future-gadget-lab/d-mails', {
      statusCode: 200,
      body: []
    }).as('emptyDMails');
    
    // Click reload button to trigger the intercepted request
    cy.get('[data-testid="reload-dmails-btn"]').click();
    
    // Wait for the request
    cy.wait('@emptyDMails');
    
    // Verify empty state appears
    cy.get('[data-testid="no-dmails"]').should('be.visible');
    cy.get('[data-testid="no-dmails"]').should('contain.text', 'No D-Mails found');
    cy.get('[data-testid="send-first-dmail-btn"]').should('be.visible');
    
    // Test the "Send your first D-Mail" button
    cy.get('[data-testid="send-first-dmail-btn"]').click();
    cy.get('[data-testid="dmail-form-modal"]').should('be.visible');
  });
  
  it('should navigate between Future Gadget Lab pages', () => {
    // Navigate to Experiments page
    cy.get('[data-testid="nav-future-gadget"]').click();
    cy.get('[data-testid="nav-experiments"]').click();
    cy.get('[data-testid="experiments-heading"]').should('be.visible');
    
    // Navigate back to D-Mails page
    cy.get('[data-testid="nav-future-gadget"]').click();
    cy.get('[data-testid="nav-dmails"]').click();
    cy.get('[data-testid="dmails-heading"]').should('be.visible');
    
    // Navigate to Admin page
    cy.get('[data-testid="nav-future-gadget"]').click();
    cy.get('[data-testid="nav-admin"]').click();
    cy.get('[data-testid="admin-heading"]').should('be.visible');
  });
  
  it('should validate form data before submission', () => {
    // Open the create form
    cy.get('[data-testid="new-dmail-btn"]').click();
    
    // Try to submit the form without filling required fields
    cy.get('[data-testid="dmail-form-submit"]').click();
    
    // Check for validation messages
    cy.get('.invalid-feedback').should('be.visible');
    cy.get('form').contains('Please provide a subject');
    cy.get('form').contains('Please provide a sender');
    cy.get('form').contains('Please provide a recipient');
    cy.get('form').contains('Please provide message content');
    cy.get('form').contains('Please provide a worldline origin');
    
    // Verify the form wasn't submitted (modal still visible)
    cy.get('[data-testid="dmail-form-modal"]').should('be.visible');
  });
  
  it('should display different status badges with correct colors', () => {
    // Intercept the API call to inject D-Mails with different statuses
    cy.intercept('GET', '**/future-gadget-lab/d-mails', {
      statusCode: 200,
      body: [
        {
          "id": "DM-001",
          "subject": "Draft D-Mail",
          "sender": "test@example.com",
          "recipient": "test@example.com",
          "status": "draft"
        },
        {
          "id": "DM-002",
          "subject": "Sending D-Mail",
          "sender": "test@example.com",
          "recipient": "test@example.com",
          "status": "sending"
        },
        {
          "id": "DM-003",
          "subject": "Sent D-Mail",
          "sender": "test@example.com",
          "recipient": "test@example.com",
          "status": "sent"
        },
        {
          "id": "DM-004",
          "subject": "Received D-Mail",
          "sender": "test@example.com",
          "recipient": "test@example.com",
          "status": "received"
        },
        {
          "id": "DM-005",
          "subject": "Failed D-Mail",
          "sender": "test@example.com",
          "recipient": "test@example.com",
          "status": "failed"
        }
      ]
    }).as('statusDMails');
    
    // Click reload to get our intercepted response
    cy.get('[data-testid="reload-dmails-btn"]').click();
    cy.wait('@statusDMails');
    
    // Check each status badge has the right color class
    cy.contains('tr', 'Draft D-Mail').find('[data-testid="dmail-status"]')
      .should('have.class', 'bg-secondary');
      
    cy.contains('tr', 'Sending D-Mail').find('[data-testid="dmail-status"]')
      .should('have.class', 'bg-info');
      
    cy.contains('tr', 'Sent D-Mail').find('[data-testid="dmail-status"]')
      .should('have.class', 'bg-primary');
      
    cy.contains('tr', 'Received D-Mail').find('[data-testid="dmail-status"]')
      .should('have.class', 'bg-success');
      
    cy.contains('tr', 'Failed D-Mail').find('[data-testid="dmail-status"]')
      .should('have.class', 'bg-danger');
  });
});