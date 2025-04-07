import accounts from './accounts.js';

// Define LogLevel enum explicitly
export const LogLevel = {
  Error: 0,
  Warning: 1,
  Info: 2,
  Verbose: 3,
  Trace: 4,
  None: 999
};

// Define all the other enums and types needed
export const InteractionStatus = {
  None: "none",
  Login: "login",
  Logout: "logout",
  AcquireToken: "acquireToken",
  SsoSilent: "ssoSilent",
  HandleRedirect: "handleRedirect"
};

export const InteractionType = {
  Redirect: "redirect",
  Popup: "popup",
  Silent: "silent"
};

export const EventType = {
  LOGIN_START: "msal:loginStart",
  LOGIN_SUCCESS: "msal:loginSuccess",
  LOGIN_FAILURE: "msal:loginFailure",
  ACQUIRE_TOKEN_START: "msal:acquireTokenStart",
  ACQUIRE_TOKEN_SUCCESS: "msal:acquireTokenSuccess",
  ACQUIRE_TOKEN_FAILURE: "msal:acquireTokenFailure",
  ACQUIRE_TOKEN_NETWORK_START: "msal:acquireTokenFromNetworkStart",
  SSO_SILENT_START: "msal:ssoSilentStart",
  SSO_SILENT_SUCCESS: "msal:ssoSilentSuccess",
  SSO_SILENT_FAILURE: "msal:ssoSilentFailure",
  HANDLE_REDIRECT_START: "msal:handleRedirectStart",
  HANDLE_REDIRECT_END: "msal:handleRedirectEnd",
  LOGOUT_START: "msal:logoutStart",
  LOGOUT_SUCCESS: "msal:logoutSuccess",
  LOGOUT_FAILURE: "msal:logoutFailure",
  LOGOUT_END: "msal:logoutEnd"
};

export const OIDC_DEFAULT_SCOPES = ["openid", "profile", "email"];

// Custom error class
export class InteractionRequiredAuthError extends Error {
  constructor(errorCode, errorMessage) {
    super(errorMessage);
    this.name = "InteractionRequiredAuthError";
    this.errorCode = errorCode || "interaction_required";
    this.errorMessage = errorMessage || "User interaction is required";
  }
}

export class AuthError extends Error {
  constructor(errorCode, errorMessage) {
    super(errorMessage);
    this.name = "AuthError";
    this.errorCode = errorCode || "unknown_error";
    this.errorMessage = errorMessage || "An unknown error occurred";
  }
}

export const AuthenticationScheme = {
  BEARER: "bearer",
  POP: "pop"
};

// Logger class
export class Logger {
  constructor(loggerOptions) {
    this.level = loggerOptions?.logLevel || LogLevel.Info;
  }
  
  error(message) { console.error(message); }
  warning(message) { console.warn(message); }
  info(message) { console.info(message); }
  verbose(message) { console.debug(message); }
  trace() {}
  setPii() {}
  clone() { return this; }
}

// Account entity
export class AccountEntity {
  constructor(account) {
    this.homeAccountId = account.localAccountId;
    this.environment = "mock";
    this.tenantId = "mock-tenant";
    this.username = account.username;
    this.localAccountId = account.localAccountId;
    this.name = account.name;
  }
}

// Other required exports
export const WrapperSKU = {
  React: "react"
};

export const EventMessageUtils = {
  getInteractionStatusFromEvent: () => InteractionStatus.None
};

// PublicClientApplication implementation (your existing class)
export class PublicClientApplication {
  constructor(config) {
    this.name = 'mockInstance';
    this.isAuthenticated = false; // Start unauthenticated
    // Store all accounts from mockUsers
    this._allAccounts = accounts;
    this.accounts = [];           // Start with no accounts

    this.activeAccountIndex = this._getInitialActiveAccountIndex(); // init from localStorage role if available
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


    
    // Generate tokens
    this.accessTokens = this._allAccounts.map(user => this._generateJWT(user));
    
    // Store config
    this.config = config;
    
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

  _getInitialActiveAccountIndex() {
    const mockRole = localStorage.getItem('MOCKROLE');
    if (!mockRole) { return 0; } // Default to first account
    else {
      const targetRole = mockRole.toLowerCase();
      
      // Find account with matching role (case insensitive)
      const matchingIndex = this._allAccounts.findIndex(account => {
        const roles = account.idTokenClaims?.roles || [];
        return roles.some(role => role.toLowerCase() === targetRole);
      });
      
      // If found a matching account, use its index
      if (matchingIndex !== -1) {
        return matchingIndex;
        console.log(`Mock MSAL: Using account with role "${mockRole}" at index ${matchingIndex}`);
      } else {
        console.log(`Mock MSAL: No account found with role "${mockRole}", using default`);
        return 0;
      }
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
    setTimeout(() => { window.location.reload(); }, 100);
    return Promise.resolve();
  }

  logoutRedirect() {
    setTimeout(() => { window.location.reload(); }, 100);
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

// Create a stubbed instance
export const stubbedPublicClientApplication = new PublicClientApplication({});

export default PublicClientApplication;
