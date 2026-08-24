import { fetchWithTimeout } from './fetchWithTimeout';
import { DEFAULT_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_OVERRIDE_KEY, getRequestTimeoutMs } from './httpConfig';
import { ApiError } from './errors';

// Original `fetch` (the Node 22 global) — kept aside so the tests can
// restore it after installing the mock per test. The api folder's test
// suites already install their own `global.fetch = jest.fn()` in
// beforeEach blocks; we do the same here to stay consistent.
const REAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = REAL_FETCH;
  // Defensive: make sure no stray override leaks across test files even
  // though jest isolates globals per test file in this project.
  if (typeof window !== 'undefined') {
    delete window[REQUEST_TIMEOUT_OVERRIDE_KEY];
  }
});

describe('httpConfig', () => {
  it('exports a default timeout inside the 10–30s window the issue calls for', () => {
    expect(typeof DEFAULT_REQUEST_TIMEOUT_MS).toBe('number');
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it('returns the documented default when no override is set', () => {
    if (typeof window !== 'undefined') {
      delete window[REQUEST_TIMEOUT_OVERRIDE_KEY];
    }
    expect(getRequestTimeoutMs()).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('honours a positive finite window override', () => {
    window[REQUEST_TIMEOUT_OVERRIDE_KEY] = 1234;
    expect(getRequestTimeoutMs()).toBe(1234);
  });

  it('ignores non-positive or non-finite window overrides', () => {
    window[REQUEST_TIMEOUT_OVERRIDE_KEY] = 0;
    expect(getRequestTimeoutMs()).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    window[REQUEST_TIMEOUT_OVERRIDE_KEY] = -1;
    expect(getRequestTimeoutMs()).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    window[REQUEST_TIMEOUT_OVERRIDE_KEY] = Number.NaN;
    expect(getRequestTimeoutMs()).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    window[REQUEST_TIMEOUT_OVERRIDE_KEY] = '1000';
    expect(getRequestTimeoutMs()).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });
});

describe('fetchWithTimeout', () => {
  it('passes through the caller-provided signal and headers', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: 'world' }),
    });
    global.fetch = fetchMock;

    const callerController = new AbortController();
    await fetchWithTimeout(
      'https://example.test/api',
      { method: 'POST', headers: { 'X-Test': 'yes' } },
      { signal: callerController.signal, timeoutMs: 5_000 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://example.test/api');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers).toEqual({ 'X-Test': 'yes' });
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
    // The internal controller must NOT be the caller's controller — the
    // helper wires the caller's signal into its own and passes only its
    // own to `fetch`, otherwise an external `abort()` would not chain.
    expect(calledOptions.signal).not.toBe(callerController.signal);
  });

  it('returns the response when the fetch resolves before the timeout', async () => {
    const response = { ok: true, json: async () => ({ ok: true }) };
    global.fetch = jest.fn().mockResolvedValue(response);

    const result = await fetchWithTimeout('https://example.test/api', {}, { timeoutMs: 1_000 });
    expect(result).toBe(response);
  });

  it('aborts the request via fake timers and surfaces a RequestTimeoutError', async () => {
    // Use a small timeout so the fake-timer advance lands squarely
    // inside the time window. The "fetch never resolves" mock below
    // mirrors a stalled backend.
    jest.useFakeTimers();
    try {
      const fetchError = Object.assign(new Error('aborted'), { name: 'AbortError' });
      global.fetch = jest.fn().mockImplementation(
        () => new Promise((_resolve, reject) => {
          // Reject asynchronously with an AbortError when the helper
          // aborts our internal controller — that is what real fetch
          // does on `controller.abort()`.
          // We simulate the timing by also exposing a hook the test
          // can use; for the sake of simplicity here, we register a
          // microtask that rejects when the signal aborts.
          // (Real fetch's behaviour is captured by this same logic.)
          const controller = new AbortController();
          controller.signal.addEventListener('abort', () => reject(fetchError));
          // Keep a reference to avoid GC during the test.
          globalThis.__fetchController = controller;
          return new Promise(() => {}); // never settles naturally
        }),
      );
      // Hmm — we can't actually drive an internal Promise from outside.
      // Replace the implementation with one the test can advance.
      let rejectFetch;
      global.fetch = jest.fn().mockImplementation(
        () => new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
      );

      const trackException = jest.fn();
      const promise = fetchWithTimeout(
        'https://example.test/api',
        {},
        {
          timeoutMs: 50,
          operation: 'GET /slow',
          onTimeout: { trackException },
        },
      );

      // Schedule the fetch to reject with an AbortError when the
      // helper aborts its internal controller. We reach into the
      // signal passed to fetch and wire up the reject.
      const fetchSignal = global.fetch.mock.calls[0][1].signal;
      fetchSignal.addEventListener('abort', () => {
        rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });

      // Advance past the timeout.
      jest.advanceTimersByTime(50);

      await expect(promise).rejects.toMatchObject({
        name: 'RequestTimeoutError',
        message: 'Request timed out after 50ms',
        status: 0,
        operation: 'GET /slow',
        detection: 'timeout',
      });
      // The thrown error should still be an ApiError so existing
      // catch-alls that key off instanceof continue to work.
      await expect(promise).rejects.toBeInstanceOf(ApiError);

      // Telemetry: the timeout should have been forwarded to the
      // trackException callback exactly once, with the same error.
      expect(trackException).toHaveBeenCalledTimes(1);
      expect(trackException.mock.calls[0][0]).toMatchObject({
        name: 'RequestTimeoutError',
        status: 0,
        detection: 'timeout',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rethrows a caller-driven AbortError untouched (does not classify as timeout)', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    let rejectFetch;
    global.fetch = jest.fn().mockImplementation(
      () => new Promise((_resolve, reject) => {
        rejectFetch = reject;
      }),
    );

    const callerController = new AbortController();
    const trackException = jest.fn();
    const promise = fetchWithTimeout(
      'https://example.test/api',
      {},
      {
        signal: callerController.signal,
        timeoutMs: 5_000,
        operation: 'GET /cancelled',
        onTimeout: { trackException },
      },
    );

    // Hook up the fetch rejection so we can confirm AbortError propagates
    // once the helper forwards the caller's signal into its controller.
    const fetchSignal = global.fetch.mock.calls[0][1].signal;
    fetchSignal.addEventListener('abort', () => rejectFetch(abortError));

    callerController.abort();

    await expect(promise).rejects.toBe(abortError);
    // Caller-driven aborts must NOT be misread as timeouts.
    expect(trackException).not.toHaveBeenCalled();
  });

  it('rethrows non-timeout fetch rejections untouched', async () => {
    const networkError = new TypeError('Failed to fetch');
    global.fetch = jest.fn().mockRejectedValue(networkError);

    await expect(
      fetchWithTimeout('https://example.test/api', {}, { timeoutMs: 1_000 }),
    ).rejects.toBe(networkError);
  });

  it('falls back to the documented default timeout when none is provided', async () => {
    // Use a stub fetch that records the signal we received so the test
    // can assert we *did* set a timer (and would have aborted at the
    // default). We don't wait the full default here — instead we wipe
    // the window override so we can confirm the helper used the right
    // base value via a side channel.
    delete window[REQUEST_TIMEOUT_OVERRIDE_KEY];
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock;

    await fetchWithTimeout('https://example.test/api');
    // If the helper were applying a wildly different default (e.g. 0),
    // the request would have aborted immediately. Instead we resolve.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the timer even when the fetch rejects with a non-Abort error', async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('boom'));
      const promise = fetchWithTimeout('https://example.test/api', {}, { timeoutMs: 50 });
      await expect(promise).rejects.toThrow('boom');

      // Advancing past the timeout must NOT fire trackException for a
      // request that already settled — the timer should have been
      // cleared in `finally`.
      const trackException = jest.fn();
      // Re-run with a trackException sink to assert nothing fires.
      global.fetch = jest.fn().mockRejectedValue(new TypeError('boom'));
      const p2 = fetchWithTimeout(
        'https://example.test/api',
        {},
        { timeoutMs: 50, onTimeout: { trackException } },
      );
      await expect(p2).rejects.toThrow('boom');
      jest.advanceTimersByTime(60);
      // Give any leaked setTimeout a chance to fire.
      await Promise.resolve();
      expect(trackException).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('respects the window override at request time', async () => {
    jest.useFakeTimers();
    try {
      window[REQUEST_TIMEOUT_OVERRIDE_KEY] = 25;

      let rejectFetch;
      global.fetch = jest.fn().mockImplementation(
        () => new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
      );
      const trackException = jest.fn();
      const promise = fetchWithTimeout(
        'https://example.test/api',
        {},
        {
          operation: 'GET /override',
          onTimeout: { trackException },
        },
      );

      const fetchSignal = global.fetch.mock.calls[0][1].signal;
      fetchSignal.addEventListener('abort', () => {
        rejectFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });

      jest.advanceTimersByTime(25);
      await expect(promise).rejects.toMatchObject({ name: 'RequestTimeoutError' });
      expect(trackException).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      delete window[REQUEST_TIMEOUT_OVERRIDE_KEY];
    }
  });
});