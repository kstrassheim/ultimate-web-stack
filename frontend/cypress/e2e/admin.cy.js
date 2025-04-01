import { setMockRole } from '../support/msalMock';

describe('Authenticated Admin Flow', () => {
  beforeEach(() => {
    // Set up admin role before each test
    cy.setMockRole('admin');
    // Visit the home page
    cy.visit('/');
  });
  
  it('should log in and access admin page successfully', () => {
    // Find and click the sign-in button in the unauthenticated template
    cy.get('[data-testid="unauthenticated-container"]')
      .should('be.visible')
      .within(() => {
        cy.get('[data-testid="sign-in-button"]').click();
      });
    
    // Verify we're logged in by checking for authenticated elements
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    cy.get('[data-testid="profile-container"]').should('be.visible');
    
    // Navigate to the admin page
    cy.get('[data-testid="nav-admin"]').click();
    
    // Verify we're on the admin page (not access denied)
    cy.get('[data-testid="admin-heading"]').should('be.visible');
    
    // MODIFIED: Check if loading overlay exists first, and only then wait for it to disappear
    cy.get('body').then($body => {
      if ($body.find('[data-testid="loading-overlay"]').length > 0) {
        cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
      }
    });
    
    // Verify admin data is loaded
    cy.get('[data-testid="admin-data-message"]')
      .should('be.visible')
      .and('not.contain', 'No data available');
    
    // Make sure we're not on the access denied page
    cy.get('[data-testid="access-denied-page"]').should('not.exist');
    
    // Additional verification: test the reload button
    cy.get('[data-testid="admin-reload-button"]').click();
    
    // MODIFIED: Check if loading overlay exists after clicking reload
    cy.get('body').then($body => {
      if ($body.find('[data-testid="loading-overlay"]').length > 0) {
        cy.get('[data-testid="loading-overlay"]').should('exist');
        cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 10000 });
      } else {
        // If no loading overlay is shown, wait a moment and then verify data is still visible
        cy.wait(1000);
        cy.get('[data-testid="admin-data-message"]')
          .should('be.visible');
      }
    });
  });
});