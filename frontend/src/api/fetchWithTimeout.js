import { ApiError } from './errors';
import { getRequestTimeoutMs } from './httpConfig';

/**
 * Minimal `fetch`-shaped duck-type the helper accepts for its `signal`
 * option. We intentionally do not depend on the DOM `AbortSignal` type
 * so this module stays trivially unit-testable; the contract is "an
 * object with `aborted` and `addEventListener('abort', …)`".
 *
 * @typedef {object} AbortSignalLike
 * @property {boolean} aborted
 * @property {(type: 'abort', listener: () => void, options?: { once?: boolean }) => void} addEventListener
 * @property {(type: 'abort', listener: () => void) => void} [removeEventListener]
 */

/**
 * Options bag accepted by `fetchWithTimeout`.
 *
 * @typedef {object} FetchWithTimeoutOptions
 * @property {AbortSignalLike} [signal]  Caller-supplied signal. When the
 *   signal aborts, the in-flight fetch is cancelled and the abort error is
 *   re-thrown as-is — callers (e.g. a `useEffect` cleanup) are expected to
 *   treat it as "I'm gone, ignore me".
 * @property {number} [timeoutMs]  Override for the default timeout, in
 *   milliseconds. Defaults to the value returned by `getRequestTimeoutMs()`.
 * @property {string} [operation]  Free-form operation label surfaced on
 *   the timeout error (e.g. `"GET /user-data"`). Useful for telemetry.
 * @property {object} [onTimeout]  Optional callbacks fired when the
 *   timeout (not the caller's signal) trips. `error` is the
 *   `ApiError` we throw; `trackException` is what callers wire into
 *   `appInsights.trackException` so the timeout is visible in telemetry
 *   the same way every other API failure is.
 * @property {(error: ApiError) => void} [onTimeout.trackException]
 */

/**
 * `fetch` wrapped with an `AbortController` so the request is cancelled
 * after `timeoutMs`. Surfaces the timeout as a regular `ApiError` whose
 * `.name === 'RequestTimeoutError'` and whose `.status === 0` — that is
 * how callers (and the API helpers in this folder) detect a timeout vs.
 * a real backend rejection.
 *
 * Behaviour:
 *
 *  - If the timeout fires before `fetch` settles, the helper aborts the
 *    controller, throws an `ApiError('Request timed out after Nms', …)`
 *    with `detection: 'timeout'` on it, and invokes the optional
 *    `onTimeout.trackException` callback so the caller can pipe it to
 *    `appInsights.trackException` (issue #113 requirement: a timeout
 *    surfaces the same way as other failures).
 *  - If the caller's `signal` aborts first, the helper re-throws the
 *    underlying `AbortError` (DOMException with `name === 'AbortError'`)
 *    untouched — that's the contract unmount handlers rely on.
 *  - The `clearTimeout` runs in `finally` regardless of how `fetch`
 *    settles, so a successful or externally-aborted request does not
 *    leak its timer.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {FetchWithTimeoutOptions} [timeoutOptions]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutOptions = {}) {
  const {
    signal: callerSignal,
    timeoutMs = getRequestTimeoutMs(),
    operation,
    onTimeout,
  } = timeoutOptions;

  const controller = new AbortController();
  /** @type {((err: unknown) => boolean) | null} */
  let timedOut = false;

  // Wire the caller's signal (e.g. component-unmount abort) into our
  // internal controller. We rely on `{ once: true }` so the listener
  // removes itself after firing; no manual cleanup needed.
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      const onCallerAbort = () => controller.abort();
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      const timeoutErr = new ApiError(
        `Request timed out after ${timeoutMs}ms`,
        {
          status: 0,
          operation,
          cause: err,
        }
      );
      timeoutErr.name = 'RequestTimeoutError';
      timeoutErr.detection = 'timeout';

      if (onTimeout && typeof onTimeout.trackException === 'function') {
        try {
          onTimeout.trackException(timeoutErr);
        } catch (_) {
          // Swallow telemetry errors — they must never mask the timeout.
        }
      }

      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}