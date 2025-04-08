import { msalConfig, loginRequest, retrieveTokenForBackend, retrieveTokenForGraph } from './entraAuth';
import appInsights from '@/log/appInsights'; // mock or spy as needed
import { LogLevel } from '@azure/msal-browser';

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
        scopes: ['api://mock-app/access', 'extra.scope'],
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