import { getUserData, getAdminData } from './api';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import { ApiError, SessionExpiredError, notifySessionExpired } from './errors';

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

/** Build a fake `Response` that implements the bits `inspectResponseForExpiry` reads. */
const fakeResponse = ({ status = 200, contentType = 'application/json', bodyText = '', redirected = false, url = 'https://test.example.com/api/foo' } = {}) => ({
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  ok: status >= 200 && status < 300,
  redirected,
  url,
  headers: {
    get: (name) => (name && name.toLowerCase() === 'content-type') ? contentType : null,
  },
  text: async () => bodyText,
});

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

  // -------------------------------------------------------------------
  // Request timeout behaviour for issue #113
  // -------------------------------------------------------------------
  describe('Request timeout (issue #113)', () => {
    beforeEach(() => {
      // Trim the timeout so the test runs quickly. The override is read
      // by `getRequestTimeoutMs()` in the helper at request time.
      window.__UWS_API_TIMEOUT_MS = 5;
    });
    afterEach(() => {
      delete window.__UWS_API_TIMEOUT_MS;
    });

    /** Configure the global fetch mock so it never resolves on its own,
     *  and wire its signal to a reject handler so the test can drive
     *  both timeout and caller-abort paths from outside. */
    const installPendingFetch = () => {
      let rejectFetch;
      const fetchMock = jest.fn().mockImplementation(
        () => new Promise((_resolve, reject) => {
          rejectFetch = reject;
        })
      );
      global.fetch = fetchMock;
      return {
        fetchMock,
        rejectFetch: (err) => rejectFetch(err),
      };
    };

    /** Helper: wait for the helper to have invoked fetch, then attach an
     *  abort listener that rejects with a DOMException-shaped
     *  AbortError. Real fetch does the same when the signal it
     *  received is aborted. */
    const wireAbortRejection = async (pending) => {
      // Poll until the fetch mock has been invoked; the helper awaits
      // `retrieveTokenForBackend` first so the fetch call happens one
      // microtask after `getUserData` returns.
      for (let i = 0; i < 20 && pending.fetchMock.mock.calls.length === 0; i++) {
        await Promise.resolve();
      }
      const call = pending.fetchMock.mock.calls[0];
      if (!call) throw new Error('fetch was never called by the helper');
      const signal = call[1].signal;
      signal.addEventListener('abort', () =>
        pending.rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      );
    };

    it('surfaces a timeout as RequestTimeoutError and tracks it via App Insights', async () => {
      const pending = installPendingFetch();
      const promise = getUserData(mockInstance);
      await wireAbortRejection(pending);

      const result = await promise;

      // getUserData's contract: errors are swallowed to `undefined` for
      // user-data URLs. The helper has already pushed the error through
      // App Insights.
      expect(result).toBeUndefined();
      expect(pending.fetchMock).toHaveBeenCalledTimes(1);
      expect(appInsights.trackException).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'RequestTimeoutError',
            detection: 'timeout',
          }),
          properties: expect.objectContaining({
            operation: expect.any(String),
            source: 'API',
            detection: 'timeout',
          }),
        })
      );
    });

    it('tracks the timeout via App Insights even on admin endpoints (which rethrow)', async () => {
      const pending = installPendingFetch();
      const promise = getAdminData(mockInstance).catch((err) => err);
      await wireAbortRejection(pending);

      const err = await promise;
      expect(err).toBeDefined();
      expect(err.name).toBe('RequestTimeoutError');
      expect(err).toBeInstanceOf(ApiError);
      expect(appInsights.trackException).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ name: 'RequestTimeoutError' }),
        })
      );
    });

    it('does not classify an AbortError from the underlying fetch as a timeout when no timeout fired', async () => {
      const pending = installPendingFetch();
      const callerController = new AbortController();
      const promise = getUserData(mockInstance, { signal: callerController.signal });
      await wireAbortRejection(pending);

      callerController.abort();

      const result = await promise;
      expect(result).toBeUndefined();
      // The App Insights timeout-telemetry should NOT have fired.
      const timeoutCalls = (appInsights.trackException.mock.calls || []).filter(([arg]) => {
        const props = arg && arg.properties;
        return props && props.detection === 'timeout';
      });
      expect(timeoutCalls).toHaveLength(0);
    });

    it('works with fake timers (acceptance criterion for issue #113)', async () => {
      // Issue #113 acceptance criterion: "Tests cover the timeout path
      // with fake timers." This test exercises the same path using
      // Jest's fake timers rather than real ones, to confirm the
      // timeout firing and the App Insights trackException call land
      // even when no wall-clock time has actually passed.
      jest.useFakeTimers({
        // Don't fake Promise microtask machinery — we still need awaits
        // to drain normally so the helper's catch handler runs.
        doNotFake: [
          'queueMicrotask',
          'nextTick',
          'setImmediate',
          'clearImmediate',
        ],
      });
      try {
        const pending = installPendingFetch();
        const promise = getUserData(mockInstance);
        await wireAbortRejection(pending);

        // Advance fake time past the configured 5ms timeout.
        jest.advanceTimersByTime(10);
        // Let the helper's catch handler run.
        await promise;

        expect(appInsights.trackException).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ name: 'RequestTimeoutError' }),
          })
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------
  // Session expiry behaviour for issue #86
  // -------------------------------------------------------------------
  describe('Session expiry detection (issue #86)', () => {
    let onExpiryCalls;
    let unsubscribe;

    beforeEach(() => {
      onExpiryCalls = [];
      unsubscribe = require('./errors').onSessionExpired((payload) => {
        onExpiryCalls.push(payload);
      });
    });
    afterEach(() => {
      unsubscribe();
      unsubscribe = null;
    });

    it('rethrows SessionExpiredError and emits a notification on HTML body (login marker)', async () => {
      // Server replies 200 with HTML containing "Sign in to your account".
      // This is the case described in issue #86 — Easy Auth returned the
      // Microsoft login page where JSON was expected.
      global.fetch.mockReset();
      global.fetch.mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          bodyText: '<html><head><title>Sign in to your account</title></head></html>',
        })
      );

      await expect(getUserData(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
      expect(onExpiryCalls).toHaveLength(1);
      expect(onExpiryCalls[0].error).toBeInstanceOf(SessionExpiredError);
    });

    it('differentiates a genuine 401 from expiry (does not trigger re-login)', async () => {
      global.fetch.mockReset();
      global.fetch.mockResolvedValueOnce(
        fakeResponse({
          status: 401,
          contentType: 'application/json',
          bodyText: '{"error":"unauthorized"}',
        })
      );

      const result = await getUserData(mockInstance);
      expect(result).toBeUndefined();
      expect(onExpiryCalls).toHaveLength(0);
    });

    it('differentiates a genuine 403 from expiry on admin endpoints', async () => {
      global.fetch.mockReset();
      global.fetch.mockResolvedValueOnce(
        fakeResponse({
          status: 403,
          contentType: 'application/json',
          bodyText: '{"error":"forbidden"}',
        })
      );
      await expect(getAdminData(mockInstance)).rejects.toBeInstanceOf(ApiError);
      expect(onExpiryCalls).toHaveLength(0);
    });

    it('detects a redirect to /.auth/login/aad as session expiry', async () => {
      global.fetch.mockReset();
      global.fetch.mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          bodyText: '<html></html>',
          redirected: true,
          url: 'https://app.example.com/.auth/login/aad?post_login_redirect_url=/dashboard',
        })
      );
      await expect(getUserData(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
      expect(onExpiryCalls).toHaveLength(1);
    });

    it('emits SessionExpiredError when MSAL acquires fail with InteractionRequiredAuthError', async () => {
      // Simulate the refresh-token-missing case from acquireTokenSilent.
      const interactionError = Object.assign(new Error('interaction_required'), {
        name: 'InteractionRequiredAuthError',
        errorCode: 'interaction_required',
      });
      retrieveTokenForBackend.mockRejectedValueOnce(interactionError);

      await expect(getUserData(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
      expect(onExpiryCalls).toHaveLength(1);
    });

    it('does not classify a plain network failure as session expiry', async () => {
      // Plain `TypeError: Failed to fetch`-style error from a network
      // blip should NOT be misread as expiry.
      retrieveTokenForBackend.mockReset();
      retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
      global.fetch.mockReset();
      global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await getUserData(mockInstance);
      expect(result).toBeUndefined();
      expect(onExpiryCalls).toHaveLength(0);
    });

    it('does not classify a non-InteractionRequired token error as session expiry', async () => {
      // A bare Error from acquireTokenSilent (not an interaction-required
      // one) must NOT be misread as session expiry.
      const tokenError = new Error('network down');
      retrieveTokenForBackend.mockReset();
      retrieveTokenForBackend.mockRejectedValueOnce(tokenError);

      const result = await getUserData(mockInstance);
      expect(result).toBeUndefined();
      expect(onExpiryCalls).toHaveLength(0);
      // Console error must have been reported for telemetry.
      expect(console.error).toHaveBeenCalled();
    });

    it('classifies MSAL errors with errorCode === "interaction_required" as expiry', async () => {
      // Some MSAL error shapes put the marker on errorCode rather than
      // errorMessage. Make sure both paths trigger the SessionExpiredError
      // path.
      const tokenError = Object.assign(new Error('some msal shape'), {
        name: 'MsalInteractionRequiredError',
        errorCode: 'interaction_required',
      });
      retrieveTokenForBackend.mockReset();
      retrieveTokenForBackend.mockRejectedValueOnce(tokenError);

      await expect(getUserData(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
      expect(onExpiryCalls).toHaveLength(1);
    });

    it('classifies MSAL errors whose message mentions interaction_required as expiry', async () => {
      // MSAL browser sometimes surfaces interaction-required via the
      // errorMessage field. Cover that branch too.
      const tokenError = Object.assign(new Error('Some failure'), {
        name: 'ServerError',
        errorMessage: 'interaction_required: please sign in again',
      });
      retrieveTokenForBackend.mockReset();
      retrieveTokenForBackend.mockRejectedValueOnce(tokenError);

      await expect(getUserData(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
      expect(onExpiryCalls).toHaveLength(1);
    });

    it('surfaces admin JSON parse failures as ApiError', async () => {
      global.fetch.mockReset();
      retrieveTokenForBackend.mockReset();
      retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
      // Real Response with HTML body — that path goes through the
      // SessionExpired branch. Use a genuine 200 + JSON Content-Type
      // whose body is not JSON: that's a parse failure, not an expiry.
      global.fetch.mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          contentType: 'application/json',
          bodyText: 'not actually json',
        })
      );
      await expect(getAdminData(mockInstance)).rejects.toBeInstanceOf(ApiError);
      expect(onExpiryCalls).toHaveLength(0);
    });

    it('returns undefined for user-data JSON parse failures on 200 + JSON content-type', async () => {
      global.fetch.mockReset();
      retrieveTokenForBackend.mockReset();
      retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
      global.fetch.mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          contentType: 'application/json',
          bodyText: 'not actually json',
        })
      );
      const result = await getUserData(mockInstance);
      expect(result).toBeUndefined();
      expect(onExpiryCalls).toHaveLength(0);
    });
  });
});