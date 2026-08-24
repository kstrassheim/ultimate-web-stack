import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthContext';

/**
 * Wraps a route's element so unauthenticated users get bounced to
 * `/access-denied` (or to the login page once a login flow lands),
 * and authenticated users lacking the required role get bounced to
 * `/access-denied` too. The original target is preserved via
 * sessionStorage so the post-login redirect (issue #86) can return
 * the user where they were going.
 */
const ProtectedRoute = ({ requiredRoles = [], children }) => {
  const { isAuthenticated, hasAllRoles } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !hasAllRoles(requiredRoles)) {
    // Preserve the original target so issue #86's re-login flow can
    // restore the user here once the re-auth completes. We only set
    // this when there is a meaningful pathname; "/" / "/access-denied"
    // are no-ops because we don't want the redirect to bounce back to
    // them in a loop.
    if (
      typeof window !== 'undefined' &&
      location.pathname &&
      location.pathname !== '/access-denied' &&
      location.pathname !== '/'
    ) {
      try {
        window.sessionStorage.setItem('redirectPath', location.pathname + (location.search || ''));
      } catch (_) { /* sessionStorage may be unavailable; swallow */ }
    }
    return <Navigate to="/access-denied" replace />;
  }

  return children;
};

export default ProtectedRoute;