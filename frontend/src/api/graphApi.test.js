//// filepath: c:\projects\ultimate-web-stack\frontend\src\api\graphApi.test.js
import { getProfilePhoto, getAllGroups } from './graphApi';
import { retrieveTokenForGraph } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import { ApiError } from './errors';

// Add the following block to mock the entire module so that retrieveTokenForGraph becomes a jest mock:
jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForGraph: jest.fn(),
  loginRequest: {}
}));

global.fetch = jest.fn();

// Ensure window.getProfilePhoto is undefined so our own implementation runs.
delete window.getProfilePhoto;

// Remove any explicit mock for graphApi so the real implementation is used
jest.unmock('@/api/graphApi');

describe('graphApi', () => {
  let originalConsoleError;
  let originalConsoleLog;

  beforeEach(() => {
    // Save original console methods
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
    
    // Replace with silent mocks for tests
    console.error = jest.fn();
    console.log = jest.fn();
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original console methods
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  describe('getProfilePhoto', () => {
    it('calls trackEvent and fetches profile photo successfully', async () => {
      const mockBlob = new Blob(['fake image data'], { type: 'image/png' });
      const expectedUrl = 'blob:http://localhost/fake-url';

      // Create a fake instance that supports acquireTokenSilent
      const mockInstance = {
        acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'fake-token' })
      };
      // A fake active account with an Admin role
      const mockAccount = { 
        username: 'testuser',
        idTokenClaims: { roles: ['Admin'] }
      };

      global.URL.createObjectURL = jest.fn().mockReturnValue(expectedUrl);
      fetch.mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob)
      });

      const result = await getProfilePhoto(mockInstance, mockAccount);
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Profile - Getting profile image' });
      expect(global.fetch).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me/photo/$value', {
        headers: { Authorization: 'Bearer fake-token' },
        signal: expect.any(AbortSignal),
      });
      expect(result).toBe(expectedUrl);
    });

    it('returns undefined if no active account', async () => {
      // Expect undefined (not null) when activeAccount is falsy
      const result = await getProfilePhoto({}, null);
      expect(result).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('handles fetch errors gracefully', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      await getProfilePhoto({}, { username: 'testuser' });
      expect(appInsights.trackException).toHaveBeenCalled();
      // Optionally verify the console.error was called without seeing the output
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getAllGroups', () => {
    it('requests token with Group.Read.All and fetches group data', async () => {
      // Provide an instance with a getActiveAccount() function
      const mockInstance = {
        getActiveAccount: jest.fn().mockReturnValue({
          idTokenClaims: { roles: ['Admin'] }
        })
      };

      // Instead of spyOn, assign a new mock implementation directly.
      retrieveTokenForGraph.mockResolvedValue('fake-group-token');

      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ value: [{ id: 'group1' }] })
      });

      const result = await getAllGroups(mockInstance);
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Api Call - getAllGroups (Graph API)' });
      // Issue #151: the third argument gates the MSAL popup. The mount-time
      // fetch must pass `interactive: false` so a user missing Graph consent
      // gets a rejected promise instead of a browser window per navigation.
      expect(retrieveTokenForGraph).toHaveBeenCalledWith(
        mockInstance,
        ['Group.Read.All'],
        { interactive: false },
      );
      expect(global.fetch).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/groups', {
        headers: {
          Authorization: 'Bearer fake-group-token',
          'Content-Type': 'application/json'
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual([{ id: 'group1' }]);
    });

    it('forwards interactive: true only when the caller opts in (issue #151)', async () => {
      // The "Grant access" button on the dashboard is the one caller allowed
      // to open a popup, because it runs from a real user gesture. Anything
      // else — notably the Dashboard mount effect — must stay non-interactive.
      const mockInstance = { getActiveAccount: jest.fn().mockReturnValue({}) };
      retrieveTokenForGraph.mockResolvedValue('fake-group-token');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ value: [] })
      });

      await getAllGroups(mockInstance, { interactive: true });

      expect(retrieveTokenForGraph).toHaveBeenCalledWith(
        mockInstance,
        ['Group.Read.All'],
        { interactive: true },
      );
    });

    it.each([
      ['no options', undefined],
      ['an options object without the flag', { timeoutMs: 100 }],
      ['a truthy-but-not-true value', { interactive: 'yes' }],
    ])('does not allow a popup for %s (issue #151)', async (_label, options) => {
      // `interactive` is compared with === true on purpose: a stray truthy
      // value from a caller must not be enough to open a browser window.
      const mockInstance = { getActiveAccount: jest.fn().mockReturnValue({}) };
      retrieveTokenForGraph.mockResolvedValue('fake-group-token');
      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ value: [] })
      });

      await getAllGroups(mockInstance, options);

      expect(retrieveTokenForGraph).toHaveBeenCalledWith(
        mockInstance,
        ['Group.Read.All'],
        { interactive: false },
      );
    });

    it('tracks exception if fetch fails', async () => {
      const mockInstance = {
        getActiveAccount: jest.fn().mockReturnValue({
          idTokenClaims: { roles: ['Admin'] }
        })
      };
      retrieveTokenForGraph.mockResolvedValue('fake-group-token');
      fetch.mockRejectedValue(new Error('Network error'));
      await expect(getAllGroups(mockInstance)).rejects.toThrow();
      expect(appInsights.trackException).toHaveBeenCalled();
      // Optionally verify the console.error was called without seeing the output
      expect(console.error).toHaveBeenCalled();
    });

    it('surfaces a timeout as RequestTimeoutError and tracks it via App Insights', async () => {
      // Configure a tiny timeout so the test runs quickly.
      window.__UWS_API_TIMEOUT_MS = 5;
      try {
        const mockInstance = {
          getActiveAccount: jest.fn().mockReturnValue({
            idTokenClaims: { roles: ['Admin'] }
          })
        };
        retrieveTokenForGraph.mockResolvedValue('fake-group-token');

        let rejectFetch;
        fetch.mockImplementation(
          () => new Promise((_resolve, reject) => {
            rejectFetch = reject;
          })
        );

        const promise = getAllGroups(mockInstance).catch((err) => err);

        // Wait for fetch to be called, then wire the abort listener.
        for (let i = 0; i < 20 && fetch.mock.calls.length === 0; i++) {
          await Promise.resolve();
        }
        const signal = fetch.mock.calls[0][1].signal;
        signal.addEventListener('abort', () =>
          rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );

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
              operation: 'getAllGroups',
              source: 'Graph API',
              detection: 'timeout',
            }),
          })
        );
      } finally {
        delete window.__UWS_API_TIMEOUT_MS;
      }
    });

    it('works with fake timers (acceptance criterion for issue #113)', async () => {
      jest.useFakeTimers({
        doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate', 'clearImmediate'],
      });
      try {
        window.__UWS_API_TIMEOUT_MS = 5;
        try {
          const mockInstance = {
            getActiveAccount: jest.fn().mockReturnValue({
              idTokenClaims: { roles: ['Admin'] }
            })
          };
          retrieveTokenForGraph.mockResolvedValue('fake-group-token');
          let rejectFetch;
          fetch.mockImplementation(
            () => new Promise((_resolve, reject) => {
              rejectFetch = reject;
            })
          );
          const promise = getAllGroups(mockInstance).catch((err) => err);
          for (let i = 0; i < 20 && fetch.mock.calls.length === 0; i++) {
            await Promise.resolve();
          }
          const signal = fetch.mock.calls[0][1].signal;
          signal.addEventListener('abort', () =>
            rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
          jest.advanceTimersByTime(10);
          const err = await promise;
          expect(err).toBeDefined();
          expect(err.name).toBe('RequestTimeoutError');
        } finally {
          delete window.__UWS_API_TIMEOUT_MS;
        }
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------
  // Request timeout for getProfilePhoto (issue #113)
  // -------------------------------------------------------------------
  describe('getProfilePhoto timeout (issue #113)', () => {
    beforeEach(() => {
      window.__UWS_API_TIMEOUT_MS = 5;
    });
    afterEach(() => {
      delete window.__UWS_API_TIMEOUT_MS;
    });

    it('tracks a timeout via App Insights and falls back to undefined', async () => {
      const mockInstance = {
        acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'fake-token' })
      };
      const mockAccount = {
        username: 'testuser',
        idTokenClaims: { roles: ['Admin'] }
      };
      let rejectFetch;
      fetch.mockImplementation(
        () => new Promise((_resolve, reject) => {
          rejectFetch = reject;
        })
      );

      const promise = getProfilePhoto(mockInstance, mockAccount);
      for (let i = 0; i < 20 && fetch.mock.calls.length === 0; i++) {
        await Promise.resolve();
      }
      const signal = fetch.mock.calls[0][1].signal;
      signal.addEventListener('abort', () =>
        rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      );
      const result = await promise;
      // getProfilePhoto's contract is to swallow errors and return
      // undefined, so a timeout yields no value (the calling component
      // falls back to the dummy avatar). Telemetry must still fire.
      expect(result).toBeUndefined();
      expect(appInsights.trackException).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ name: 'RequestTimeoutError' }),
          properties: expect.objectContaining({ detection: 'timeout' }),
        })
      );
    });
  });
});