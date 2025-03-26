// Create function to generate mock MSAL instance during test
function createMockMsalInstance(roles = []) {
  // Choose character based on roles
  const isAdmin = roles.includes('Admin');
  const rolesArray = Array.isArray(roles) ? roles : [roles];
  const userId = isAdmin ? 'water-goddess-id' : 'explosion-mage-id';
  const username = isAdmin ? 'aqua@axisorder.com' : 'megumin@crimsondemons.com';
  const name = isAdmin ? 'Aqua' : 'Megumin';
  const account = { 
    username: username, 
    name: name, 
    localAccountId: userId,
    idTokenClaims: {
      roles: rolesArray,
      oid: userId,
      preferred_username: username
    }
  };

  const accessToken = isAdmin ? 'water-purification-token' : 'explosion-magic-token'

  // Create a mock logger
  const mockLogger = {
    error: (message) => console.error(message),
    warning: (message) => console.warn(message),
    info: (message) => console.info(message),
    verbose: (message) => console.debug(message),
    traceStart: () => {},
    traceEnd: () => {},
    trace: () => {},
    setPii: () => {},
    clone: function() { return this; }
  };

  return {
    name: 'mockInstance',
    token: accessToken,
    accounts: [account],
    acquireTokenSilent: () => Promise.resolve({ accessToken: accessToken}),
    handleRedirectPromise: () => Promise.resolve(),
    loginPopup: () => Promise.resolve({  account: account }),
    loginRedirect: () => Promise.resolve(),
    logoutPopup: () => Promise.resolve(),
    logoutRedirect: () => Promise.resolve(),
    getActiveAccount: () => account,
    setActiveAccount: () => {},
    getLogger: () => mockLogger,
    getAllAccounts: () => [account],
    // Additional methods that might be needed
    getAccountByHomeId: () => account,
    getAccountByLocalId: () => account,
    getAccountByUsername: () => account,
    // Event handling methods
    addEventCallback: () => ({ id: "callbackId" }),
    removeEventCallback: () => {},
    enableAccountStorageEvents: () => {},
    disableAccountStorageEvents: () => {},
    initializeWrapperLibrary: (name, version) => {
      console.log(`Mock: Initialized wrapper library ${name} ${version}`);
    },
    initialize: () => Promise.resolve(),
    // Add setNavigationClient which might be called
    setNavigationClient: () => {},
    // Add more methods as needed
    ssoSilent: () => Promise.resolve({ account: account }),
    getConfiguration: () => ({
      auth: {
        clientId: 'mock-client-id',
        authority: 'https://login.microsoftonline.com/common'
      }
    })
  };
}

// Create a mock for useMsal hook that returns expected structure
function createMockUseMsal(instance) {
  return () => ({
    name: 'mockUseMsal',
    instance: instance,
    accounts: instance.accounts,
    inProgress: "none",
    isAuthenticated: true
  });
}
const mockMsal = (role) => {
  if (!role) { return; }
  console.log(`Mocking MSAL for role: ${role}`);
  const mockInstance = createMockMsalInstance(role);
  const mockUseMsal = createMockUseMsal(mockInstance);

  window.mockUseMsal = mockUseMsal;
  window.mockInstance = mockInstance;
  window.mockRetreiveTokenForBackend = async (instance, extraScopes = []) => { return mockInstance.accessToken};
}
export default mockMsal;
