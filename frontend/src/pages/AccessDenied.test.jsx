import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AccessDenied from './AccessDenied';
import appInsights from '@/log/appInsights';

// Mock appInsights
jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn()
}));

// React Router v6.4+ future flags
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

describe('AccessDenied Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders access denied page without roles when no state provided', () => {
    render(
      <MemoryRouter initialEntries={['/access-denied']} future={routerFutureConfig}>
        <AccessDenied />
      </MemoryRouter>
    );

    // Check general elements
    expect(screen.getByTestId('access-denied-page')).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-heading')).toHaveTextContent('Access Denied');
    
    // Check non-role specific messaging is shown
    expect(screen.getByTestId('access-denied-login-message')).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-signin-prompt')).toBeInTheDocument();
    
    // Verify role-specific content is not displayed
    expect(screen.queryByTestId('access-denied-role-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('access-denied-required-roles')).not.toBeInTheDocument();
    
    // Verify analytics is tracked
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Access Denied page' });
  });

  test('renders access denied page with required roles when state is provided', () => {
    // Need to use Routes to provide location state properly
    render(
      <MemoryRouter 
        initialEntries={[{ pathname: '/access-denied', state: { requiredRoles: ['Admin', 'Manager'] } }]}
        future={routerFutureConfig}
      >
        <Routes>
          <Route path="/access-denied" element={<AccessDenied />} />
        </Routes>
      </MemoryRouter>
    );

    // Check general elements
    expect(screen.getByTestId('access-denied-page')).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-heading')).toHaveTextContent('Access Denied');
    
    // Check role-specific content
    expect(screen.getByTestId('access-denied-role-message')).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-required-roles')).toHaveTextContent('Required roles: Admin, Manager');
    
    // Verify non-role specific messaging is not shown
    expect(screen.queryByTestId('access-denied-login-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('access-denied-signin-prompt')).not.toBeInTheDocument();
    
    // Verify analytics is tracked
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Access Denied page' });
  });
  
  test('renders access denied page with empty roles array', () => {
    render(
      <MemoryRouter 
        initialEntries={[{ pathname: '/access-denied', state: { requiredRoles: [] } }]}
        future={routerFutureConfig}
      >
        <Routes>
          <Route path="/access-denied" element={<AccessDenied />} />
        </Routes>
      </MemoryRouter>
    );

    // Since requiredRoles array is empty, it should show the login message
    expect(screen.getByTestId('access-denied-login-message')).toBeInTheDocument();
    expect(screen.getByTestId('access-denied-signin-prompt')).toBeInTheDocument();
    
    // Verify analytics is tracked
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Access Denied page' });
  });
});