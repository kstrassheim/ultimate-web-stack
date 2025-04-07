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
    
    // Home navigation test - Home is now publicly accessible welcome page
    cy.get('[data-testid="nav-home"]').should('be.visible').click();
    cy.wait(500);
    cy.url().should('include', '/');
    cy.get('[data-testid="home-page"]').should('be.visible');
    
    // Dashboard navigation test - requires authentication
    cy.get('[data-testid="nav-dashboard"]').should('be.visible').click();
    cy.wait(500);
    cy.url().should('include', '/access-denied');
    
    // Experiments should not be there for unauthenticated users
    cy.get('[data-testid="nav-experiments"]').should('not.exist');
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

  it('should allow access to home page when not authenticated', () => {
    // Click the Home link
    cy.get('[data-testid="nav-home"]').click();
    
    // Should remain on the home page
    cy.url().should('not.include', '/access-denied');
    
    // Verify home page content
    cy.get('[data-testid="home-page"]').should('be.visible');
    cy.contains('h1', 'Welcome to Ultimate Web Stack').should('be.visible');
    
    // Check for feature cards
    cy.contains('React Frontend').should('be.visible');
    cy.contains('FastAPI Backend').should('be.visible');
  });

  it('should redirect to access-denied for dashboard page when not authenticated', () => {
    // Click the Dashboard link
    cy.get('[data-testid="nav-dashboard"]').click();
    
    // Should redirect to access-denied
    cy.url().should('include', '/access-denied');
    
    // Verify access denied page content
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-login-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-signin-prompt"]').should('be.visible');
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

  it('should not show experiments link when not authenticated', () => {
    // Verify the experiments link is not in the DOM (hidden by ProtectedLink)
    cy.get('[data-testid="nav-experiments"]').should('not.exist');
    
    // Other navigation links should still be visible
    cy.get('[data-testid="nav-home"]').should('be.visible');
    cy.get('[data-testid="nav-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-chat"]').should('be.visible');
  });

  it('should redirect to access-denied when directly accessing experiments page', () => {
    // Directly visit the experiments page
    cy.visit('/experiments', { failOnStatusCode: false });
    
    // Should redirect to access-denied
    cy.url().should('include', '/access-denied');
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    
    // Verify experiments elements are not visible
    cy.get('[data-testid="experiments-page"]').should('not.exist');
  });
});

// Modified test to match new navigation structure
describe('Navigation Tests with Admin Role', () => {
  beforeEach(() => {
    // Set up a mock role with Admin permissions so we can access the admin page
    cy.setMockRole('Admin');
    // Visit the home page
    cy.visit('/');
    // Sign in
    cy.get('[data-testid="sign-in-button"]').click();
    
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

  it('should properly display main navigation links and allow access to protected pages', () => {
    // Check main navigation links exist
    cy.get('[data-testid="nav-home"]').should('be.visible');
    cy.get('[data-testid="nav-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-chat"]').should('be.visible');
    cy.get('[data-testid="nav-experiments"]').should('be.visible');
    
    // Verify Home is accessible
    cy.get('[data-testid="nav-home"]').click();
    cy.url().should('include', '/');
    cy.get('[data-testid="home-page"]').should('be.visible');
    
    // Verify Dashboard is accessible when authenticated
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]').should('be.visible');
    
    // Verify Chat is accessible when authenticated
    cy.get('[data-testid="nav-chat"]').click();
    cy.url().should('include', '/chat');
    cy.get('[data-testid="chat-page"]').should('be.visible');
    
    // Verify Experiments is accessible with Admin role
    cy.get('[data-testid="nav-experiments"]').click();
    cy.url().should('include', '/experiments');
    cy.get('[data-testid="experiments-page"]').should('be.visible');
  });

  it('should show proper role badge in profile dropdown', () => {
    // Click profile to open dropdown
    cy.get('[data-testid="profile-image"]').click();
    
    // Verify Admin role badge is displayed
    cy.get('[data-testid="role-badge-Admin"]').should('be.visible');
    
    // Close dropdown
    cy.get('[data-testid="profile-image"]').click();
  });
});

describe('Navigation Tests with Role-Based Access Control', () => {
  context('When user has no role (default user)', () => {
    beforeEach(() => {
      // Clear any existing roles
      cy.window().then((win) => {
        win.localStorage.removeItem('MOCKROLE');
      });
      cy.visit('/');
      cy.get('[data-testid="sign-in-button"]').click();
      cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');
    });

    it('should hide experiments link for users without Admin role', () => {
      // Check that experiments link is NOT in the DOM because ProtectedLink hides it
      cy.get('[data-testid="nav-experiments"]').should('not.exist');
      
      // Other navigation links should be visible
      cy.get('[data-testid="nav-home"]').should('be.visible');
      cy.get('[data-testid="nav-dashboard"]').should('be.visible');
      cy.get('[data-testid="nav-chat"]').should('be.visible');
      
      // Role badge should show "None"
      cy.get('[data-testid="profile-image"]').click();
      cy.get('[data-testid="role-badge-none"]').should('be.visible');
      
      // Direct access to experiments should be blocked with access denied
      cy.visit('/experiments', { failOnStatusCode: false });
      cy.url().should('include', '/access-denied');
      
      // Just check that the access denied page is visible
      cy.get('[data-testid="access-denied-page"]').should('be.visible');
      
      // Verify the generic access denied message without looking for specific roles
      cy.get('[data-testid="access-denied-heading"]').should('be.visible');
      
      // We can also check that the page content generally mentions lacking permissions
      cy.get('[data-testid="access-denied-page"]').should('contain', 'permission');
    });

    it('should allow access to other protected pages for authenticated users', () => {
      // Dashboard should be accessible
      cy.get('[data-testid="nav-dashboard"]').click();
      cy.url().should('include', '/dashboard');
      cy.get('[data-testid="dashboard-page"]').should('be.visible');

      // Chat should be accessible
      cy.get('[data-testid="nav-chat"]').click();
      cy.url().should('include', '/chat');
      cy.get('[data-testid="chat-page"]').should('be.visible');
    });
  });

  context('When user has Admin role', () => {
    beforeEach(() => {
      // Set Admin role
      cy.setMockRole('Admin');
      cy.visit('/');
      cy.get('[data-testid="sign-in-button"]').click();
      cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');
    });

    it('should show experiments link for users with Admin role', () => {
      // Check main navigation links exist
      cy.get('[data-testid="nav-home"]').should('be.visible');
      cy.get('[data-testid="nav-dashboard"]').should('be.visible');
      cy.get('[data-testid="nav-chat"]').should('be.visible');
      
      // Experiments link should be visible because user has Admin role
      cy.get('[data-testid="nav-experiments"]').should('be.visible');
      
      // Admin badge should be visible in profile
      cy.get('[data-testid="profile-image"]').click();
      cy.get('[data-testid="role-badge-Admin"]').should('be.visible');
      
      // Should be able to access experiments page
      cy.get('body').click(); // Close dropdown
      cy.get('[data-testid="nav-experiments"]').click();
      cy.url().should('include', '/experiments');
      cy.get('[data-testid="experiments-page"]').should('be.visible');
    });
  });
  
  context('When user switches roles', () => {
    it('should update navigation links when changing from Admin to regular user', () => {
      // Start as Admin
      cy.setMockRole('Admin');
      cy.visit('/');
      cy.get('[data-testid="sign-in-button"]').click();
      
      // Verify experiments link is visible for Admin
      cy.get('[data-testid="nav-experiments"]').should('be.visible');
      
      // Sign out
      cy.get('[data-testid="profile-image"]').click();
      cy.get('[data-testid="sign-out-button"]').click();
      
      // Sign in as regular user
      cy.setMockRole('User');
      cy.get('[data-testid="sign-in-button"]').click();
      
      // Verify experiments link is now hidden
      cy.get('[data-testid="nav-experiments"]').should('not.exist');
      
      // But other links should still be visible
      cy.get('[data-testid="nav-home"]').should('be.visible');
      cy.get('[data-testid="nav-dashboard"]').should('be.visible');
      cy.get('[data-testid="nav-chat"]').should('be.visible');
    });
  });
  
  context('When unauthenticated', () => {
    beforeEach(() => {
      // Clear any existing roles
      cy.window().then((win) => {
        win.localStorage.clear();
      });
      cy.visit('/');
    });
    
    it('should not display experiments link when not authenticated', () => {
      // Experiments link should not be in the DOM
      cy.get('[data-testid="nav-experiments"]').should('not.exist');
      
      // Other links should be visible
      cy.get('[data-testid="nav-home"]').should('be.visible');
      cy.get('[data-testid="nav-dashboard"]').should('be.visible');
      cy.get('[data-testid="nav-chat"]').should('be.visible');
    });
  });
});

// Keep existing tests for bootstrap components
describe('Navigation Tests with Bootstrap Components', () => {
  beforeEach(() => {
    cy.setMockRole('Admin');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');
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
});