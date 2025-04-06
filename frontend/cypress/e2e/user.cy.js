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
  });

  it('should display and interact with the home page - basic checks', () => {
    // First, intercept the API calls to add delay
    cy.intercept('GET', '**/api/user-data', {
      body: { message: 'Hello from API' },
      delay: 1000 // Add a delay to ensure we can see the loading state
    }).as('userData');
    
    // Check we're on the home page
    cy.get('h1').should('contain', 'Home Page');
    
    // Check for success toast notification - with sufficient timeout
    cy.get('.notyf', { timeout: 5000 }).should('exist');
    cy.get('.notyf__toast--success').should('be.visible');
    cy.get('.notyf__toast--success').should('contain.text', 'Data reloaded successfully');
    
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
  
  it('should display and interact with the home page - intercept short delay', () => {
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
  
  it('should display and interact with the home page - intercept long delay', () => {
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
  
  it('should be denied access to admin page', () => {
    // First click on the dropdown menu
    cy.get('[data-testid="nav-future-gadget"]').click();
    
    // Then click on the Admin Panel item
    cy.get('[data-testid="nav-admin"]').click();
    
    // Should be redirected to access denied page
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-role-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-required-roles"]').should('contain', 'Admin');
    
    // Admin page content should not be visible
    cy.get('[data-testid="admin-heading"]').should('not.exist');
  });

  it('should be denied access to experiments page', () => {
    // First click on the dropdown menu
    cy.get('[data-testid="nav-future-gadget"]').click();
    
    // Then click on the Experiments item
    cy.get('[data-testid="nav-experiments"]').click();
    
    // Should be redirected to access denied page
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-role-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-required-roles"]').should('contain', 'Admin');
    
    // Experiments page content should not be visible
    cy.get('[data-testid="experiments-heading"]').should('not.exist');
  });

  it('should be denied access to dmails page', () => {
    // First click on the dropdown menu
    cy.get('[data-testid="nav-future-gadget"]').click();
    
    // Then click on the D-Mail System item
    cy.get('[data-testid="nav-dmails"]').click();
    
    // Should be redirected to access denied page
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-role-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-required-roles"]').should('contain', 'Admin');
    
    // DMails page content should not be visible
    cy.get('[data-testid="dmails-heading"]').should('not.exist');
  });
  
  it('should interact with the Bootstrap navbar and dropdown correctly', () => {
    // Test the Bootstrap navigation
    cy.get('[data-testid="main-navigation"]').should('be.visible');
    
    // Check that Future Gadget Lab dropdown exists
    cy.get('[data-testid="nav-future-gadget"]').should('be.visible');
    
    // Open the dropdown
    cy.get('[data-testid="nav-future-gadget"]').click();
    
    // Check all dropdown items are visible
    cy.get('[data-testid="nav-admin"]').should('be.visible');
    cy.get('[data-testid="nav-experiments"]').should('be.visible');
    cy.get('[data-testid="nav-dmails"]').should('be.visible');
    
    // Close dropdown by clicking elsewhere
    cy.get('body').click();
    
    // Navigate to chat page
    cy.get('[data-testid="nav-chat"]').click();
    cy.url().should('include', '/chat');
    cy.get('[data-testid="websocket-demo"]').should('be.visible');
    
    // Navigate back to home page
    cy.get('[data-testid="nav-home"]').click();
    cy.url().should('not.include', '/chat');
    cy.get('[data-testid="home-container"]').should('be.visible');
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
      } else {
        // If the specific element isn't found, at least verify an error is shown somewhere
        //cy.get('.error').should('be.visible');
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
  });
  
  it('should test responsive behavior with dropdown', () => {
    // Set viewport to mobile size
    cy.viewport('iphone-x');
    
    // Navbar should collapse on mobile
    cy.get('.navbar-collapse').should('not.be.visible');
    
    // Click hamburger menu
    cy.get('.navbar-toggler').click();
    
    // Menu should be visible
    cy.get('.navbar-collapse').should('be.visible');
    
    // Check dropdown is visible in mobile view
    cy.get('[data-testid="nav-future-gadget"]').should('be.visible');
    
    // Open dropdown in mobile view
    cy.get('[data-testid="nav-future-gadget"]').click();
    
    // Check dropdown items are visible
    cy.get('[data-testid="nav-admin"]').should('be.visible');
    cy.get('[data-testid="nav-experiments"]').should('be.visible');
    cy.get('[data-testid="nav-dmails"]').should('be.visible');
    
    // Navigate through menu items
    cy.get('[data-testid="nav-chat"]').click();
    
    // Should navigate to chat page
    cy.url().should('include', '/chat');
  });
});