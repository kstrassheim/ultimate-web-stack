import { createContext, useContext } from 'react';
import { useMsal } from '@azure/msal-react';

/**
 * Auth state hook (issue #87 - remove prop drilling).
 *
 * Until this commit every component that needed auth state reached into
 * `@azure/msal-react` directly via `useMsal()`; the role-normalisation
 * block (lower-case both sides of the comparison) was duplicated in
 * both ProtectedRoute.jsx and ProtectedLink.jsx.
 *
 * `useAuth()` wraps `useMsal()` and exposes the bits the consumer
 * components actually read:
 *
 *   - instance     - the MSAL PublicClientApplication
 *   - account      - the active account, or `null`
 *   - isAuthenticated - boolean
 *   - roles        - lower-cased role list from id token claims
 *   - hasRole(role)        - case-insensitive single-role check
 *   - hasAllRoles(roles[]) - case-insensitive AND-of-roles check
 *
 * Components that don't sit under <MsalProvider> still work - the hook
 * falls back to deriving the value from `useMsal()` directly, which is
 * the same call path the old components used. The mock-based jest and
 * cypress suites that mock `@azure/msal-react` keep working without
 * changes.
 */

const AuthContext = createContext(null);

/**
 * Lower-cases every entry so callers can compare against the token
 * claim roles regardless of how Entra was configured to emit them.
 */
function normalizeRoles(account) {
  const raw = account?.idTokenClaims?.roles;
  if (!Array.isArray(raw)) return [];
  return raw.map((role) => String(role).toLowerCase());
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  const { instance } = useMsal();
  const account = instance.getActiveAccount();
  const roles = normalizeRoles(account);

  const value = {
    instance,
    account,
    isAuthenticated: Boolean(account),
    roles,
    hasRole(role) {
      if (!role) return true;
      return roles.includes(String(role).toLowerCase());
    },
    hasAllRoles(requiredRoles = []) {
      if (!requiredRoles || requiredRoles.length === 0) return true;
      const normalizedRequired = requiredRoles.map((r) => String(r).toLowerCase());
      return normalizedRequired.every((role) => roles.includes(role));
    },
  };

  // If a parent provided a context value, prefer it (allows a future
  // <AuthProvider> to memoize across consumers).
  return ctx || value;
}