// Create function to generate mock MSAL instance during test
function createMockMsalInstance() {
  return {
    accounts: [{ username: 'megumin@crimsondemons.com', name: 'Megumin', localAccountId: 'explosion-mage-id' }],
    acquireTokenSilent: () => Promise.resolve({ accessToken: 'explosion-magic-token' }),
    handleRedirectPromise: () => Promise.resolve(),
    loginPopup: () => Promise.resolve({ account: { username: 'megumin@crimsondemons.com' } }),
    loginRedirect: () => Promise.resolve(),
    logoutPopup: () => Promise.resolve(),
    logoutRedirect: () => Promise.resolve(),
    getActiveAccount: function() { return this.accounts[0]; },
    setActiveAccount: () => {}
  };
}

// Create a mock for the useIsAuthenticated hook
export const mockIsAuthenticated = true;

// Add a Cypress command to login
Cypress.Commands.add('msalLogin', () => {
  cy.window().then(win => {
    // Create the mock instance during test execution
    const mockMsalInstance = createMockMsalInstance();
    
    // Properly stub methods during test execution
    mockMsalInstance.acquireTokenSilent = cy.stub().resolves({ accessToken: 'explosion-magic-token' });
    mockMsalInstance.handleRedirectPromise = cy.stub().resolves();
    mockMsalInstance.loginPopup = cy.stub().resolves({ account: { username: 'megumin@crimsondemons.com' } });
    mockMsalInstance.loginRedirect = cy.stub().resolves();
    mockMsalInstance.logoutPopup = cy.stub().resolves();
    mockMsalInstance.logoutRedirect = cy.stub().resolves();
    mockMsalInstance.setActiveAccount = cy.stub();
    
    // Set up localStorage for MSAL
    win.localStorage.setItem('msal.account.keys', JSON.stringify(['explosion-mage-id']));
    win.localStorage.setItem('msal.account.explosion-mage-id', JSON.stringify({
      homeAccountId: 'explosion-mage-id',
      environment: 'login.microsoftonline.com',
      tenantId: 'common',
      username: 'megumin@crimsondemons.com',
      name: 'Megumin',
      localAccountId: 'explosion-mage-id'
    }));
    
    // Tell our React app to use the mock
    win.useMockMsal = true;
    win.mockMsalInstance = mockMsalInstance;
    win.mockIsAuthenticated = true;
  });
});

// Update your test to use the username from the mock
Cypress.Commands.add('checkAuthenticatedContent', () => {
  cy.contains('Megumin').should('be.visible');
  // or more generally
  cy.contains('megumin@crimsondemons.com').should('be.visible');
});