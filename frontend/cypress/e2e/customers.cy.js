import { setMockRole } from '../support/msalMock';

describe('Customers - CRUD Operations', () => {
  beforeEach(() => {
    // Set up admin role before each test
    cy.setMockRole('Admin');
    // Visit the home page
    cy.visit('/');
    // Sign in
    cy.get('[data-testid="sign-in-button"]').click();
    // Navigate to Customers page
    cy.get('[data-testid="nav-customers"]').click();
    // Verify we're on the customers page
    cy.contains('h2', 'Customers', { timeout: 10000 }).should('be.visible');
  });
  
  it('should load and display the customers page', () => {
    // Verify customers table exists
    cy.get('[data-testid="customers-table"]').should('be.visible');
    
    // Verify action buttons exist
    cy.get('[data-testid="new-customer-btn"]').should('be.visible');
    cy.contains('button', 'Reload').should('be.visible');
  });
  
  it('should create a new customer', () => {
    // Open the create customer form
    cy.get('[data-testid="new-customer-btn"]').click();
    
    // Verify form modal opened
    cy.get('[data-testid="customer-form-modal"]').should('be.visible');
    cy.get('[data-testid="customer-form-title"]').should('contain.text', 'New Customer');
    
    // Fill out the form
    const customerName = `Test Customer ${Date.now()}`;
    const customerEmail = `test${Date.now()}@example.com`;
    cy.get('#customer-name').type(customerName);
    cy.get('#customer-email').type(customerEmail);
    cy.get('#customer-phone').type('+1234567890');
    cy.get('#customer-address').type('123 Test Street, Test City, TC 12345');
    
    // Submit the form
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Customer created successfully');
    
    // Verify the new customer appears in the table
    cy.get('[data-testid="customers-table"]').should('contain.text', customerName);
    cy.get('[data-testid="customers-table"]').should('contain.text', customerEmail);
  });
  
  it('should create a customer with only required fields', () => {
    // Open the create customer form
    cy.get('[data-testid="new-customer-btn"]').click();
    
    // Fill only required fields
    const customerName = `Min Customer ${Date.now()}`;
    const customerEmail = `min${Date.now()}@example.com`;
    cy.get('#customer-name').type(customerName);
    cy.get('#customer-email').type(customerEmail);
    
    // Submit the form
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    
    // Verify the new customer appears in the table
    cy.get('[data-testid="customers-table"]').should('contain.text', customerName);
  });
  
  it('should validate required fields', () => {
    // Open the create customer form
    cy.get('[data-testid="new-customer-btn"]').click();
    
    // Try to submit without filling required fields
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Form should not submit (modal should still be visible)
    cy.get('[data-testid="customer-form-modal"]').should('be.visible');
    
    // No success message should appear
    cy.get('.notyf__toast--success').should('not.exist');
  });
  
  it('should validate email format', () => {
    // Open the create customer form
    cy.get('[data-testid="new-customer-btn"]').click();
    
    // Fill with invalid email
    cy.get('#customer-name').type('Test Customer');
    cy.get('#customer-email').type('invalid-email');
    
    // Try to submit
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Form should show validation error
    cy.get('[data-testid="customer-form-modal"]').should('be.visible');
  });
  
  it('should edit an existing customer', () => {
    // First create a customer
    cy.get('[data-testid="new-customer-btn"]').click();
    const originalName = `Original Customer ${Date.now()}`;
    const originalEmail = `original${Date.now()}@example.com`;
    cy.get('#customer-name').type(originalName);
    cy.get('#customer-email').type(originalEmail);
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Wait for success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    
    // Find and click edit button for this customer
    cy.contains('tr', originalName).within(() => {
      cy.contains('button', 'Edit').click();
    });
    
    // Verify edit form opened
    cy.get('[data-testid="customer-form-modal"]').should('be.visible');
    cy.get('[data-testid="customer-form-title"]').should('contain.text', 'Edit Customer');
    
    // Update the customer
    const updatedName = `${originalName} - UPDATED`;
    cy.get('#customer-name').clear().type(updatedName);
    cy.get('#customer-phone').clear().type('+9876543210');
    
    // Submit the form
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Customer updated successfully');
    
    // Verify the customer was updated in the table
    cy.get('[data-testid="customers-table"]').should('contain.text', updatedName);
    cy.get('[data-testid="customers-table"]').should('contain.text', '+9876543210');
  });
  
  it('should delete a customer', () => {
    // First create a customer
    cy.get('[data-testid="new-customer-btn"]').click();
    const customerName = `To Delete ${Date.now()}`;
    const customerEmail = `delete${Date.now()}@example.com`;
    cy.get('#customer-name').type(customerName);
    cy.get('#customer-email').type(customerEmail);
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Wait for success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    
    // Find and click delete button for this customer
    cy.contains('tr', customerName).within(() => {
      cy.contains('button', 'Delete').click();
    });
    
    // Verify delete confirmation modal
    cy.contains('Confirm Delete').should('be.visible');
    cy.get('[data-testid="delete-customer-name"]').should('contain.text', customerName);
    
    // Confirm deletion
    cy.get('[data-testid="confirm-delete-btn"]').click();
    
    // Verify success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Customer deleted successfully');
    
    // Verify customer is removed from table
    cy.get('[data-testid="customers-table"]').should('not.contain.text', customerName);
  });
  
  it('should cancel delete when clicking cancel button', () => {
    // First create a customer
    cy.get('[data-testid="new-customer-btn"]').click();
    const customerName = `Not To Delete ${Date.now()}`;
    const customerEmail = `nodelete${Date.now()}@example.com`;
    cy.get('#customer-name').type(customerName);
    cy.get('#customer-email').type(customerEmail);
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Wait for success message
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    
    // Find and click delete button for this customer
    cy.contains('tr', customerName).within(() => {
      cy.contains('button', 'Delete').click();
    });
    
    // Verify delete confirmation modal
    cy.contains('Confirm Delete').should('be.visible');
    
    // Cancel deletion
    cy.get('[data-testid="cancel-delete-btn"]').click();
    
    // Verify customer still exists in table
    cy.get('[data-testid="customers-table"]').should('contain.text', customerName);
  });
  
  it('should reload customers when reload button is clicked', () => {
    // Click reload button
    cy.contains('button', 'Reload').click();
    
    // Verify customers table is still visible
    cy.get('[data-testid="customers-table"]').should('be.visible');
  });
  
  it('should handle empty customer list', () => {
    // Check if either the table exists OR the "no customers" message is shown
    // This handles both cases: empty list and list with data
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="customers-table"]').length > 0) {
        // Table exists, meaning there are customers
        cy.get('[data-testid="customers-table"]').should('be.visible');
      } else {
        // No table, should show the empty state message
        cy.contains('No customers found. Create your first customer!').should('be.visible');
      }
    });
  });
  
  it('should close form modal when close button is clicked', () => {
    // Open the create customer form
    cy.get('[data-testid="new-customer-btn"]').click();
    
    // Verify form modal opened
    cy.get('[data-testid="customer-form-modal"]').should('be.visible');
    
    // Close the modal
    cy.get('[data-testid="customer-form-modal"]').within(() => {
      cy.get('.btn-close').click();
    });
    
    // Verify modal is closed
    cy.get('[data-testid="customer-form-modal"]').should('not.exist');
  });
  
  it('should display all customer fields in the table', () => {
    // Create a customer with all fields
    cy.get('[data-testid="new-customer-btn"]').click();
    const customerName = `Full Customer ${Date.now()}`;
    const customerEmail = `full${Date.now()}@example.com`;
    const phone = '+1234567890';
    const address = '123 Full Street';
    
    cy.get('#customer-name').type(customerName);
    cy.get('#customer-email').type(customerEmail);
    cy.get('#customer-phone').type(phone);
    cy.get('#customer-address').type(address);
    cy.get('[data-testid="customer-form-submit"]').click();
    
    // Wait for success
    cy.get('.notyf__toast--success', { timeout: 10000 }).should('be.visible');
    
    // Verify all fields are displayed in the table
    cy.contains('tr', customerName).within(() => {
      cy.should('contain.text', customerName);
      cy.should('contain.text', customerEmail);
      cy.should('contain.text', phone);
      cy.should('contain.text', address);
    });
  });
});
