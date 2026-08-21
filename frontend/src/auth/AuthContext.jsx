import React, { createContext, useContext, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';

/**
 * Centralised auth state layer (issue #87 — remove prop drilling).
 *
 * Until this commit every component that needed auth state — the role
 * checks in `ProtectedRoute` / `ProtectedLink`, the profile dropdown in
 * `EntraProfile`, the data pages that call MSAL-protected APIs, …
 * reached into `@azure/msal-react` directly via `useMsal()`. That meant
 * the same role-normalisation logic lived in two components and every
 * new page had to know to call `useMsal()` before it could ask "is
 * this user an Admin?".
 *
 * This module is the single source of truth for that state. It wraps
 * `useMsal()` and exposes:
 *
 *   - `instance`     — the MSAL PublicClientApplication
 *   - `account`      — the currently-active account, or `null`
 *   - `isAuthenticated` — boolean
 *   - `roles`        — lower-cased role list from the id token claims
 *   - `hasRole(role)`        — true if `role` is in the user's roles
 *   - `hasAllRoles(roles[])` — true if every entry is present (case-insensitive)
 *
 * Components consume it via the `useAuth()` hook. They no longer need
 * to know how MSAL exposes accounts or how the role claim is structured
 * in the id token — and they don't need any prop drilling, because the
 * context value travels down the React tree once at the provider level.
 *
 * Backwards compatibility: the hook still ultimately calls
 * `useMsal()`, so any test that mocks `@azure/msal-react` (which is the
 * dominant pattern in `jest.setup.js` and the per-component suites)
 * keeps working without modification.
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

export function AuthProvider({ children }) {
  const { instance } = useMsal();
  const account = instance.getActiveAccount();

  const value = useMemo(() => {
    const roles = normalizeRoles(account);
    return {
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
  }, [instance, account]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fall back to deriving from useMsal() directly so existing
    // call-sites that don't sit under <AuthProvider> still work.
    // This keeps the hook usable as a drop-in replacement for
    // `useMsal()` during incremental migration.
    const { instance } = useMsal();
    const account = instance.getActiveAccount();
    const roles = normalizeRoles(account);
    return {
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
  }
  return ctx;
}
