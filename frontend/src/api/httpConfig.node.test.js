/**
 * @jest-environment node
 *
 * The no-window half of getRequestTimeoutMs(): under jsdom `window` always
 * exists, so the `typeof window === 'undefined'` guard can only execute in
 * the plain node environment.
 */

import { getRequestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS } from './httpConfig';

describe('getRequestTimeoutMs without a browser window', () => {
  it('falls back to the documented default', () => {
    expect(typeof window).toBe('undefined');
    expect(getRequestTimeoutMs()).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });
});
