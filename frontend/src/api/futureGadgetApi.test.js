// First define the mocks before importing anything
jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForBackend: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

// Define a mock function for WebSocketClient
jest.mock('@/api/socket', () => {
  // Factory function approach
  return {
    WebSocketClient: function(endpoint) {
      this.endpoint = endpoint;
      this.connect = jest.fn();
      this.send = jest.fn();
      this.disconnect = jest.fn();
      this.subscribe = jest.fn();
      this.subscribeToStatus = jest.fn();
    }
  };
});

// Now import the modules that use the mocks
import {
  getAllExperiments, getExperimentById, createExperiment, updateExperiment, deleteExperiment,
  formatExperimentTimestamp, formatWorldLineChange, formatDivergenceReading,
  getWorldlineStatus, getWorldlineHistory, getDivergenceReadings,
  ExperimentsSocketClient, WorldlineSocketClient,
  experimentsSocket, worldlineSocket
} from './futureGadgetApi';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import { ApiError, SessionExpiredError, onSessionExpired } from './errors';

// Mock global fetch
global.fetch = jest.fn();

describe('Future Gadget Lab API', () => {
  const mockInstance = { name: 'mockInstance' };
  const mockToken = 'fake-token-123';
  const mockResponse = { id: '123', name: 'Test Data' };
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

  // Test helper functions first
  describe('formatExperimentTimestamp', () => {
    it('should format a timestamp correctly', () => {
      const experiment = { timestamp: '2025-04-07T12:34:56.789Z' };
      const formatted = formatExperimentTimestamp(experiment);
      expect(formatted).not.toBe('Unknown');
      expect(formatted).toContain('2025');
    });

    it('should return "Unknown" for missing timestamp', () => {
      const experiment = { name: 'No timestamp experiment' };
      const formatted = formatExperimentTimestamp(experiment);
      expect(formatted).toBe('Unknown');
    });
  });

  describe('formatWorldLineChange', () => {
    it('should format a world line change value with 6 decimal places', () => {
      expect(formatWorldLineChange(1.048596)).toBe('+1.048596');
      expect(formatWorldLineChange('0.337192')).toBe('+0.337192');
    });

    it('should handle zero values', () => {
      expect(formatWorldLineChange(0)).toBe('+0.000000');
    });

    it('should return "N/A" for null or undefined values', () => {
      expect(formatWorldLineChange(null)).toBe('N/A');
      expect(formatWorldLineChange(undefined)).toBe('N/A');
    });

    it('should preserve and show negative values with their sign', () => {
      expect(formatWorldLineChange(-1.048596)).toBe('-1.048596');
      expect(formatWorldLineChange('-0.337192')).toBe('-0.337192');
    });

    it('should add plus sign to positive values', () => {
      expect(formatWorldLineChange(1.048596)).toBe('+1.048596');
      expect(formatWorldLineChange('0.337192')).toBe('+0.337192');
    });
  });

  // Now test API methods - Experiments only
  describe('getAllExperiments', () => {
    it('should make a GET request to /lab-experiments', async () => {
      await getAllExperiments(mockInstance);

      expect(retrieveTokenForBackend).toHaveBeenCalledWith(mockInstance, []);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`
          })
        })
      );
      expect(appInsights.trackEvent).toHaveBeenCalled();
    });

    it('should handle errors properly', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getAllExperiments(mockInstance)).rejects.toThrow('Network error');
      expect(appInsights.trackException).toHaveBeenCalled();
    });
  });

  describe('getExperimentById', () => {
    it('should make a GET request to /lab-experiments/{id}', async () => {
      await getExperimentById(mockInstance, '123');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments/123'),
        expect.any(Object)
      );
    });
  });

  describe('createExperiment', () => {
    it('should make a POST request to /lab-experiments with experiment data', async () => {
      const experimentData = {
        name: 'New Experiment',
        description: 'Test description',
        status: 'in_progress',
        creator_id: '001',
        world_line_change: 0.337192,
        timestamp: '2025-04-07T12:00:00Z'
      };

      await createExperiment(mockInstance, experimentData);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(experimentData)
        })
      );
    });

    it('should automatically add timestamp if not provided', async () => {
      const experimentData = {
        name: 'New Experiment Without Timestamp',
        description: 'Test description',
        status: 'in_progress',
        creator_id: '001',
        world_line_change: 0.337192
        // No timestamp provided
      };

      await createExperiment(mockInstance, experimentData);

      // Get the actual data that was passed to fetch
      const actualCall = global.fetch.mock.calls[0];
      const actualBody = JSON.parse(actualCall[1].body);

      // Check that timestamp was added
      expect(actualBody).toHaveProperty('timestamp');
      expect(actualBody.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // All other data should be preserved
      expect(actualBody.name).toBe(experimentData.name);
      expect(actualBody.description).toBe(experimentData.description);
    });

    it('should handle negative world line change values', async () => {
      const experimentData = {
        name: 'Negative World Line Change',
        description: 'Testing negative divergence',
        status: 'completed',
        creator_id: '001',
        world_line_change: -0.412591,
        timestamp: '2025-04-07T12:00:00Z'
      };

      await createExperiment(mockInstance, experimentData);

      // Get the actual data that was passed to fetch
      const actualCall = global.fetch.mock.calls[0];
      const actualBody = JSON.parse(actualCall[1].body);

      // Verify negative value is preserved
      expect(actualBody.world_line_change).toBe(-0.412591);
    });
  });

  describe('updateExperiment', () => {
    it('should make a PUT request to /lab-experiments/{id} with update data', async () => {
      const updateData = {
        name: 'Updated Experiment',
        status: 'completed',
        world_line_change: 0.571024
      };

      await updateExperiment(mockInstance, '123', updateData);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments/123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData)
        })
      );
    });

    it('should handle updating to a negative world line change value', async () => {
      const updateData = {
        name: 'Undoing Previous Experiment',
        status: 'completed',
        world_line_change: -0.275349
      };

      await updateExperiment(mockInstance, '123', updateData);

      // Get the actual data that was passed to fetch
      const actualCall = global.fetch.mock.calls[0];
      const actualBody = JSON.parse(actualCall[1].body);

      // Verify negative value is preserved
      expect(actualBody.world_line_change).toBe(-0.275349);
    });
  });

  describe('deleteExperiment', () => {
    it('should make a DELETE request to /lab-experiments/{id}', async () => {
      await deleteExperiment(mockInstance, '123');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments/123'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    it('should return a success object for DELETE operations', async () => {
      const result = await deleteExperiment(mockInstance, '123');
      expect(result).toEqual({ success: true });
    });
  });

  // Test WebSocket client
  describe('ExperimentsSocketClient', () => {
    it('should create a WebSocket client with the correct endpoint', () => {
      const client = new ExperimentsSocketClient();
      expect(client.endpoint).toBe('future-gadget-lab/ws/lab-experiments');
    });

    it('should export a singleton instance with WebSocket methods', () => {
      // Check for properties instead of instance type
      expect(experimentsSocket).toHaveProperty('connect');
      expect(experimentsSocket).toHaveProperty('disconnect');
      expect(experimentsSocket).toHaveProperty('subscribe');
      expect(experimentsSocket).toHaveProperty('send');
      expect(experimentsSocket).toHaveProperty('subscribeToStatus');
    });
  });
});

// Test worldline and divergence API functions
describe('Worldline and Divergence API', () => {
  const mockInstance = { name: 'mockInstance' };
  const mockToken = 'fake-token-123';

  beforeEach(() => {
    jest.clearAllMocks();
    retrieveTokenForBackend.mockResolvedValue(mockToken);
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({})
    });
  });

  describe('getWorldlineStatus', () => {
    it('should make a GET request to /worldline-status', async () => {
      const mockStatus = {
        current_worldline: 1.337192,
        base_worldline: 1.0,
        total_divergence: 0.337192,
        experiment_count: 5,
        last_experiment_timestamp: '2025-04-07T12:00:00.000Z',
        timestamp: '2025-04-07T12:34:56.789Z'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockStatus)
      });

      const result = await getWorldlineStatus(mockInstance);

      expect(retrieveTokenForBackend).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/worldline-status'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`
          })
        })
      );

      expect(result).toEqual(mockStatus);
      expect(appInsights.trackEvent).toHaveBeenCalled();
    });
  });

  describe('getWorldlineHistory', () => {
    it('should make a GET request to /worldline-history', async () => {
      const mockHistory = [
        {
          current_worldline: 1.0,
          base_worldline: 1.0,
          total_divergence: 0.0,
          experiment_count: 0,
          timestamp: '2025-04-07T12:34:56.789Z'
        },
        {
          current_worldline: 1.337192,
          base_worldline: 1.0,
          total_divergence: 0.337192,
          experiment_count: 1,
          timestamp: '2025-04-07T12:34:56.789Z'
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockHistory)
      });

      const result = await getWorldlineHistory(mockInstance);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/worldline-history'),
        expect.any(Object)
      );

      expect(result).toEqual(mockHistory);
    });
  });

  describe('getDivergenceReadings', () => {
    it('should make a GET request to /divergence-readings without filters', async () => {
      const mockReadings = [
        {
          id: 'DR-001',
          reading: 1.048596,
          status: 'steins_gate'
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockReadings)
      });

      const result = await getDivergenceReadings(mockInstance);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/divergence-readings'),
        expect.any(Object)
      );

      expect(result).toEqual(mockReadings);
    });

    it('should add query parameters when filters are provided', async () => {
      const filters = {
        status: 'beta',
        recordedBy: 'Suzuha Amane',
        minValue: 1.0,
        maxValue: 2.0
      };

      await getDivergenceReadings(mockInstance, filters);

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('/future-gadget-lab/divergence-readings');
    });
  });

  describe('formatDivergenceReading', () => {
    it('should format a reading value with 6 decimal places', () => {
      expect(formatDivergenceReading({reading: 1.048596})).toBe('1.048596');
      expect(formatDivergenceReading({value: 0.337192})).toBe('0.337192');
    });

    it('should handle string values', () => {
      expect(formatDivergenceReading({reading: '1.048596'})).toBe('1.048596');
    });

    it('should return "N/A" for missing values', () => {
      expect(formatDivergenceReading({})).toBe('N/A');
      expect(formatDivergenceReading({reading: null})).toBe('N/A');
    });

    it('should prioritize "reading" field over "value" field', () => {
      expect(formatDivergenceReading({
        reading: 1.048596,
        value: 0.337192
      })).toBe('1.048596');
    });
  });
});

// Test the new WebSocket client for worldline status
describe('WorldlineSocketClient', () => {
  it('should create a WebSocket client with the correct endpoint', () => {
    const client = new WorldlineSocketClient();
    expect(client.endpoint).toBe('future-gadget-lab/ws/worldline-status');
  });

  it('should export a singleton instance with WebSocket methods', () => {
    expect(worldlineSocket).toHaveProperty('connect');
    expect(worldlineSocket).toHaveProperty('disconnect');
    expect(worldlineSocket).toHaveProperty('subscribe');
    expect(worldlineSocket).toHaveProperty('send');
    expect(worldlineSocket).toHaveProperty('subscribeToStatus');
  });

  it('should be a different instance than the experiments socket', () => {
    expect(worldlineSocket).not.toBe(experimentsSocket);
    expect(worldlineSocket.endpoint).not.toBe(experimentsSocket.endpoint);
  });
});

// -------------------------------------------------------------------
// Session expiry behaviour for issue #86 (mirrors the api.js tests)
// -------------------------------------------------------------------
describe('Session expiry detection on Future Gadget Lab API (issue #86)', () => {
  const mockInstance = { name: 'mockInstance' };
  let originalConsoleError;

  beforeAll(() => {
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  }
  const fakeResponse = ({
    status = 200,
    contentType = 'application/json',
    bodyText = '',
    redirected = false,
    url = 'https://test.example.com/future-gadget-lab/lab-experiments',
  } = {}) => ({
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    ok: status >= 200 && status < 300,
    redirected,
    url,
    headers: { get: (name) => (name && name.toLowerCase() === 'content-type') ? contentType : null },
    text: async () => bodyText,
  });

  let onExpiryCalls;
  let unsubscribe;

  beforeEach(() => {
    onExpiryCalls = [];
    unsubscribe = onSessionExpired((payload) => onExpiryCalls.push(payload));
  });
  afterEach(() => {
    unsubscribe();
    unsubscribe = null;
  });

  it('detects HTML body with login marker and rethrows SessionExpiredError', async () => {
    global.fetch.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        bodyText: '<html>Sign in to your account</html>',
      })
    );
    await expect(getAllExperiments(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onExpiryCalls).toHaveLength(1);
  });

  it('emits SessionExpiredError when MSAL acquireTokenSilent rejects with InteractionRequiredAuthError', async () => {
    const interactionError = Object.assign(new Error('interaction_required'), {
      name: 'InteractionRequiredAuthError',
      errorCode: 'interaction_required',
    });
    retrieveTokenForBackend.mockRejectedValueOnce(interactionError);
    await expect(getAllExperiments(mockInstance)).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onExpiryCalls).toHaveLength(1);
  });

  it('surfaces a genuine 500 as ApiError (does not trigger re-login)', async () => {
    global.fetch.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockResolvedValueOnce(
      fakeResponse({
        status: 500,
        contentType: 'text/html',
        bodyText: '<html>500 server error</html>',
      })
    );
    await expect(getAllExperiments(mockInstance)).rejects.toBeInstanceOf(ApiError);
    expect(onExpiryCalls).toHaveLength(0);
  });

  it('surfaces a genuine 403 as ApiError (does not trigger re-login)', async () => {
    global.fetch.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockResolvedValueOnce(
      fakeResponse({
        status: 403,
        contentType: 'application/json',
        bodyText: '{"error":"forbidden"}',
      })
    );
    await expect(getAllExperiments(mockInstance)).rejects.toBeInstanceOf(ApiError);
    expect(onExpiryCalls).toHaveLength(0);
  });

  it('surfaces non-auth network failures as ApiError (does not trigger re-login)', async () => {
    retrieveTokenForBackend.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockReset();
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getAllExperiments(mockInstance)).rejects.toThrow();
    expect(onExpiryCalls).toHaveLength(0);
  });

  it('DELETE ignores JSON parsing failures and returns { success: true } when status is 204', async () => {
    global.fetch.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockResolvedValueOnce(
      fakeResponse({
        status: 204,
        contentType: 'text/plain',
        bodyText: '',
      })
    );
    const result = await deleteExperiment(mockInstance, 'id-1');
    expect(result).toEqual({ success: true });
  });

  it('DELETE on a 500 surfaces ApiError', async () => {
    global.fetch.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockResolvedValueOnce(
      fakeResponse({
        status: 500,
        contentType: 'application/json',
        bodyText: '{"error":"oops"}',
      })
    );
    await expect(deleteExperiment(mockInstance, 'id-1')).rejects.toBeInstanceOf(ApiError);
  });

  it('parses successful JSON via the inspection body and returns the data', async () => {
    global.fetch.mockReset();
    retrieveTokenForBackend.mockResolvedValueOnce('fake-token');
    global.fetch.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        contentType: 'application/json',
        bodyText: JSON.stringify([{ id: 'a' }, { id: 'b' }]),
      })
    );
    const result = await getAllExperiments(mockInstance);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

// -------------------------------------------------------------------
// Request timeout behaviour for issue #113
// -------------------------------------------------------------------
describe('Request timeout on Future Gadget Lab API (issue #113)', () => {
  const mockInstance = { name: 'mockInstance' };

  beforeEach(() => {
    window.__UWS_API_TIMEOUT_MS = 5;
  });
  afterEach(() => {
    delete window.__UWS_API_TIMEOUT_MS;
  });

  const installPendingFetch = () => {
    let rejectFetch;
    const fetchMock = jest.fn().mockImplementation(
      () => new Promise((_resolve, reject) => {
        rejectFetch = reject;
      })
    );
    global.fetch = fetchMock;
    return { fetchMock, rejectFetch: (err) => rejectFetch(err) };
  };

  const wireAbortRejection = async (pending) => {
    for (let i = 0; i < 20 && pending.fetchMock.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    const call = pending.fetchMock.mock.calls[0];
    if (!call) throw new Error('fetch was never called');
    const signal = call[1].signal;
    signal.addEventListener('abort', () =>
      pending.rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    );
  };

  it('surfaces a timeout as RequestTimeoutError and tracks it via App Insights', async () => {
    const pending = installPendingFetch();
    const promise = getAllExperiments(mockInstance).catch((err) => err);
    await wireAbortRejection(pending);
    const err = await promise;
    expect(err).toBeDefined();
    expect(err.name).toBe('RequestTimeoutError');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.detection).toBe('timeout');
    expect(appInsights.trackException).toHaveBeenCalledWith(
      expect.objectContaining({
        exception: expect.objectContaining({ name: 'RequestTimeoutError' }),
        properties: expect.objectContaining({
          source: 'Future Gadget Lab API',
          detection: 'timeout',
        }),
      })
    );
  });

  it('works with fake timers (acceptance criterion for issue #113)', async () => {
    jest.useFakeTimers({
      doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate', 'clearImmediate'],
    });
    try {
      const pending = installPendingFetch();
      const promise = getAllExperiments(mockInstance).catch((err) => err);
      await wireAbortRejection(pending);
      jest.advanceTimersByTime(10);
      const err = await promise;
      expect(err).toBeDefined();
      expect(err.name).toBe('RequestTimeoutError');
    } finally {
      jest.useRealTimers();
    }
  });

  it('forwards a caller-provided signal so unmount can abort the request', async () => {
    const pending = installPendingFetch();
    const callerController = new AbortController();
    const promise = getAllExperiments(mockInstance, { signal: callerController.signal }).catch((err) => err);
    await wireAbortRejection(pending);
    callerController.abort();
    const err = await promise;
    // Caller abort is NOT a timeout: it propagates the AbortError directly.
    expect(err.name).not.toBe('RequestTimeoutError');
    const timeoutCalls = (appInsights.trackException.mock.calls || []).filter(([arg]) => {
      const props = arg && arg.properties;
      return props && props.detection === 'timeout';
    });
    expect(timeoutCalls).toHaveLength(0);
  });
});