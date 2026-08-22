/**
 * The auth-flow helpers used by the SessionRecoveryGuard and by the
 * `Sign In` / `Change Account` controls in EntraProfile.
 *
 * The recovery flow is intentionally independent of any single React
 * component so it can be installed once at app-bootstrap (in
 * `SessionRecoveryGuard`) and re-used by `EntraProfile`'s sign-in button.
 *
 * The shared contract is: callers save the path the user is currently on
 * (or the path they want to come back to) into `sessionStorage.redirectPath`
 * BEFORE calling `loginPopup`; afterwards, the `consumeRedirectPath`
 * helper reads it back, removes it, and returns it. The first non-empty
 * value wins.
 */
import appInsights from '@/log/appInsights';
import { loginRequest } from '@/auth/entraAuth';

const REDIRECT_PATH_KEY = 'redirectPath';

export const REDIRECT_PATH_STORAGE_KEY = REDIRECT_PATH_KEY;

/**
 * Save a path the user should be navigated back to after a re-authentication
 * round-trip. Falls back to the current location when called with no
 * argument. The saved value is what `EntraProfile`'s post-login logic (and
 * `consumeRedirectPath`) read after `loginPopup` succeeds.
 *
 * Saving `null` is a no-op so callers can pass the result of a previous
 * `consumeRedirectPath` call without special-casing.
 */
export function saveRedirectPath(path) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  let target = path;
  if (!target) {
    const { pathname, search } = window.location;
    target = `${pathname || '/'}${search || ''}`;
  }
  try {
    window.sessionStorage.setItem(REDIRECT_PATH_KEY, target);
  } catch (err) {
    appInsights.trackException({
      exception: err,
      properties: { operation: 'saveRedirectPath' },
    });
  }
}

/**
 * Returns the saved redirect path (if any) and removes it from
 * sessionStorage. Always returns *something* the caller can navigate to —
 * defaults to '/' when nothing is stored.
 */
export function consumeRedirectPath() {
  if (typeof window === 'undefined' || !window.sessionStorage) return '/';
  let saved = '/';
  try {
    const raw = window.sessionStorage.getItem(REDIRECT_PATH_KEY);
    if (raw && raw.length > 0 && raw !== 'null' && raw !== 'undefined') {
      saved = raw;
    }
    window.sessionStorage.removeItem(REDIRECT_PATH_KEY);
  } catch (err) {
    appInsights.trackException({
      exception: err,
      properties: { operation: 'consumeRedirectPath' },
    });
  }
  return saved;
}

/**
 * Trigger MSAL loginPopup and, on success, set the active account and
 * navigate the user back to where they were. Single-flight — concurrent
 * callers share the in-progress promise.
 *
 * @param {object} instance - an MSAL `PublicClientApplication` instance.
 * @param {object} [options]
 * @param {string} [options.target]
 *   The path the user should land on after a successful login. Saved into
 *   sessionStorage BEFORE the popup is opened so it survives across the
 *   cross-origin navigation. Defaults to the current location.
 * @param {Function} [options.navigate]
 *   A react-router `useNavigate` hook result. Required when running inside
 *   a `<BrowserRouter>`; the function calls it with the resolved path.
 * @param {object} [options.loginRequest]
 *   Override for the MSAL login request. Defaults to the default-scopes
 *   import from `./entraAuth`.
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
let _inFlight = null;

export async function reauthenticate(instance, {
  target,
  navigate,
  loginRequest: loginRequestOverride,
  forceSelectAccount = false,
  onBeforePopup,
} = {}) {
  if (!instance) {
    return { success: false, error: new Error('reauthenticate requires an MSAL instance') };
  }
  // Coalesce overlapping recovery attempts so the user doesn't see a
  // pile-up of popups when several background fetches all hit the
  // expiry-detection path at once.
  if (_inFlight) {
    return _inFlight;
  }

  _inFlight = (async () => {
    const startedAt = Date.now();
    try {
      // Notify the visible UI (e.g. EntraProfile) so it can show
      // "Re-authenticating…" instead of letting the user click Sign In
      // while a background recovery is already in progress.
      if (typeof window !== 'undefined') {
        window.__uwsRecoveryInFlight = true;
        window.dispatchEvent(new CustomEvent('uws:recovery:started', { detail: { at: startedAt } }));
      }
      // Only overwrite the saved redirect path when the caller explicitly
      // provides one. An absent target means "keep whatever was already
      // saved" — that's the case when EntraProfile's Sign-In button runs
      // and the user already had a redirect target stored from a previous
      // ProtectedRoute / SessionRecoveryGuard interaction.
      if (target) {
        saveRedirectPath(target);
      }
      appInsights.trackEvent({ name: 'Session Recovery - Reauth started' });
      if (typeof onBeforePopup === 'function') {
        try {
          onBeforePopup();
        } catch (_) {
          // never let a UI hook break the recovery flow
        }
      }
      const request = loginRequestOverride || loginRequest;
      const requestParam = forceSelectAccount
        ? { ...request, prompt: 'select_account' }
        : request;
      const response = await instance.loginPopup(requestParam);
      instance.setActiveAccount(response.account);

      const next = consumeRedirectPath();
      if (typeof navigate === 'function') {
        navigate(next, { replace: true });
      } else if (typeof window !== 'undefined') {
        // No router navigate was injected — fall back to a manual
        // replacement so we still land on the saved path. Replace rather
        // than push so the recovery doesn't pollute history.
        try {
          window.history.replaceState({}, '', next);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (_) {
          // last-resort: do nothing — the success still applies the
          // active account, so subsequent API calls will work.
        }
      }

      appInsights.trackEvent({ name: 'Session Recovery - Reauth completed' });
      return { success: true };
    } catch (error) {
      appInsights.trackException({
        exception: error,
        properties: { operation: 'reauthenticate' },
      });
      // Even on failure, clean up the saved path so we don't bounce the
      // user forever between the same two pages.
      consumeRedirectPath();
      return { success: false, error };
    } finally {
      _inFlight = null;
      if (typeof window !== 'undefined') {
        window.__uwsRecoveryInFlight = false;
        window.dispatchEvent(new CustomEvent('uws:recovery:finished', { detail: { at: Date.now() } }));
      }
    }
  })();

  return _inFlight;
}

/**
 * Escape hatch: is a recovery attempt currently in flight?
 *
 * Useful for tests and for the rare component that wants to render a
 * "we are logging you back in…" UI without subscribing to the bus.
 */
export function isReauthInFlight() {
  return _inFlight !== null;
}

/**
 * Reset the in-flight state. Tests only.
 */
export function _resetReauthStateForTests() {
  _inFlight = null;
}
