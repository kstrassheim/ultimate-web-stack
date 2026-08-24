import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAuth } from '@/auth/AuthContext';
import ProtectedLink from './ProtectedLink';

// useNavigate is used by NavLink; provide a stub so the test doesn't
// hit React Router's real navigate hook.
jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

describe('ProtectedLink', () => {
  it('renders children as a real NavLink when the user has the required role', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      hasAllRoles: () => true,
      roles: ['Admin'],
    });
    render(
      <ProtectedLink requiredRoles={['Admin']}>
        <span data-testid="child">Experiments</span>
      </ProtectedLink>
    );
    expect(screen.getByTestId('protected-link')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('Experiments');
  });

  it('renders a placeholder when the user is signed out', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      hasAllRoles: () => false,
      roles: [],
    });
    render(
      <ProtectedLink requiredRoles={['Admin']}>
        <span data-testid="child">Experiments</span>
      </ProtectedLink>
    );
    expect(screen.queryByTestId('protected-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-link-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('protected-link-placeholder')).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders a placeholder when the user lacks the required role', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      hasAllRoles: () => false,
      roles: ['User'],
    });
    render(
      <ProtectedLink requiredRoles={['Admin']}>
        <span data-testid="child">Experiments</span>
      </ProtectedLink>
    );
    expect(screen.queryByTestId('protected-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-link-placeholder')).toBeInTheDocument();
  });

  it('renders the link when no roles are required (any signed-in user)', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      hasAllRoles: () => true,
      roles: ['User'],
    });
    render(
      <ProtectedLink>
        <span data-testid="child">Home</span>
      </ProtectedLink>
    );
    expect(screen.getByTestId('protected-link')).toBeInTheDocument();
  });
});