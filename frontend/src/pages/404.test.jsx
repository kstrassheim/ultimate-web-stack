import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from './404';
import appInsights from '@/log/appInsights';

// Mock the appInsights module
jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn()
}));

// React Router v6.4+ future flags
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

describe('NotFound Page', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('renders the 404 page with correct elements', () => {
    render(
      <MemoryRouter future={routerFutureConfig}>
        <NotFound />
      </MemoryRouter>
    );

    // Check that the page renders with correct heading
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
    expect(screen.getByTestId('not-found-heading')).toHaveTextContent('404');
    
    // Check that the home link exists
    const homeLink = screen.getByTestId('not-found-home-link');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveTextContent('Goto Home');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  test('tracks page view with appInsights', () => {
    render(
      <MemoryRouter future={routerFutureConfig}>
        <NotFound />
      </MemoryRouter>
    );

    // Verify that appInsights.trackEvent was called with the correct parameters
    expect(appInsights.trackEvent).toHaveBeenCalledTimes(1);
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ 
      name: '404 - NotFound page' 
    });

  });
});