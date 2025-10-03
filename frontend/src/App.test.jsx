import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter, MemoryRouter } from 'react-router';
import App from './App';

// Mock all child components to isolate App testing
jest.mock('@/components/EntraProfile', () => () => <div data-testid="mocked-entra-profile">Mocked Profile</div>);
jest.mock('@/components/ProtectedRoute', () => ({ children, requiredRoles }) => (
  <div data-testid="mocked-protected-route" data-roles={requiredRoles.join(',')}>
    {children}
  </div>
));

// Mock ProtectedLink with different implementations based on role
jest.mock('@/components/ProtectedLink', () => {
  // Return a component that renders children only if requiredRoles includes 'Admin'
  return ({ children, requiredRoles = [] }) => {
    // For testing purposes, simulate different auth states using data attributes
    const showForAdmin = requiredRoles.includes('Admin');
    return (
      <div data-testid="mocked-protected-link" data-roles={requiredRoles.join(',')} data-visible={showForAdmin}>
        {showForAdmin ? children : null}
      </div>
    );
  };
});

jest.mock('@/pages/Home', () => () => <div data-testid="home-page">Home Page</div>);
jest.mock('@/pages/Dashboard', () => () => <div data-testid="mocked-dashboard-page">Dashboard Page</div>);
jest.mock('@/pages/Chat', () => () => <div data-testid="mocked-chat-page">Chat Page</div>);
jest.mock('@/pages/404', () => () => <div data-testid="mocked-404-page">404 Page</div>);
jest.mock('@/pages/AccessDenied', () => () => <div data-testid="mocked-access-denied-page">Access Denied Page</div>);
jest.mock('@/pages/Experiments', () => () => <div data-testid="mocked-experiments-page">Experiments Page</div>);

describe('App Component', () => {
  // Set document.title for testing
  const originalTitle = document.title;
  beforeEach(() => {
    document.title = 'Test Page Title';
  });
  afterEach(() => {
    document.title = originalTitle;
  });

  test('renders navigation bar with all links', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    );
    
    // Check navigation elements
    expect(screen.getByTestId('main-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('logo-link')).toBeInTheDocument();
    expect(screen.getByTestId('logo-image')).toBeInTheDocument();
    expect(screen.getByText('Test Page Title')).toBeInTheDocument();
    
    // Check page navigation links
    expect(screen.getByTestId('page-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('nav-home')).toBeInTheDocument();
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-chat')).toBeInTheDocument();
    
    // Check protected links
    const protectedLink = screen.getByTestId('mocked-protected-link');
    expect(protectedLink).toBeInTheDocument();
    expect(protectedLink).toHaveAttribute('data-roles', 'Admin');
    
    // Check auth navigation components
    expect(screen.getByTestId('auth-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('mocked-entra-profile')).toBeInTheDocument();
  });

  test('verifies experiments link is protected with Admin role', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    );
    
    // Check that the experiments link is wrapped in a ProtectedLink
    const protectedLink = screen.getByTestId('mocked-protected-link');
    expect(protectedLink).toHaveAttribute('data-roles', 'Admin');
    
    // Check if the link is visible (based on our mock implementation)
    const isVisible = protectedLink.getAttribute('data-visible') === 'true';
    
    // The experiments link visibility depends on the mock implementation
    // In our mock, we're showing it when requiredRoles includes 'Admin'
    expect(isVisible).toBe(true);
  });

  test('renders home route with no protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    // No required roles
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  test('renders dashboard route with correct protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/dashboard']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    const protectedRoute = screen.getByTestId('mocked-protected-route');
    expect(protectedRoute).toBeInTheDocument();
    expect(protectedRoute).toHaveAttribute('data-roles', ''); // No required roles
    expect(screen.getByTestId('mocked-dashboard-page')).toBeInTheDocument();
  });
  
  test('renders chat route with correct protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/chat']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    const protectedRoute = screen.getByTestId('mocked-protected-route');
    expect(protectedRoute).toBeInTheDocument();
    expect(protectedRoute).toHaveAttribute('data-roles', ''); // No required roles
    expect(screen.getByTestId('mocked-chat-page')).toBeInTheDocument();
  });

  test('renders experiments route with Admin role protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/experiments']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    const protectedRoute = screen.getByTestId('mocked-protected-route');
    expect(protectedRoute).toBeInTheDocument();
    expect(protectedRoute).toHaveAttribute('data-roles', 'Admin'); // Admin role required
    expect(screen.getByTestId('mocked-experiments-page')).toBeInTheDocument();
  });

  test('renders 404 page for unknown routes', () => {
    render(
      <MemoryRouter 
        initialEntries={['/unknown-route']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    expect(screen.getByTestId('mocked-404-page')).toBeInTheDocument();
  });

  test('renders access denied page for access-denied route', () => {
    render(
      <MemoryRouter 
        initialEntries={['/access-denied']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    expect(screen.getByTestId('mocked-access-denied-page')).toBeInTheDocument();
  });
});