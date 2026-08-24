import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAuth } from '@/auth/AuthContext';
import ProtectedRoute from './ProtectedRoute';

jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/dashboard' }),
  };
});

describe('ProtectedRoute', () => {
  it('renders children when the user is authenticated and has the required role', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      hasAllRoles: () => true,
      roles: ['Admin'],
    });
    render(
      <ProtectedRoute requiredRoles={['Admin']}>
        <div data-testid="protected-child">child</div>
      </ProtectedRoute>
    );
    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
  });

  it('redirects to /access-denied when the user is signed out', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      hasAllRoles: () => false,
      roles: [],
    });
    render(
      <ProtectedRoute requiredRoles={['Admin']}>
        <div data-testid="protected-child">child</div>
      </ProtectedRoute>
    );
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
  });

  it('redirects to /access-denied when the user lacks the required role', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      hasAllRoles: () => false,
      roles: ['User'],
    });
    render(
      <ProtectedRoute requiredRoles={['Admin']}>
        <div data-testid="protected-child">child</div>
      </ProtectedRoute>
    );
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
  });

  it('writes the original pathname to sessionStorage so issue #86 re-login can return the user', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      hasAllRoles: () => false,
      roles: [],
    });
    render(
      <ProtectedRoute requiredRoles={['Admin']}>
        <div data-testid="protected-child">child</div>
      </ProtectedRoute>
    );
    expect(window.sessionStorage.getItem('redirectPath')).toBe('/dashboard');
  });
});