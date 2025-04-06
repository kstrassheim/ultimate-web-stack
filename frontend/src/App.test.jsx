import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';

// Mock all child components to isolate App testing
jest.mock('@/components/EntraProfile', () => () => <div data-testid="mocked-entra-profile">Mocked Profile</div>);
jest.mock('@/components/ProtectedRoute', () => ({ children, requiredRoles }) => (
  <div data-testid="mocked-protected-route" data-roles={requiredRoles.join(',')}>
    {children}
  </div>
));
jest.mock('@/pages/Home', () => () => <div data-testid="mocked-home-page">Home Page</div>);
jest.mock('@/pages/Chat', () => () => <div data-testid="mocked-chat-page">Chat Page</div>);
jest.mock('@/pages/Admin', () => () => <div data-testid="mocked-admin-page">Admin Page</div>);
jest.mock('@/pages/404', () => () => <div data-testid="mocked-404-page">404 Page</div>);
jest.mock('@/pages/AccessDenied', () => () => <div data-testid="mocked-access-denied-page">Access Denied Page</div>);
// Mock the new pages
jest.mock('@/pages/futureGadget/Experiments', () => () => <div data-testid="mocked-experiments-page">Experiments Page</div>);
jest.mock('@/pages/futureGadget/DMails', () => () => <div data-testid="mocked-dmails-page">DMails Page</div>);

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
    expect(screen.getByText('Test Page Title')).toBeInTheDocument(); // Now checking for document.title
    
    // Check page navigation links
    expect(screen.getByTestId('page-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('nav-home')).toBeInTheDocument();
    expect(screen.getByTestId('nav-chat')).toBeInTheDocument(); // Test chat link
    
    // Check dropdown exists
    expect(screen.getByTestId('nav-future-gadget')).toBeInTheDocument();
    
    // Check auth navigation components
    expect(screen.getByTestId('auth-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('mocked-entra-profile')).toBeInTheDocument();
  });

  test('checks dropdown items are in the DOM', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    );
    
    // First, click the dropdown toggle to open the menu
    const dropdownToggle = screen.getByText('Future Gadget Lab');
    fireEvent.click(dropdownToggle);
    
    // Now the dropdown items should be visible in the DOM
    expect(screen.getByTestId('nav-admin')).toBeInTheDocument();
    expect(screen.getByTestId('nav-experiments')).toBeInTheDocument();
    expect(screen.getByTestId('nav-dmails')).toBeInTheDocument();
  });

  test('renders home route with correct protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    const protectedRoute = screen.getByTestId('mocked-protected-route');
    expect(protectedRoute).toBeInTheDocument();
    expect(protectedRoute).toHaveAttribute('data-roles', ''); // No required roles
    expect(screen.getByTestId('mocked-home-page')).toBeInTheDocument();
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

  test('renders admin route with Admin role protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/admin']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    const protectedRoute = screen.getByTestId('mocked-protected-route');
    expect(protectedRoute).toBeInTheDocument();
    expect(protectedRoute).toHaveAttribute('data-roles', 'Admin'); // Admin role required
    expect(screen.getByTestId('mocked-admin-page')).toBeInTheDocument();
  });
  
  test('renders experiments route with correct protection', () => {
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
    expect(protectedRoute).toHaveAttribute('data-roles', ''); // No required roles
    expect(screen.getByTestId('mocked-experiments-page')).toBeInTheDocument();
  });
  
  test('renders dmails route with correct protection', () => {
    render(
      <MemoryRouter 
        initialEntries={['/dmails']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    );
    
    const protectedRoute = screen.getByTestId('mocked-protected-route');
    expect(protectedRoute).toBeInTheDocument();
    expect(protectedRoute).toHaveAttribute('data-roles', ''); // No required roles
    expect(screen.getByTestId('mocked-dmails-page')).toBeInTheDocument();
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