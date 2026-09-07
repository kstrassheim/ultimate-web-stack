/**
 * Coverage for src/auth/msalInstance.js — the module-level MSAL wiring.
 *
 * The module is side-effecting: evaluating it constructs the
 * PublicClientApplication, kicks off `initialize()`, registers the
 * active-account event callback and runs `handleRedirectPromise()`. Every
 * scenario below therefore re-requires the module inside
 * `jest.isolateModules` with the mock MSAL behaviour it needs, and awaits
 * the exported `msalInitialization` promise to flush the chain.
 *
 * `@azure/msal-browser` is replaced with a minimal double; `EventType` is
 * the only named export the module consumes besides the constructor.
 */

const EVENTS = {
  LOGIN_SUCCESS: 'msal:loginSuccess',
  LOGOUT_SUCCESS: 'msal:logoutSuccess',
  ACQUIRE_TOKEN_SUCCESS: 'msal:acquireTokenSuccess',
  SSO_SILENT_SUCCESS: 'msal:ssoSilentSuccess',
  ACQUIRE_TOKEN_FAILURE: 'msal:acquireTokenFailure',
};

const mocks = {
  initialize: jest.fn(),
  addEventCallback: jest.fn(),
  getActiveAccount: jest.fn(),
  getAllAccounts: jest.fn(),
  setActiveAccount: jest.fn(),
  handleRedirectPromise: jest.fn(),
};

jest.mock('@azure/msal-browser', () => ({
  PublicClientApplication: jest.fn().mockImplementation(() => ({
    initialize: mocks.initialize,
    addEventCallback: mocks.addEventCallback,
    getActiveAccount: mocks.getActiveAccount,
    getAllAccounts: mocks.getAllAccounts,
    setActiveAccount: mocks.setActiveAccount,
    handleRedirectPromise: mocks.handleRedirectPromise,
  })),
  EventType: EVENTS,
}));

/**
 * Re-require the module with the given MSAL behaviour and return the bits
 * the assertions need once the initialization chain has settled.
 */
const loadModule = async ({
  activeAccount = null,
  allAccounts = [],
  redirectResponse = null,
  initializeError = null,
} = {}) => {
  mocks.initialize.mockImplementation(() =>
    initializeError ? Promise.reject(initializeError) : Promise.resolve()
  );
  mocks.getActiveAccount.mockReturnValue(activeAccount);
  mocks.getAllAccounts.mockReturnValue(allAccounts);
  mocks.handleRedirectPromise.mockResolvedValue(redirectResponse);

  let mod;
  jest.isolateModules(() => {
    mod = require('./msalInstance');
  });
  await mod.msalInitialization;

  const eventCallback = mocks.addEventCallback.mock.calls[0]?.[0];
  return { mod, eventCallback };
};

describe('msalInstance module wiring', () => {
  const account = { username: 'user@example.com', homeAccountId: 'home-1' };

  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('constructs the PublicClientApplication from msalConfig() and exports the instance', async () => {
    const { PublicClientApplication } = require('@azure/msal-browser');
    const { mod } = await loadModule();

    expect(PublicClientApplication).toHaveBeenCalledTimes(1);
    const config = PublicClientApplication.mock.calls[0][0];
    expect(config.auth).toHaveProperty('clientId');
    expect(config.auth).toHaveProperty('authority');
    expect(mod.default).toEqual(
      expect.objectContaining({ initialize: mocks.initialize }),
    );
  });

  it('adopts the account from a redirect response as the active account', async () => {
    const redirectAccount = { username: 'redirect@example.com' };
    await loadModule({ redirectResponse: { account: redirectAccount } });

    expect(mocks.setActiveAccount).toHaveBeenCalledWith(redirectAccount);
  });

  it('keeps an already-active account when the redirect brings nothing back', async () => {
    await loadModule({ activeAccount: account, redirectResponse: null });

    // setInitialActiveAccount returns early — no setActiveAccount call.
    expect(mocks.setActiveAccount).not.toHaveBeenCalled();
  });

  it('falls back to the first cached account when nothing is active', async () => {
    const cached = { username: 'cached@example.com' };
    await loadModule({ activeAccount: null, allAccounts: [cached], redirectResponse: null });

    expect(mocks.setActiveAccount).toHaveBeenCalledWith(cached);
  });

  it('leaves the active account unset when no redirect and no cached accounts exist', async () => {
    await loadModule({ activeAccount: null, allAccounts: [], redirectResponse: null });

    expect(mocks.setActiveAccount).not.toHaveBeenCalled();
  });

  it('treats a redirect response without an account like no response at all', async () => {
    await loadModule({ redirectResponse: {} });

    expect(mocks.setActiveAccount).not.toHaveBeenCalled();
  });

  it('logs and resolves when MSAL initialization fails', async () => {
    const failure = new Error('initialize blew up');
    const { mod } = await loadModule({ initializeError: failure });

    // The catch swallows the error into console.error so the app still boots.
    await expect(mod.msalInitialization).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith('MSAL initialization failed', failure);
  });

  describe('active-account event callback', () => {
    it('clears the active account on LOGOUT_SUCCESS', async () => {
      const { eventCallback } = await loadModule({ activeAccount: account });

      eventCallback({ eventType: EVENTS.LOGOUT_SUCCESS });

      expect(mocks.setActiveAccount).toHaveBeenCalledWith(null);
    });

    it.each([
      ['LOGIN_SUCCESS', EVENTS.LOGIN_SUCCESS],
      ['ACQUIRE_TOKEN_SUCCESS', EVENTS.ACQUIRE_TOKEN_SUCCESS],
      ['SSO_SILENT_SUCCESS', EVENTS.SSO_SILENT_SUCCESS],
    ])('sets the active account from the payload on %s', async (_name, eventType) => {
      const { eventCallback } = await loadModule({ activeAccount: account });
      const payloadAccount = { username: 'payload@example.com' };

      eventCallback({ eventType, payload: { account: payloadAccount } });

      expect(mocks.setActiveAccount).toHaveBeenCalledWith(payloadAccount);
    });

    it('ignores events whose payload carries no account', async () => {
      const { eventCallback } = await loadModule({ activeAccount: account });

      eventCallback({ eventType: EVENTS.LOGIN_SUCCESS, payload: {} });
      eventCallback({ eventType: EVENTS.LOGIN_SUCCESS });
      eventCallback({});

      expect(mocks.setActiveAccount).not.toHaveBeenCalled();
    });

    it('ignores account-carrying events that are not sign-in signals', async () => {
      const { eventCallback } = await loadModule({ activeAccount: account });

      eventCallback({
        eventType: EVENTS.ACQUIRE_TOKEN_FAILURE,
        payload: { account: { username: 'nope@example.com' } },
      });

      expect(mocks.setActiveAccount).not.toHaveBeenCalled();
    });
  });
});
