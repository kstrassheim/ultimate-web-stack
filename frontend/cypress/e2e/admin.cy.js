import { setMockRole } from '../support/msalMock';

describe('Authenticated Admin Flow', () => {
  beforeEach(() => {
    // Set up admin role before each test
    cy.setMockRole('Admin');
    // Visit the home page
    cy.visit('/');
  });
  
  it('should log in and access admin page through bootstrap navigation', () => {
    // Find and click the sign-in button in the unauthenticated template
    cy.get('[data-testid="unauthenticated-container"]')
      .should('be.visible')
      .within(() => {
        cy.get('[data-testid="sign-in-button"]').click();
      });
    
    // Verify we're logged in by checking for authenticated elements
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    
    // Test the Bootstrap navigation component
    cy.get('[data-testid="main-navigation"]').should('be.visible');
    
    // Navigate to the admin page using the Bootstrap navbar
    cy.get('[data-testid="nav-admin"]').click();
    
    // Verify we're on the admin page (not access denied)
    cy.get('[data-testid="admin-heading"]').should('be.visible');
    
    // Check if loading overlay exists first, and only then wait for it to disappear
    cy.get('body').then($body => {
      if ($body.find('[data-testid="loading-overlay"]').length > 0) {
        cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
      }
    });
    
    // Verify Notyf toast notification appeared
    cy.get('.notyf').should('exist');
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Data reloaded successfully');
    
    // Verify admin data is loaded
    cy.get('[data-testid="admin-data-message"]')
      .should('be.visible')
      .and('not.contain', 'No data available');
    
    // Make sure we're not on the access denied page
    cy.get('[data-testid="access-denied-page"]').should('not.exist');
  });
  
  it('tests the reload button and toast notifications', () => {
    cy.setMockRole('Admin');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-admin"]').click();
    
    // Ensure Admin page is visible first
    cy.get('[data-testid="admin-heading"]', { timeout: 10000 }).should('be.visible');

    // Now the reload button should appear
    cy.get('[data-testid="admin-reload-button"]', { timeout: 10000 })
      .should('contain.text', 'Reload Data')
      .should('not.be.disabled');
  });
  
  it('shows error toast when API fails', () => {
    // Quick login
    cy.get('[data-testid="sign-in-button"]').click();
    
    // Intercept the admin API call and force an error
    cy.intercept('POST', '/api/admin-data', {
      statusCode: 500,
      body: { error: 'Server Error' }
    }).as('adminDataError');
    
    // Navigate to admin page
    cy.get('[data-testid="nav-admin"]').click();
    
    // Wait for the failed request
    cy.wait('@adminDataError');
    
    // Verify error toast appears
    cy.get('.notyf__toast--error').should('be.visible');
    cy.get('.notyf__toast--error').should('contain.text', 'Failed to load data');
    
    // Verify error state in the UI
    cy.get('[data-testid="admin-error"]').should('be.visible');
  });
});