import { NavLink, useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthContext';

/**
 * ProtectedLink renders its children only when the current user has at
 * least one of the required roles. It uses `<NavLink>` so the active-route
 * styling keeps working when the link is rendered.
 *
 * Behaviour:
 *   - No required roles (or none passed) -> always render the link.
 *   - User is signed out -> render a non-clickable placeholder that
 *     still occupies the navbar slot so the layout doesn't jump.
 *   - User is signed in but lacks the role -> render a non-clickable
 *     placeholder (same reason).
 *   - User is signed in AND has at least one role -> render the link
 *     with the children.
 *
 * The placeholder is a `<span>` with the same class names Bootstrap
 * expects on a nav link, so the surrounding `Nav` flexbox stays
 * unchanged.
 */
const ProtectedLink = ({ requiredRoles = [], children, ...rest }) => {
  const { isAuthenticated, hasAllRoles } = useAuth();
  const location = useLocation();
  const authorized = isAuthenticated && hasAllRoles(requiredRoles);

  if (!authorized) {
    return (
      <span
        aria-disabled="true"
        data-testid="protected-link-placeholder"
        className={`nav-link disabled ${rest.className || ''}`}
      >
        {children}
      </span>
    );
  }

  return (
    <NavLink
      to={location.pathname}
      {...rest}
      data-testid="protected-link"
    >
      {children}
    </NavLink>
  );
};

export default ProtectedLink;