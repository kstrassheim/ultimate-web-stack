/**
 * Shared HTTP-client configuration for the frontend API layer.
 *
 * This is the one place the request timeout is defined (issue #113). The
 * default is 20s — well inside the 10–30s window the issue calls for and
 * long enough to ride out a slow first paint on the backend cold-start, but
 * short enough that a hung connection cannot lock the UI indefinitely.
 *
 * The value is consulted at request time via `getRequestTimeoutMs()`, so
 * tests and runtime overrides can plug in a different number without
 * touching call sites:
 *
 *   - Tests: `jest` can set `window.__UWS_API_TIMEOUT_MS = 50` to exercise
 *     the timeout path without real timers.
 *   - Runtime override: a future feature-flag or env-driven tuning can
 *     stash a number on `window.__UWS_API_TIMEOUT_MS` before any request
 *     fires; subsequent calls pick it up automatically.
 */

/**
 * Default per-request timeout, in milliseconds.
 *
 * @type {number}
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Window property that, if set to a finite positive number, overrides
 * `DEFAULT_REQUEST_TIMEOUT_MS` for the lifetime of the page. Intended for
 * tests and (future) runtime tuning; the frontend build never writes to it.
 *
 * @type {string}
 */
export const REQUEST_TIMEOUT_OVERRIDE_KEY = '__UWS_API_TIMEOUT_MS';

/**
 * Returns the request timeout to use, in milliseconds.
 *
 * Resolution order:
 *   1. `window[REQUEST_TIMEOUT_OVERRIDE_KEY]`, when set to a positive finite
 *      number (lets tests opt into a small timeout).
 *   2. `DEFAULT_REQUEST_TIMEOUT_MS` (the documented default).
 *
 * @returns {number}
 */
export function getRequestTimeoutMs() {
  if (typeof window !== 'undefined') {
    const override = window[REQUEST_TIMEOUT_OVERRIDE_KEY];
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
      return override;
    }
  }
  return DEFAULT_REQUEST_TIMEOUT_MS;
}