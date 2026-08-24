import { backendUrl } from '@/config';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import {
  ApiError,
  SessionExpiredError,
  inspectResponseForExpiry,
  inspectionJson,
  notifySessionExpired,
} from '@/api/errors';
import { fetchWithTimeout } from '@/api/fetchWithTimeout';

// Base URL for API endpoints
const BASE_URL = `${backendUrl}/api`;

/**
 * Read the response body once, determine whether the result represents a
 * session expiry (login page HTML, login-redirect, etc.), and emit a
 * SessionExpiredError event if so. The returned text is a small slice of the
 * body — plenty for telemetry, but bounded so we don't burn context.
 */
const summarizeBody = (bodyText) => {
  if (!bodyText) return '';
  const trimmed = bodyText.trim();
  if (trimmed.length <= 200) return trimmed;
  return `${trimmed.slice(0, 200)}…`;
};

/**
 * Make an authenticated API request.
 *
 * Behaviour summary (the bits that matter for issues #86 and #113):
 *
 *  1. If MSAL's `acquireTokenSilent` rejects with InteractionRequiredAuthError
 *     (the canonical "refresh token gone" case), we publish a
 *     SessionExpiredError event and rethrow the original error. Callers and
 *     the SessionRecoveryGuard handle it — we don't swallow it.
 *
 *  2. If the request returns a non-OK status with status === 401, we surface
 *     it as an ApiError. The acceptance criterion #3 is "a genuine 401 is
 *     still surfaced as an error and not mistaken for expiry", so we do NOT
 *     trigger a re-login flow on a real 401.
 *
 *  3. If the request returns HTML where the API was expected to return JSON
 *     (typically the Easy Auth / Microsoft login page that proxies return
 *     when the App Service session expires), we publish a SessionExpiredError
 *     event and throw SessionExpiredError. This is the case the user-facing
 *     bug is about.
 *
 *  4. As a catch-all, parse errors on a response that LOOKS like it could be
 *     JSON (e.g. 200 OK with a Content-Type other than text/html) are
 *     surfaced as ApiError — the user will see the message rather than an
 *     empty page.
 *
 *  5. (Issue #113) The fetch is wrapped in `fetchWithTimeout`, which aborts
 *     the request after the configured default and re-throws the cancellation
 *     as an `ApiError` with `.name === 'RequestTimeoutError'`. We surface
 *     that the same way as any other backend failure (trackException + the
 *     existing catch-all below) so the spinner can't spin forever.
 *
 * `url.includes('admin')` callers (`getAdminData`) used to rely on errors
 * being rethrown. Both call sites are already set up to render the error
 * message — we preserve that contract.
 *
 * The optional `options` bag forwards:
 *   - `signal`: an `AbortSignal` (typically from `useAbortController()`)
 *     that aborts the in-flight fetch when the caller wants out — e.g. a
 *     React component unmounting mid-request.
 *   - `timeoutMs`: per-call timeout override, mainly for tests.
 */
const makeAuthenticatedRequest = async (
  instance,
  url,
  method = 'GET',
  body = null,
  options = {},
) => {
  const operation = `${method} ${url}`;
  let accessToken;
  try {
    appInsights.trackEvent({
      name: `Api Call - ${method === 'GET' ? 'get' : 'post'}${url.charAt(0).toUpperCase() + url.slice(1)}`,
    });

    // Get the authentication token. If the silent-token call signals that
    // the user must re-authenticate (refresh token missing / revoked / MFA
    // required), publish a SessionExpiredError event and rethrow.
    try {
      accessToken = await retrieveTokenForBackend(
        instance,
        url.includes('admin') ? ['Group.Read.All'] : []
      );
    } catch (tokenError) {
      const isInteractionRequired =
        tokenError &&
        (tokenError.name === 'InteractionRequiredAuthError' ||
          tokenError.errorCode === 'interaction_required' ||
          /interaction.?required/i.test(String(tokenError.errorMessage || tokenError.message || '')));

      if (isInteractionRequired) {
        const err = new SessionExpiredError(
          'Silent token acquisition requires user interaction',
          {
            detection: 'interaction-required',
            status: 0,
            cause: tokenError,
          }
        );
        notifySessionExpired({ error: err, source: url });
        throw err;
      }

      // Genuine token-acquisition error (network, etc.) — surface, do not
      // misclassify as expiry.
      throw new ApiError(`Failed to acquire access token: ${tokenError.message || tokenError}`, {
        cause: tokenError,
        operation,
      });
    }

    // Setup headers and options
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    const fetchOptions = {
      method,
      headers
    };

    // Add request body for non-GET requests
    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Make the API request — wrapped in `fetchWithTimeout` so a stalled
    // backend can't pin the spinner forever (issue #113). The onTimeout
    // callback pipes the timeout into the same telemetry stream as every
    // other failure; the catch-all at the bottom of this function then
    // surfaces the user-facing error the same way as any other backend
    // rejection.
    const response = await fetchWithTimeout(
      `${BASE_URL}${url}`,
      fetchOptions,
      {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        operation,
        onTimeout: {
          trackException: (err) => appInsights.trackException({
            error: err,
            properties: { operation, source: 'API', detection: 'timeout' }
          }),
        },
      },
    );

    // Always inspect the response for the login-page / expiry signals even
    // when the status is "ok" — that's the whole point of issue #86.
    const inspection = await inspectResponseForExpiry(response, { expectsJson: true });

    if (inspection.looksLikeExpiry) {
      const err = new SessionExpiredError(
        `API responded as session expiry (${inspection.detection})`,
        {
          detection: inspection.detection,
          targetUrl: inspection.finalUrl,
          status: inspection.status,
        }
      );
      appInsights.trackEvent({
        name: 'Api Session Expired',
        properties: {
          url,
          method,
          detection: inspection.detection,
          status: String(inspection.status),
          finalUrl: inspection.finalUrl,
          bodyPreview: summarizeBody(inspection.bodyText),
        },
      });
      notifySessionExpired({ error: err, source: url });
      throw err;
    }

    if (!inspection.looksLikeExpiry && (inspection.status < 200 || inspection.status >= 300)) {
      // Genuine, non-expiry error response. Preserve the existing contract
      // that admin endpoints re-throw and user-data returns undefined —
      // but make sure the thrown error is informative rather than a generic
      // "Network response was not ok".
      const err = new ApiError(
        `Network response was not ok (${inspection.status}): ${inspection.statusText || 'Unknown'}`,
        { status: inspection.status, operation }
      );
      appInsights.trackException({
        error: err,
        properties: { operation, source: 'API' }
      });
      console.error(`Error in API (${method} ${url}):`, err);

      if (url.includes('admin')) {
        throw err;
      }
      // For user data, keep returning undefined to honour the existing tests
      // that mock this code path.
      return undefined;
    }

    // Genuine JSON response.
    try {
      // Prefer the inspection-captured body when we have one. Fall back to
      // the live response.json() when we could not capture the body (the
      // tests model the success case with bare `{ ok: true, json: ... }`).
      if (inspection.bodyText !== '' || typeof response.json !== 'function') {
        return inspectionJson(inspection);
      }
      return await response.json();
    } catch (parseErr) {
      appInsights.trackException({
        error: parseErr,
        properties: { operation, source: 'API' }
      });
      console.error(`Error in API (${method} ${url}):`, parseErr);
      if (url.includes('admin')) {
        throw parseErr;
      }
      return undefined;
    }
  } catch (error) {
    // SessionExpiredError already had its chance to surface — rethrow as-is
    // regardless of whether the URL is admin or user data. Re-throwing it is
    // what kicks off the re-login flow in the SessionRecoveryGuard.
    if (SessionExpiredError.is(error)) {
      throw error;
    }

    appInsights.trackException({
      error,
      properties: { operation, source: 'API' }
    });
    console.error(`Error in API (${operation}):`, error);

    // For user data, return undefined (consistent with current tests)
    // For admin data, rethrow the error (consistent with current tests)
    if (url.includes('admin')) {
      throw error;
    }

    // Return undefined for getUserData as expected by tests
    return undefined;
  }
};

export const getUserData = async (instance, options) => {
  return makeAuthenticatedRequest(instance, '/user-data', 'GET', null, options);
};

export const getAdminData = async (instance, message = "Hello from frontend", status = 123, options) => {
  const body = {
    message,
    status
  };

  return makeAuthenticatedRequest(instance, '/admin-data', 'POST', body, options);
};
