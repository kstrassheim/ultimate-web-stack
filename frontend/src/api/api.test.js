import { getUserData, getAdminData } from './api';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';

// Mock dependencies
jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForBackend: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

// Mock global fetch
global.fetch = jest.fn();

// Make sure we're testing the actual implementation, not the mock
jest.unmock('./api');

describe('API Module', () => {
  // Add getActiveAccount to the mock instance
  const mockInstance = { 
    name: 'mockInstance',
    getActiveAccount: jest.fn().mockReturnValue({
      idTokenClaims: { roles: ['Admin'] }
    })
  };
  const mockToken = 'fake-token-123';
  const mockResponse = { message: 'Hello from API' };
  let originalConsoleError;
  
  beforeAll(() => {
    // Store original console.error
    originalConsoleError = console.error;
    // Replace with silent mock for all tests
    console.error = jest.fn();
  });
  
  afterAll(() => {
    // Restore original console.error
    console.error = originalConsoleError;
  });
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementation
    retrieveTokenForBackend.mockResolvedValue(mockToken);
    
    // Setup fetch default success response
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse)
    });
  });

  // Helper to verify common aspects of API calls
  const verifyCommonApiCall = (url, method = 'GET', body = null) => {
    // Check that the right scopes were used based on URL
    expect(retrieveTokenForBackend).toHaveBeenCalledWith(
      mockInstance, 
      url.includes('admin') ? ['Group.Read.All'] : []
    );
    
    // Check event name matches expected pattern
    const eventNamePrefix = method === 'GET' ? 'get' : 'post';
    const capitalizedUrl = url.charAt(0).toUpperCase() + url.slice(1);
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ 
      name: `Api Call - ${eventNamePrefix}${capitalizedUrl}` 
    });
    
    // Verify fetch call options
    const expectedOptions = {
      method,
      headers: {
        'Authorization': `Bearer ${mockToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
      expectedOptions.body = JSON.stringify(body);
    }
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api${url}`),
      expect.objectContaining(expectedOptions)
    );
  };

  describe('getUserData', () => {
    it('should fetch user data with correct authorization', async () => {
      const result = await getUserData(mockInstance);
      
      verifyCommonApiCall('/user-data');
      expect(result).toEqual(mockResponse);
    });

    it('should return undefined on network error', async () => {
      // Reset success response mock first to avoid interference
      global.fetch.mockReset();
      
      // Set up the mock to reject with a network error
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await getUserData(mockInstance);
      
      expect(result).toBeUndefined();
      expect(appInsights.trackException).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should return undefined on server error', async () => {
      // Reset success response mock first
      global.fetch.mockReset();
      
      // Set up the mock to resolve with an error response
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await getUserData(mockInstance);
      
      expect(result).toBeUndefined();
      expect(appInsights.trackException).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getAdminData', () => {
    it('should send POST request with correct body and token', async () => {
      const message = 'Test message';
      const status = 200;
      const expectedBody = { message, status };
      
      // Customize mock response for this test
      const adminResponse = { 
        message: `Hello Admin: ${message}`, 
        status, 
        received: true 
      };
      
      // Reset previous mocks first
      global.fetch.mockReset();
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(adminResponse)
      });

      const result = await getAdminData(mockInstance, message, status);
      
      verifyCommonApiCall('/admin-data', 'POST', expectedBody);
      expect(result).toEqual(adminResponse);
    });

    it('should use default parameters if not provided', async () => {
      const defaultMessage = "Hello from frontend";
      const defaultStatus = 123;
      const expectedBody = { message: defaultMessage, status: defaultStatus };
      
      await getAdminData(mockInstance);
      
      verifyCommonApiCall('/admin-data', 'POST', expectedBody);
    });
    
    it('should throw errors instead of returning undefined', async () => {
      // Reset previous mocks
      global.fetch.mockReset();
      
      // Simulate server error response
      const errorResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      };
      
      global.fetch.mockResolvedValueOnce(errorResponse);
      
      // Use rejects matcher with expect-promises pattern
      await expect(getAdminData(mockInstance)).rejects.toThrow();
      
      expect(appInsights.trackException).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
    
    it('should throw network errors', async () => {
      // Simulate network error
      const networkError = new Error('Network failure');
      global.fetch.mockRejectedValueOnce(networkError);
      
      await expect(getAdminData(mockInstance)).rejects.toThrow();
      
      expect(appInsights.trackException).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});