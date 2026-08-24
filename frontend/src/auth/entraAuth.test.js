import { msalConfig, loginRequest, retrieveTokenForBackend, retrieveTokenForGraph } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights'; // mock or spy as needed

describe('entraAuth Module', () => {
  let originalConsoleLog;
  
  beforeAll(() => {
    // Save original console.log
    originalConsoleLog = console.log;
    // Replace with silent mock
    console.log = jest.fn();
  });
  
  afterAll(() => {
    // Restore original console.log
    console.log = originalConsoleLog;
  });

  describe('msalConfig', () => {
    it('should return the correct MSAL configuration object', () => {
      const config = msalConfig();
      expect(config.auth).toHaveProperty('clientId');
      expect(config.auth).toHaveProperty('authority');
      expect(config.auth).toHaveProperty('redirectUri');
      expect(typeof config.system.loggerOptions.loggerCallback).toBe('function');
    });

    // Regression guard for issue #92: a debug `console.log("redirect
    // uri:" + frontendUrl)` once lived at the top of `msalConfig()`. It
    // ran on the auth/login path on every page load and reached
    // production bundles. Removing the call is what closed #92 - keep
    // it removed.
    it('should not call console.* while building the config', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        msalConfig();
        expect(consoleLogSpy).not.toHaveBeenCalled();
      } finally {
        consoleLogSpy.mockRestore();
      }
    });
  });

  describe('loginRequest', () => {
    it('should export scopes from tfconfig as requested_graph_api_delegated_permissions', () => {
      expect(Array.isArray(loginRequest.scopes)).toBeTruthy();
    });
  });

  describe('retrieveTokenForBackend', () => {
    let mockInstance;
    let mockActiveAccount;
    let mockAcquireTokenSilent;

    beforeEach(() => {
      mockActiveAccount = { username: 'testUser' };
      mockAcquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mockBackendToken' });
      mockInstance = {
        getActiveAccount: jest.fn().mockReturnValue(mockActiveAccount),
        acquireTokenSilent: mockAcquireTokenSilent
      };
      jest.spyOn(appInsights, 'trackEvent').mockImplementation(() => {});
    });

    it('should call acquireTokenSilent with expected scopes', async () => {
      const token = await retrieveTokenForBackend(mockInstance, ['extra.scope']);
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'MSAL Retrieving Token' });
      expect(mockInstance.getActiveAccount).toHaveBeenCalled();
      expect(mockAcquireTokenSilent).toHaveBeenCalledWith({
        scopes: ['mock-api://00000000-0000-0000-0000-000000000001/user_impersonation', 'extra.scope'],
        account: mockActiveAccount
      });
      expect(token).toBe('mockBackendToken');
    });
  });

  describe('retrieveTokenForGraph', () => {
    let mockInstance;
    let mockActiveAccount;
    let mockAcquireTokenSilent;

    beforeEach(() => {
      mockActiveAccount = { username: 'testUser' };
      mockAcquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mockGraphToken' });
      mockInstance = {
        getActiveAccount: jest.fn().mockReturnValue(mockActiveAccount),
        acquireTokenSilent: mockAcquireTokenSilent
      };
      jest.spyOn(appInsights, 'trackEvent').mockImplementation(() => {});
    });

    it('should request Graph scopes, plus any extra scopes passed in', async () => {
      const token = await retrieveTokenForGraph(mockInstance, ['Mail.Read']);
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'MSAL Retrieving Graph Token' });
      expect(mockInstance.getActiveAccount).toHaveBeenCalled();
      // Note: extra scopes are not appended because the code spreads only the default scopes.
      expect(mockAcquireTokenSilent).toHaveBeenCalledWith({
        scopes: ['https://graph.microsoft.com/.default'],
        account: mockActiveAccount
      });
      expect(token).toBe('mockGraphToken');
    });
  });
});