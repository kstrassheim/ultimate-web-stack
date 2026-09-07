/**
 * Direct coverage for useAuth()'s role helpers — the hasRole/hasAllRoles
 * branches that no component test drives end-to-end.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { useMsal } from '@azure/msal-react';
import { useAuth } from './AuthContext';

const renderUseAuth = (instance) => {
  useMsal.mockReturnValue({ instance });
  let value;
  const Probe = () => {
    value = useAuth();
    return null;
  };
  render(<Probe />);
  return value;
};

const instanceWithAccount = (account) => ({
  getActiveAccount: () => account,
});

describe('useAuth role helpers', () => {
  it('treats a missing role requirement as satisfied and denies everything when signed out', () => {
    const auth = renderUseAuth(instanceWithAccount(null));

    expect(auth.isAuthenticated).toBe(false);
    expect(auth.roles).toEqual([]);
    // No requirement → allowed (empty-role and empty-list fast paths).
    expect(auth.hasRole()).toBe(true);
    expect(auth.hasAllRoles()).toBe(true);
    expect(auth.hasAllRoles(null)).toBe(true);
    // Any concrete role → denied without an account.
    expect(auth.hasRole('Admin')).toBe(false);
    expect(auth.hasAllRoles(['Admin'])).toBe(false);
  });

  it('matches roles case-insensitively against the id token claims', () => {
    const auth = renderUseAuth(
      instanceWithAccount({ idTokenClaims: { roles: ['Admin', 'Reader'] } }),
    );

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.roles).toEqual(['admin', 'reader']);
    expect(auth.hasRole('ADMIN')).toBe(true);
    expect(auth.hasRole('Writer')).toBe(false);
    expect(auth.hasAllRoles(['admin', 'READER'])).toBe(true);
    expect(auth.hasAllRoles(['Admin', 'MissingRole'])).toBe(false);
  });

  it('normalizes a non-array roles claim to an empty list', () => {
    const auth = renderUseAuth(
      instanceWithAccount({ idTokenClaims: { roles: 'Admin' } }),
    );

    expect(auth.roles).toEqual([]);
    expect(auth.hasRole('Admin')).toBe(false);
  });
});
