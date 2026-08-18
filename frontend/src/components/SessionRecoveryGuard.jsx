/**
 * SessionRecoveryGuard
 *
 * Mounts once, near the top of the React tree (inside `<MsalProvider>` and
 * `<BrowserRouter>`). Subscribes to the API layer's "session expired" event
 * bus and, when one fires, kicks off the re-login popup and navigates the
 * user back to the page they were on.
 *
 * Why a dedicated component rather than wiring it inline in `App.jsx`?
 *   - We need `useMsal` (gives us the MSAL instance) AND `useNavigate` (gives
 *     us the router navigate function). Both must be available from inside
 *     the tree under the providers; co-locating them in `App.jsx` would
 *     make App.jsx a Provider-aware component.
 *   - Tests can render just `<SessionRecoveryGuard />` to assert that the
 *     listeners are registered, without spinning up the whole Routes tree.
 *
 * Behaviour:
 *   - On mount: subscribes to `onSessionExpired` from `@/api/errors`.
 *   - On event: calls `reauthenticate(instance, { navigate, target: ... })`,
 *     which is single-flight, so overlapping concurrent API failures
 *     (e.g. Dashboard + Chat both firing the same instant) share one popup.
 *   - On unmount: unsubscribes.
 *
 * The component renders nothing. It exists purely for side-effects.
 */
import { useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router';
import { onSessionExpired } from '@/api/errors';
import { reauthenticate } from '@/auth/authFlow';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

const SessionRecoveryGuard = () => {
  const { instance } = useMsal();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onSessionExpired(({ error, source } = {}) => {
      // Capture where the user should land once the recovery round-trip
      // is done. Window.location at the time of expiry is exactly where
      // they were when the API rejected them.
      let target;
      try {
        if (typeof window !== 'undefined' && window.location) {
          target = `${window.location.pathname || '/'}${window.location.search || ''}`;
        }
      } catch (_) {
        target = '/';
      }

      appInsights.trackEvent({
        name: 'SessionRecoveryGuard - Triggered',
        properties: {
          source: source || 'unknown',
          detection: error && error.detection ? error.detection : 'unknown',
          status: String((error && error.status) || 0),
        },
      });

      // The sign-in flow shows its own UI; we still nudge the toast
      // service so the user has a visible signal that something is
      // happening even on browsers that throttle background windows.
      try {
        notyfService.info('Your session has expired. Please sign in again to continue.');
      } catch (_) {
        // never let a UI notification failure abort recovery
      }

      // Hand off to authFlow so the in-flight dedupe, telemetry and
      // navigate-back behaviour are identical to the Sign-In button.
      reauthenticate(instance, {
        navigate,
        target,
      }).then((result) => {
        if (result && !result.success && result.error) {
          appInsights.trackException({
            exception: result.error,
            properties: { operation: 'SessionRecoveryGuard', source: source || 'unknown' },
          });
          try {
            notyfService.error('Could not re-authenticate automatically. Please try again.');
          } catch (_) {
            /* no-op */
          }
        }
      });
    });

    return unsubscribe;
  }, [instance, navigate]);

  return null;
};

export default SessionRecoveryGuard;
