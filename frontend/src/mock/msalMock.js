import accounts from './mockUsers.js';

// Create function to generate mock MSAL instance during test
function createMockMsalInstance(roles = []) {
  function generateJWT(payload) {
    // Create a proper JWT with header, payload, and signature
    const header = { alg: 'HS256', typ: 'JWT' };
    const completePayload = {
      sub: payload.idTokenClaims.oid,
      name: payload.name,
      preferred_username: payload.username,
      oid: payload.idTokenClaims.oid,
      roles: payload.idTokenClaims.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
    };
    const base64Header = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const base64Payload = btoa(JSON.stringify(completePayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const signature = 'MOCK_SIGNATURE_FOR_TESTING_ONLY';
    const base64Signature = btoa(signature)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `${base64Header}.${base64Payload}.${base64Signature}`;
  }

  // Create a mock logger
  const mockLogger = {
    error: console.error,
    warning: console.warn,
    info: console.info,
    verbose: console.debug,
    traceStart: () => {},
    traceEnd: () => {},
    trace: () => {},
    setPii: () => {},
    clone: function () {
      return this;
    }
  };

  let eventCallbacks = [];

  // Fix: Add EventType enum to match real MSAL
  const EventType = {
    LOGIN_SUCCESS: "msal:loginSuccess",
    LOGIN_FAILURE: "msal:loginFailure",
    LOGOUT_SUCCESS: "msal:logoutSuccess",
    LOGOUT_FAILURE: "msal:logoutFailure",
    ACQUIRE_TOKEN_SUCCESS: "msal:acquireTokenSuccess",
    ACQUIRE_TOKEN_FAILURE: "msal:acquireTokenFailure"
  };

  // Fix: Enhance the event payload structure
  function notify(eventName, payload = {}) {
    for (const { fn } of eventCallbacks) {
      fn({ 
        eventType: eventName,
        interactionType: payload.interactionType || "popup",
        payload: payload,
        timestamp: Date.now()
      });
    }
  }

  // Whenever state changes, broadcast it so React can update
  function instanceStateChanged() {
    for (const { fn } of eventCallbacks) {
      fn({
        eventType: 'msal:stateChanged',
        payload: {
          isAuthenticated: instance.isAuthenticated,
          accounts: instance.accounts
        }
      });
    }
  }

  const instance = {
    name: 'mockInstance',
    isAuthenticated: true,
    accounts: accounts,
    accessTokens: accounts.map((user) => generateJWT(user)),
    activeAccountIndex: (roles.includes('Admin')) ? 1 : 0,
    eventType: EventType,

    acquireTokenSilent() {
      return Promise.resolve({
        accessToken: this.accessTokens[this.activeAccountIndex]
      });
    },

    handleRedirectPromise: () => Promise.resolve(),

    loginPopup(loginRequestParam) {
      if (loginRequestParam && loginRequestParam.prompt === 'select_account') {
        this.activeAccountIndex =
          (this.activeAccountIndex + 1) % this.accounts.length;
      }
      this.isAuthenticated = true;
      
      // Enhance with proper payload
      const account = this.accounts[this.activeAccountIndex];
      notify(EventType.LOGIN_SUCCESS, {
        account: account,
        scopes: loginRequestParam?.scopes || ["user.read"]
      });
      
      instanceStateChanged();
      return Promise.resolve({ account: account });
    },

    loginRedirect: () => Promise.resolve(),

    logoutPopup() {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = false;
      
      // Only empty accounts AFTER notifying, as MSAL expects accounts during notification
      notify(EventType.LOGOUT_SUCCESS, {
        wasAuthenticated: wasAuthenticated,
        accounts: this.accounts
      });
      
      instanceStateChanged();
      this.accounts = []; // Now clear the accounts
      return Promise.resolve();
    },

    logoutRedirect: () => Promise.resolve(),

    getActiveAccount() {
      if (!this.isAuthenticated || !this.accounts.length) {
        return null;
      }
      return this.accounts[this.activeAccountIndex];
    },

    setActiveAccount(accountParam) {
      if (!this.isAuthenticated || !this.accounts.length) {
        return null;
      }
      this.activeAccountIndex = this.accounts.findIndex(
        (account) => account.username === accountParam.username
      );
      instanceStateChanged(); // Trigger “stateChanged”
      return Promise.resolve();
    },

    getLogger: () => mockLogger,
    getAllAccounts: () => accounts,

    // This is where React listens, and we call “fn()” on login/logout
    addEventCallback: (callback) => {
      const callbackEntry = { id: 'callbackId', fn: callback };
      eventCallbacks.push(callbackEntry);
      return callbackEntry;
    },

    removeEventCallback: (callbackId) => {
      eventCallbacks = eventCallbacks.filter((entry) => entry.id !== callbackId);
    },

    enableAccountStorageEvents: () => {},
    disableAccountStorageEvents: () => {},
    initializeWrapperLibrary: (name, version) => {
      console.log(`Mock: Initialized wrapper library ${name} ${version}`);
    },
    initialize: () => Promise.resolve(),
    setNavigationClient: () => {},
    ssoSilent: () => Promise.resolve({ account: account }),
    getConfiguration: () => ({
      auth: {
        clientId: 'mock-client-id',
        authority: 'https://login.microsoftonline.com/common'
      }
    }),

    // Add this expected method that MsalProvider uses to check state
    getAccountByHomeId(homeId) {
      return this.accounts.find(account => account.homeAccountId === homeId) || null;
    }
  };
  return instance;
}

// Create a mock for useMsal hook that returns expected structure
// function createMockUseMsal(instance) {
//   return () => ({
//     name: 'mockUseMsal',
//     instance,
//     accounts: instance.accounts,
//     inProgress: 'none',
//     isAuthenticated: instance.isAuthenticated
//   });
// }

const mockMsal = (role) => {
  if (!role) return;
  console.log(`Mocking MSAL for role: ${role}`);
  const mockInstance = createMockMsalInstance(role);
  // const mockUseMsal = createMockUseMsal(mockInstance);

  // Important: This connects your mock to the real MsalProvider
  if (window.msal) {
    window.msal.instance = mockInstance;
  } else {
    window.msal = { instance: mockInstance };
  }

  // window.mockUseMsal = mockUseMsal;
  window.mockInstance = mockInstance;
//   window.retreiveTokenForBackend = async (instance) => accessTokens[this.activeAccountIndex];
//   window.retreiveTokenForGraph = async () => mockInstance.token;
};

export default mockMsal;
