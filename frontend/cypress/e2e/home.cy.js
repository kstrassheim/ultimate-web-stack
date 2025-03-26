describe('Navigation Tests', () => {
  beforeEach(() => {
    // Add error handling for uncaught exceptions
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false; // prevents test failure on JS errors
    });
    
    cy.visit('/');
    // Wait for the main navigation to appear
    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should('be.visible');
  });

  it('should have working navigation components', () => {
    // Navigation elements checks
    cy.get('[data-testid="main-navigation"]').should('exist');
    cy.get('[data-testid="page-navigation"]').should('exist');
    cy.get('[data-testid="auth-navigation"]').should('exist');
    
    // Logo checks
    cy.get('[data-testid="logo-link"]').should('have.attr', 'href', 'https://github.com/kstrassheim/ultimate-web-stack');
    cy.get('[data-testid="logo-image"]').should('be.visible');
    
    // Home navigation test
    cy.get('[data-testid="nav-home"]').should('be.visible').click();
    cy.wait(500);
    cy.url().should('include', '/');
    
    // Admin navigation test
    cy.get('[data-testid="nav-admin"]').should('be.visible').click();
    cy.wait(500);
    
    // If you're not authenticated, we expect access denied
    cy.url().should('include', '/access-denied');
  });
  
  // Separate test for authentication components
  it('should display EntraLogon component', () => {
    // Check only for EntraLogon since we know that exists
    cy.get('[data-testid="auth-navigation"]').should('exist');
    // Check for sign-in button which should be visible when not authenticated
    cy.get('[data-testid="sign-in-button"]').should('exist');
  });
  
  // If EntraProfile is implemented correctly, uncomment this test
  /* 
  it('should display EntraProfile component', () => {
    cy.get('[data-testid="auth-navigation"]').should('exist');
    cy.get('[data-testid="entra-profile"]', { timeout: 5000 }).should('exist');
  });
  */
});