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
    
    // Experiments navigation test - now a direct link
    cy.get('[data-testid="nav-experiments"]').should('be.visible').click();
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
});

describe('Unauthenticated Flow Tests', () => {
  beforeEach(() => {
    // Clear any existing session or mock role
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
    
    // Handle any uncaught exceptions
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });
    
    // Visit the site
    cy.visit('/');
  });

  it('should display login button when not authenticated', () => {
    // Verify the main navigation is loaded
    cy.get('[data-testid="main-navigation"]').should('be.visible');
    
    // Verify auth section contains the logon component
    cy.get('[data-testid="auth-navigation"]').should('be.visible');
    
    // Verify the unauthenticated container is shown
    cy.get('[data-testid="unauthenticated-container"]').should('be.visible');
    
    // Verify the sign-in button is visible
    cy.get('[data-testid="sign-in-button"]').should('be.visible');
    
    // Verify authenticated elements are not visible
    cy.get('[data-testid="authenticated-container"]').should('not.exist');
    cy.get('[data-testid="profile-container"]').should('not.exist');
  });

  it('should redirect to access-denied for home page when not authenticated', () => {
    // Click the Home link
    cy.get('[data-testid="nav-home"]').click();
    
    // Should redirect to access-denied
    cy.url().should('include', '/access-denied');
    
    // Verify access denied page content
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-login-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-signin-prompt"]').should('be.visible');
    
    // Verify we don't see the role-specific message
    cy.get('[data-testid="access-denied-role-message"]').should('not.exist');
  });

  it('should redirect to access-denied for experiments page when not authenticated', () => {
    // Now directly click on the Experiments link in the main navigation
    cy.get('[data-testid="nav-experiments"]').click();
    
    // Should redirect to access-denied
    cy.url().should('include', '/access-denied');
    
    // Verify access denied page content
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    
    // Verify experiments elements are not visible
    cy.get('[data-testid="experiments-page"]').should('not.exist');
  });

  it('should redirect to access-denied for chat page when not authenticated', () => {
    // Click the Chat link
    cy.get('[data-testid="nav-chat"]').click();
    
    // Should redirect to access-denied
    cy.url().should('include', '/access-denied');
    
    // Verify access denied page content
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-login-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-signin-prompt"]').should('be.visible');
    
    // Verify chat elements are not visible
    cy.get('[data-testid="websocket-demo"]').should('not.exist');
  });

  it('should provide direct access to the 404 page when not authenticated', () => {
    // Visit a non-existent route
    cy.visit('/non-existent-page');
    
    // Should show 404 page, not access-denied
    cy.get('[data-testid="not-found-page"]').should('be.visible');
    cy.get('[data-testid="not-found-heading"]').should('contain', '404');
    cy.get('[data-testid="not-found-home-link"]').should('be.visible');
    
    // Should not redirect to access-denied
    cy.url().should('include', '/non-existent-page');
    cy.url().should('not.include', '/access-denied');
  });
});

// Modified test to match new navigation structure
describe('Navigation Tests with Admin Role', () => {
  beforeEach(() => {
    // Set up a mock role with Admin permissions so we can access the admin page
    cy.setMockRole('Admin');
    cy.visit('/');
    
    // Wait for the main navigation to appear
    cy.get('[data-testid="main-navigation"]', { timeout: 10000 }).should('be.visible');
  });

  it('should have working bootstrap navigation components', () => {
    // Test bootstrap navigation structure
    cy.get('[data-testid="main-navigation"]').should('have.class', 'navbar');
    cy.get('[data-testid="main-navigation"]').should('have.class', 'bg-dark');
    cy.get('.navbar-toggler').should('exist'); // Hamburger menu
    cy.get('.navbar-collapse').should('exist'); // Collapsible content
    
    // Mobile view: Test hamburger menu opens and closes
    cy.viewport('iphone-x');
    cy.get('.navbar-collapse').should('not.be.visible');
    cy.get('.navbar-toggler').click();
    cy.get('.navbar-collapse').should('be.visible');
    cy.get('.navbar-toggler').click();
    cy.get('.navbar-collapse').should('not.be.visible');
    
    // Reset viewport
    cy.viewport(1000, 660);
  });

  it('should properly display main navigation links', () => {
    // Check main navigation links exist
    cy.get('[data-testid="nav-home"]').should('be.visible');
    cy.get('[data-testid="nav-chat"]').should('be.visible');
    cy.get('[data-testid="nav-experiments"]').should('be.visible');
    
    // Verify we can click the Experiments link directly
    cy.get('[data-testid="nav-experiments"]').click();
  });
});