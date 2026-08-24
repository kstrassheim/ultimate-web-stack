/**
 * Error types for the API layer.
 *
 * - ApiError: a real backend rejection (HTTP 4xx/5xx, network error, JSON parse
 *   error on a non-expiry response). Surface it to the user as an error
 *   message and do NOT trigger a re-login flow.
 *
 * - SessionExpiredError: the backend (or proxy) responded with something that
 *   looks like a session expiry - either an HTTP 302 redirect to a login URL,
 *   a `text/html` body where JSON was expected (typically the Microsoft
 *   sign-in / Easy Auth login page), or the fetch was short-circuited by a
 *   redirect chain that landed on a login endpoint. The fix in
 *   https://github.com/kstrassheim/ultimate-web-stack/issues/86 treats this
 *   case as the trigger for a re-authentication prompt rather than letting
 *   the page render empty.
 */

export class ApiError extends Error {
  constructor(message, { status, cause, operation } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.cause = cause;
    this.operation = operation;
  }
}

export class SessionExpiredError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.detection] - how we detected the expiry:
   *   'redirected' (Response.redirected), 'html-body' (Content-Type: text/html),
   *   or 'login-marker' (body looks like the Microsoft login page).
   * @param {string} [options.targetUrl] - the URL the request actually landed
   *   on after redirects. Useful for telemetry.
   * @param {number} [options.status] - the HTTP status we did see, if any.
   * @param {Error} [options.cause] - the underlying error, e.g. SyntaxError
   *   from a failed response.json() call.
   */
  constructor(message, { detection, targetUrl, status, cause } = {}) {
    super(message);
    this.name = 'SessionExpiredError';
    this.detection = detection;
    this.targetUrl = targetUrl;
    this.status = status;
    this.cause = cause;
  }

  /** Returns true if any value (including causes) is a SessionExpiredError. */
  static is(value) {
    if (value === null || value === undefined) return false;
    if (value instanceof SessionExpiredError) return true;
    // Walk the .cause chain in case something wrapped the error.
    let cursor = value.cause;
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      if (cursor instanceof SessionExpiredError) return true;
      cursor = cursor.cause;
    }
    return false;
  }
}

/**
 * Subscribe a handler to "session expired" events published by the API layer.
 *
 * Handlers are called whenever an API helper detects a SessionExpiredError.
 * They are responsible for triggering re-authentication and navigating the
 * user back to the page they were on. See `auth/authFlow.js` for the
 * production handler.
 *
 * Returns an unsubscribe function.
 */
const sessionExpiredListeners = new Set();

export function onSessionExpired(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('onSessionExpired handler must be a function');
  }
  sessionExpiredListeners.add(handler);
  return () => sessionExpiredListeners.delete(handler);
}

/**
 * Notify all subscribed handlers of a session expiry.
 *
 * Listeners are called synchronously but any work they schedule is allowed
 * to complete asynchronously - we do not await their return.
 */
export function notifySessionExpired(payload) {
  for (const handler of sessionExpiredListeners) {
    try {
      handler(payload);
    } catch (err) {
      // Don't let a misbehaving handler prevent other handlers from running,
      // and don't let it mask the original SessionExpiredError.
       
      console.error('Session expired handler threw:', err);
    }
  }
}

/**
 * Markers we use to recognise the Microsoft / Easy Auth login page when it
 * comes back as the response body. These strings appear in the HTML served
 * by App Service when Easy Auth's `.auth/login/aad` flow is triggered.
 */
export const LOGIN_PAGE_MARKERS = [
  'login.microsoftonline.com',
  'Sign in to your account',
  '.auth/login/aad',
  'AAD SAML SSO',
  'identitybrokerextension',
];

/**
 * Heuristic: does the body look like a Microsoft / Easy Auth login page?
 *
 * Pass the raw text body (truncated) and the Content-Type header value. We
 * avoid pulling this into the main response path on every request - callers
 * invoke it only after we've already flagged the response as suspicious.
 */
export function bodyLooksLikeLoginPage(bodyText, contentType) {
  if (!bodyText) return false;
  if (typeof contentType === 'string' && !/text\/html/i.test(contentType)) {
    // Only HTML bodies can be the login page; other content types are safe.
    return false;
  }
  return LOGIN_PAGE_MARKERS.some((marker) => bodyText.includes(marker));
}

/**
 * Returns true if the given Response appears to represent a session
 * expiry rather than a genuine API error:
 *   - the fetch followed at least one redirect, OR
 *   - the body Content-Type is HTML (the JSON API never returns HTML), OR
 *   - the body's first KB looks like the Microsoft login page.
 *
 * The function consumes the response body and produces a fresh object that
 * carries (ok, status, statusText, contentType, redirected, finalUrl,
 * bodyText) so callers don't need to re-read it. The response itself is
 * closed; further calls on `response.json()` / `response.text()` will throw.
 *
 * @param {Response} response
 * @param {object} [options]
 * @param {boolean} [options.expectsJson=true]
 *   When true (the default for the project API endpoints), even an HTML 200
 *   is treated as session expiry. Used by the API helpers because their
 *   endpoints only ever return JSON.
 * @returns {Promise<{looksLikeExpiry: boolean, detection?: string,
 *   status: number, contentType: string, redirected: boolean,
 *   finalUrl: string, bodyText: string, statusText: string}>}
 */
export async function inspectResponseForExpiry(response, { expectsJson = true } = {}) {
  // Tolerate partial-mock responses in tests by reading what we can and
  // defaulting to empty values when a field is missing. We default a
  // missing status to 200 if `ok === true`, otherwise to 500 - the existing
  // tests use bare `{ ok: true, json: ... }` shapes and the helpers below
  // key off the `ok` flag.
  let status;
  if (response && typeof response.status === 'number') {
    status = response.status;
  } else if (response && response.ok === true) {
    status = 200;
  } else if (response && response.ok === false) {
    status = 500;
  } else {
    status = 0;
  }
  const statusText = (response && response.statusText) || '';
  const redirected = !!(response && response.redirected);
  const finalUrl = (response && response.url) || '';
  let contentType = '';
  try {
    const headers = response && response.headers;
    if (headers && typeof headers.get === 'function') {
      contentType = headers.get('content-type') || '';
    }
  } catch (_) {
    contentType = '';
  }

  // Always read the body once so the caller doesn't have to.
  let bodyText = '';
  try {
    if (response && typeof response.text === 'function') {
      bodyText = await response.text();
    }
  } catch (_) {
    bodyText = '';
  }

  const looksHtml = /text\/html/i.test(contentType);
  const loginMarkerHit = bodyLooksLikeLoginPage(bodyText, contentType);

  let detection;
  if (redirected && finalUrl && /login|\.auth\/login|AAD|NonSecured/i.test(finalUrl)) {
    detection = 'redirected-to-login';
  } else if (looksHtml && (status === 200 || status === 0) && expectsJson && loginMarkerHit) {
    detection = 'login-marker';
  } else if (looksHtml && (status === 200 || status === 0) && expectsJson) {
    // HTML body on a JSON endpoint with no obvious marker is still treated
    // as a likely expiry with the less-specific "html-body" detection -
    // better than silently rendering an empty page.
    detection = 'html-body';
  } else if (redirected) {
    // Any redirect on a same-origin API call is suspicious.
    detection = 'redirected';
  }

  return {
    looksLikeExpiry: Boolean(detection),
    detection,
    status,
    statusText,
    redirected,
    finalUrl,
    contentType,
    bodyText,
  };
}

/**
 * Convenience read for callers that already have a `Response` (and have
 * already inspected it for expiry) and now want to decode the JSON body.
 *
 * @param {object} inspection - the inspection object from
 *   `inspectResponseForExpiry`.
 */
export function inspectionJson(inspection) {
  if (!inspection || inspection.bodyText === undefined) {
    throw new ApiError('Cannot decode JSON without a captured body');
  }
  try {
    return JSON.parse(inspection.bodyText);
  } catch (err) {
    throw new ApiError(
      `Failed to parse API response as JSON: ${err.message}`,
      { status: inspection.status, cause: err }
    );
  }
}