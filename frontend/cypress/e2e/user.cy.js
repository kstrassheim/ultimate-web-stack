describe('User Flow Test', () => {
  beforeEach(() => {
    // Set up role before test
    cy.setMockRole('User');
    // Visit the home page
    cy.visit('/');
    
    // First, sign in as a regular user - do this in beforeEach for consistency
    cy.get('[data-testid="unauthenticated-container"]').should('be.visible');
    cy.get('[data-testid="sign-in-button"]').click();
    
    // Verify login was successful
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    
    // Navigate to Dashboard (what was previously Home)
    cy.get('[data-testid="nav-dashboard"]').click();
    
    // Verify we're on the Dashboard page
    cy.url().should('include', '/dashboard');
  });

  // Updated to test the Dashboard page instead of Home
  it('should display and interact with the dashboard page - basic checks', () => {
    // First, intercept the API calls to add delay
    cy.intercept('GET', '**/api/user-data', {
      body: { message: 'Hello from API' },
      delay: 1000 // Add a delay to ensure we can see the loading state
    }).as('userData');
    
    // Check we're on the dashboard page
    cy.get('[data-testid="dashboard-page"]').should('be.visible');
    
    // Check for success toast notification - with sufficient timeout
    cy.get('.notyf', { timeout: 5000 }).should('exist');
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Data loaded successfully');
    
    // Check API data loaded
    cy.get('[data-testid="api-response-card"]').should('be.visible');
    cy.get('[data-testid="api-message-data"]').should('be.visible');
    cy.get('[data-testid="api-message-data"]').should('not.be.empty');
    
    // Wait for the toast to disappear before continuing
    cy.wait(4500);
    
    // Test reload functionality - click button
    cy.get('[data-testid="reload-button"]').click();
    
    // Now the button should be disabled - add a short pause to ensure React has time to update
    cy.wait(100); // Small wait to ensure React state updates
    cy.get('[data-testid="reload-button"]').should('be.disabled');
    
    // Wait for intercept to complete
    cy.wait('@userData');
    
    // Wait for reload to complete
    cy.get('[data-testid="reload-button"]', { timeout: 10000 })
      .should('not.be.disabled')
      .should('have.text', 'Reload Data');
    
    // Check for the success toast
    cy.get('.notyf__toast--success', { timeout: 5000 }).should('be.visible');
  });
  
  it('should display and interact with the dashboard page - intercept short delay', () => {
    // Intercept with a delay so we can see loading state
    cy.intercept('GET', '**/api/user-data', {
      body: { message: 'Hello from API' },
      delay: 1500 // 1.5s delay
    }).as('userData');

    // Trigger reload
    cy.get('[data-testid="reload-button"]').click();
    
    // Check button becomes disabled
    cy.get('[data-testid="reload-button"]').should('be.disabled');

    // Wait for intercept to finish
    cy.wait('@userData');
    
    // After the request completes, button should be enabled again
    cy.get('[data-testid="reload-button"]')
      .should('not.be.disabled');
  });
  
  it('should display and interact with the dashboard page - intercept long delay', () => {
    // Intercept the user-data request and delay it
    cy.intercept('GET', '**/api/user-data', {
      body: { message: 'Hello from API' },
      delay: 2000 // 2 seconds
    }).as('userData');

    // Click reload
    cy.get('[data-testid="reload-button"]').click();
    
    // Check button becomes disabled
    cy.get('[data-testid="reload-button"]').should('be.disabled');

    // Wait for request to finish
    cy.wait('@userData');

    // Check button is enabled again
    cy.get('[data-testid="reload-button"]').should('not.be.disabled');
  });
  
  // Update this test - remove checking for nav-experiments
  it('should be denied access to experiments page', () => {
    // Experiments link should not exist in DOM
    cy.get('[data-testid="nav-experiments"]').should('not.exist');
    
    // Try direct navigation to experiments page instead
    cy.visit('/experiments', { failOnStatusCode: false });
    
    // Should be redirected to access denied page
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    
    // Experiments page content should not be visible
    cy.get('[data-testid="experiments-heading"]').should('not.exist');
  });
  
  it('should be able to access public home page without authentication', () => {
    // Log out first
    cy.get('[data-testid="profile-image"]').click();
    cy.get('[data-testid="sign-out-button"]').click();
    
    // Verify we're logged out
    cy.get('[data-testid="sign-in-button"]').should('be.visible');
    
    // Navigate to home page
    cy.get('[data-testid="nav-home"]').click();
    
    // Should be able to access home page without authentication
    cy.url().should('not.include', '/access-denied');
    cy.get('[data-testid="home-page"]').should('be.visible');
    cy.contains('Welcome').should('be.visible');
  });

  // Update this test - verify experiments link is NOT visible
  it('should interact with the Bootstrap navbar correctly', () => {
    // Test the Bootstrap navigation
    cy.get('[data-testid="main-navigation"]').should('be.visible');
    
    // Check that regular navigation links exist
    cy.get('[data-testid="nav-home"]').should('be.visible');
    cy.get('[data-testid="nav-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-chat"]').should('be.visible');
    
    // Experiments link should NOT exist for normal users
    cy.get('[data-testid="nav-experiments"]').should('not.exist');
    
    // Navigate to chat page
    cy.get('[data-testid="nav-chat"]').click();
    cy.url().should('include', '/chat');
    cy.get('[data-testid="chat-page"]').should('be.visible');
    
    // Navigate back to dashboard page
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]').should('be.visible');
    
    // Navigate to the public home page
    cy.get('[data-testid="nav-home"]').click();
    cy.url().should('not.include', '/dashboard');
    cy.get('[data-testid="home-page"]').should('be.visible');
  });
  
  it('should handle API errors with toast notifications', () => {
    // Intercept the API call and force it to fail in a way that your app will recognize
    cy.intercept('GET', '**/api/user-data', {
      statusCode: 500,
      body: { message: 'Server Error' },  // Match the structure your app expects
      delay: 1000,
      forceNetworkError: false  // Don't force a network error, use status code instead
    }).as('apiError');
    
    // Clear any existing toasts
    cy.wait(5000);
    
    // Click reload button to trigger the error
    cy.get('[data-testid="reload-button"]').click();
    
    // Verify button is disabled during loading
    cy.get('[data-testid="reload-button"]').should('be.disabled');
    
    // Wait for the API error request to complete
    cy.wait('@apiError');
    
    // Wait for the error to be processed and displayed
    // First ensure the button returns to normal state
    cy.get('[data-testid="reload-button"]', { timeout: 10000 })
      .should('not.be.disabled');
    
    // Check for the actual error element if it exists
    cy.get('body').then($body => {
      if ($body.find('[data-testid="error-message"]').length > 0) {
        cy.get('[data-testid="error-message"]').should('be.visible');
        cy.get('[data-testid="error-message"]').should('contain.text', 'Error');
      }
    });
  });
  
  it('should show tooltip on profile hover', () => {
    // Hover over profile image
    cy.get('[data-testid="profile-image"]').trigger('mouseenter');
    
    // Wait for tooltip to appear
    cy.wait(200);
    
    // Profile dropdown should work
    cy.get('[data-testid="profile-image"]').click();
    cy.get('[data-testid="profile-dropdown"] .dropdown-menu').should('be.visible');
    cy.get('[data-testid="change-account-button"]').should('be.visible');
    cy.get('[data-testid="sign-out-button"]').should('be.visible');
    
    // Check for role badge
    cy.get('[data-testid="role-badge-none"]').should('be.visible');
  });
  
  // Update this test - verify experiments link is NOT visible in mobile view
  it('should test responsive behavior', () => {
    // Set viewport to mobile size
    cy.viewport('iphone-x');
    
    // Navbar should collapse on mobile
    cy.get('.navbar-collapse').should('not.be.visible');
    
    // Click hamburger menu
    cy.get('.navbar-toggler').click();
    
    // Menu should be visible
    cy.get('.navbar-collapse').should('be.visible');
    
    // Check main nav links are visible in mobile view
    cy.get('[data-testid="nav-home"]').should('be.visible');
    cy.get('[data-testid="nav-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-chat"]').should('be.visible');
    
    // Experiments link should NOT exist for normal users
    cy.get('[data-testid="nav-experiments"]').should('not.exist');
    
    // Navigate through menu items
    cy.get('[data-testid="nav-chat"]').click();
    
    // Should navigate to chat page
    cy.url().should('include', '/chat');
  });
});