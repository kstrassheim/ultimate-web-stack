import accounts from './mockUsers.js';

// Create a proper class that can be instantiated with 'new'
export class PublicClientApplication {
  constructor(config, initRole) {
    this.name = 'mockInstance';
    this.isAuthenticated = false; // Start unauthenticated
    this.accounts = [];           // Start with no accounts
    this.activeAccountIndex = 0;
    this.eventCallbacks = [];
    
    // Define enum for events
    this.eventType = {
      LOGIN_SUCCESS: "msal:loginSuccess",
      LOGIN_FAILURE: "msal:loginFailure",
      LOGOUT_SUCCESS: "msal:logoutSuccess",
      LOGOUT_FAILURE: "msal:logoutFailure",
      ACQUIRE_TOKEN_SUCCESS: "msal:acquireTokenSuccess",
      ACQUIRE_TOKEN_FAILURE: "msal:acquireTokenFailure"
    };

    // Store all accounts from mockUsers
    this._allAccounts = accounts;
    
    // Generate tokens
    this.accessTokens = this._allAccounts.map(user => this._generateJWT(user));
    
    // Set up mockRole behavior 
    if (initRole = 'Admin') {
      this.defaultAccountIndex = 1; // Aqua (admin)
    } else {
      this.defaultAccountIndex = 0; // Megumin (regular user)
    }

    // Store config
    this.config = config;
    
    // Make this instance available globally
    window.mockInstance = this;
  }

  // Private JWT generator
  _generateJWT(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const completePayload = {
      sub: payload.idTokenClaims.oid,
      name: payload.name,
      preferred_username: payload.username,
      oid: payload.idTokenClaims.oid,
      roles: payload.idTokenClaims.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
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

  // Notify listeners of events
  _notify(eventName, payload = {}) {
    for (const { fn } of this.eventCallbacks) {
      fn({ 
        eventType: eventName,
        interactionType: payload.interactionType || "popup",
        payload: payload,
        timestamp: Date.now()
      });
    }
  }

  // Signal state changes
  _instanceStateChanged() {
    for (const { fn } of this.eventCallbacks) {
      fn({
        eventType: 'msal:stateChanged',
        payload: {
          isAuthenticated: this.isAuthenticated,
          accounts: this.accounts
        }
      });
    }
  }

  // Public methods (same as in your original mock)
  acquireTokenSilent() {
    return Promise.resolve({
      accessToken: this.accessTokens[this.activeAccountIndex]
    });
  }

  handleRedirectPromise() {
    return Promise.resolve();
  }

  loginPopup(loginRequestParam) {
    if (loginRequestParam && loginRequestParam.prompt === 'select_account') {
      this.activeAccountIndex =
        (this.activeAccountIndex + 1) % this._allAccounts.length;
    }
    
    // Set the logged in account
    this.accounts = [this._allAccounts[this.activeAccountIndex]];
    this.isAuthenticated = true;
    
    const account = this.accounts[0];
    this._notify(this.eventType.LOGIN_SUCCESS, {
      account: account,
      scopes: loginRequestParam?.scopes || ["user.read"]
    });
    
    this._instanceStateChanged();
    return Promise.resolve({ account: account });
  }

  loginRedirect() {
    return Promise.resolve();
  }

  logoutPopup() {
    const wasAuthenticated = this.isAuthenticated;
    this.isAuthenticated = false;
    
    this._notify(this.eventType.LOGOUT_SUCCESS, {
      wasAuthenticated: wasAuthenticated,
      accounts: this.accounts
    });
    
    this._instanceStateChanged();
    this.accounts = []; // Clear accounts after notification
    return Promise.resolve();
  }

  logoutRedirect() {
    return Promise.resolve();
  }

  getActiveAccount() {
    if (!this.isAuthenticated || !this.accounts.length) {
      return null;
    }
    return this.accounts[0];
  }

  setActiveAccount(accountParam) {
    if (!accountParam) return null;
    
    const index = this._allAccounts.findIndex(
      (account) => account.username === accountParam.username
    );
    
    if (index !== -1) {
      this.activeAccountIndex = index;
      this.accounts = [this._allAccounts[index]];
      this._instanceStateChanged();
    }
    
    return Promise.resolve();
  }

  getLogger() {
    return {
      error: console.error,
      warning: console.warn,
      info: console.info,
      verbose: console.debug,
      traceStart: () => {},
      traceEnd: () => {},
      trace: () => {},
      setPii: () => {},
      clone: function () { return this; }
    };
  }

  getAllAccounts() {
    return this.isAuthenticated ? this.accounts : [];
  }

  addEventCallback(callback) {
    const callbackEntry = { id: 'callbackId-' + Date.now(), fn: callback };
    this.eventCallbacks.push(callbackEntry);
    return callbackEntry;
  }

  removeEventCallback(callbackId) {
    this.eventCallbacks = this.eventCallbacks.filter(entry => entry.id !== callbackId);
  }

  enableAccountStorageEvents() {}
  disableAccountStorageEvents() {}
  
  initializeWrapperLibrary(name, version) {
    console.log(`Mock: Initialized wrapper library ${name} ${version}`);
  }
  
  initialize() {
    return Promise.resolve();
  }
  
  setNavigationClient() {}
  
  ssoSilent() {
    return Promise.resolve({ account: this.accounts[0] });
  }
  
  getConfiguration() {
    return {
      auth: {
        clientId: 'mock-client-id',
        authority: 'https://login.microsoftonline.com/common'
      }
    };
  }

  getAccountByHomeId(homeId) {
    return this.accounts.find(account => account.homeAccountId === homeId) || null;
  }
}

export default PublicClientApplication;
