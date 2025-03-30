describe('User Flow Test', () => {
  beforeEach(() => {
    // Visit the home page
    cy.visit('/');
  });

  it('should display and interact with the home page correctly', () => {
    // First, sign in as a regular user
    cy.get('[data-testid="unauthenticated-container"]').should('be.visible');
    cy.get('[data-testid="sign-in-button"]').click();
    
    // Verify login was successful
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    cy.get('[data-testid="profile-container"]').should('be.visible');
    
    // Check we're on the home page
    cy.get('h1').should('contain', 'Home Page');
    
    // Don't wait for API calls - instead directly check for rendered content
    // cy.wait('@apiUserData', { timeout: 10000 }); // Remove this
    // cy.wait('@graphGroups', { timeout: 10000 }); // Remove this
    
    // Check API data loaded
    cy.get('.card h2').first().should('contain', 'API Response');
    cy.get('.card p').first().should('not.contain', 'No data available');
    
    // Check Groups section loaded
    cy.get('.card h2').eq(1).should('contain', 'Groups from Microsoft Graph API');
    cy.get('[data-testid="groups-container"]').should('be.visible');
    cy.get('[data-testid="groups-table"]').should('be.visible');
    
    // Test reload functionality without waiting for API calls
    cy.get('.reload-button').click();
    
    // Verify content is still displayed after reload
    cy.get('[data-testid="groups-table"]').should('be.visible');
  });
  
  it('should be denied access to admin page', () => {
    // First, sign in as a regular user
    cy.get('[data-testid="sign-in-button"]').click();
    
    // Verify login was successful
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    
    // Try to navigate to admin page
    cy.get('[data-testid="nav-admin"]').click();
    
    // Should be redirected to access denied page
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-role-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-required-roles"]').should('contain', 'Admin');
    
    // Admin page content should not be visible
    cy.get('[data-testid="admin-heading"]').should('not.exist');
  });
});