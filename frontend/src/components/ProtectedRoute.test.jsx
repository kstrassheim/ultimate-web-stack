import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useMsal } from '@azure/msal-react';
import appInsights from '@/log/appInsights';

// React Router v6.4+ future flags
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

describe('ProtectedRoute Component', () => {
  afterEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test('redirects to /access-denied when no active account is present', () => {
    useMsal.mockReturnValue({
      instance: { getActiveAccount: () => null },
    });

    render(
      <MemoryRouter initialEntries={['/test']} future={routerFutureConfig}>
        <ProtectedRoute requiredRoles={['admin']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    // Verify view
    expect(screen.getByTestId('protected-route-no-account')).toBeInTheDocument();
  });

  test('renders children if active account has required roles', () => {
    const account = {
      idTokenClaims: { roles: ['Admin', 'User'] },
    };
    useMsal.mockReturnValue({
      instance: { getActiveAccount: () => account },
    });

    render(
      <MemoryRouter future={routerFutureConfig}>
        <ProtectedRoute requiredRoles={['admin']}>
          <div data-testid="child">Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-route-authorized')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('Protected Content');
  });

  test('redirects to /access-denied when active account lacks required roles', () => {
    const account = {
      idTokenClaims: { roles: ['User'] },
    };
    useMsal.mockReturnValue({
      instance: { getActiveAccount: () => account },
    });

    render(
      <MemoryRouter initialEntries={['/test']} future={routerFutureConfig}>
        <ProtectedRoute requiredRoles={['admin']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-route-insufficient-permissions')).toBeInTheDocument();
    // Check sessionStorage and tracking call
    expect(sessionStorage.getItem('redirectPath')).toBe(location.pathname);
    expect(appInsights.trackEvent).toHaveBeenCalledWith({
      name: 'Protected Route - Redirecting to Access denied page',
    });
  });
});