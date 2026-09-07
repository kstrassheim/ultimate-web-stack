import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import Dashboard from './Dashboard';
import { getUserData } from '@/api/api';
import { getAllGroups } from '@/api/graphApi';
import { GraphConsentRequiredError } from '@/auth/entraAuth';
import { 
  getWorldlineStatus,
  getWorldlineHistory,
  getDivergenceReadings,
  worldlineSocket
} from '@/api/futureGadgetApi';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

// Mock WorldlineMonitor component to simplify testing
jest.mock('@/pages/components/WorldlineMonitor', () => {
  return function DummyWorldlineMonitor() {
    return <div data-testid="worldline-monitor-mock">WorldlineMonitor Component</div>;
  };
});

// Mock the notyfService
jest.mock('@/log/notyfService', () => ({
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn()
}));

// Mock the Future Gadget Lab API calls
jest.mock('@/api/futureGadgetApi', () => ({
  getWorldlineStatus: jest.fn(),
  getWorldlineHistory: jest.fn(),
  getDivergenceReadings: jest.fn(),
  worldlineSocket: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    subscribeToStatus: jest.fn().mockReturnValue(jest.fn())
  },
  formatDivergenceReading: jest.fn(reading => String(reading.reading)),
  formatWorldLineChange: jest.fn(change => String(change))
}));

// Use the mockMsalInstance that's already defined in your setup
const { instance: mockMsalInstance } = useMsal();

describe('Dashboard Component', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  const renderDashboardWithMocks = () => {
    return render(<Dashboard />);
  };

  test('renders and loads data successfully including WorldlineMonitor', async () => {
    // Make sure our mock returns something
    getAllGroups.mockResolvedValue([{ id: '1', displayName: 'Test Group' }]);
    
    renderDashboardWithMocks();
    
    // Verify WorldlineMonitor component is present at the top
    expect(screen.getByTestId('worldline-monitor-mock')).toBeInTheDocument();
    expect(screen.getByTestId('worldline-container')).toBeInTheDocument();
    expect(screen.getByTestId('worldline-container')).toHaveClass('mb-5');
    
    // Verify the separator is present between WorldlineMonitor and other content
    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveClass('my-5');
    
    // Wait for ALL data to load with a longer timeout
    await waitFor(() => {
      expect(screen.getByTestId('api-message-data')).toBeInTheDocument();
      expect(screen.getByTestId('groups-container')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    // Once data is loaded, verify display containers
    expect(screen.getByTestId('api-response-card')).toBeInTheDocument();

    // Verify API calls were made. The Dashboard passes an options bag
    // containing an AbortSignal so the request can be cancelled on
    // unmount (issue #113); the signal value is implementation-defined
    // so we match it loosely rather than asserting a specific shape.
    expect(getUserData).toHaveBeenCalledTimes(1);
    expect(getUserData).toHaveBeenCalledWith(mockMsalInstance, expect.objectContaining({ signal: expect.anything() }));
    expect(getAllGroups).toHaveBeenCalledTimes(1);
    // Issue #151: the mount-time fetch must stay non-interactive — a popup
    // from this effect is what escaped the installed PWA's window.
    expect(getAllGroups).toHaveBeenCalledWith(
      mockMsalInstance,
      expect.objectContaining({ signal: expect.anything(), interactive: false }),
    );
    
    // Verify tracking was called
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Home - Fetch data started' });
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Home - Fetch data completed' });
    
    // Verify Notyf success notification was shown
    expect(notyfService.success).toHaveBeenCalledWith('Data loaded successfully!');

    // Verify the content from the mock API file
    expect(screen.getByTestId('api-message-data')).toHaveTextContent('Hello from API');
  });

  test('handles API error correctly', async () => {
    // Override mock to throw an error for this test only
    const errorMessage = 'API Error';
    getUserData.mockImplementationOnce(() => {
      throw new Error(errorMessage);
    });
    
    renderDashboardWithMocks();
    
    // Verify WorldlineMonitor component is still present even with API error
    expect(screen.getByTestId('worldline-monitor-mock')).toBeInTheDocument();
    
    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    
    // Verify exception was tracked
    expect(appInsights.trackException).toHaveBeenCalled();
    
    // Verify Notyf error notification was shown with the correct message
    expect(notyfService.error).toHaveBeenCalledWith('Failed to load data: ' + errorMessage);
  });

  test('reload button fetches fresh data', async () => {
    // Mock implementation to track when promise resolves
    getUserData.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to simulate async
      return { message: "Hello from API" };
    });
    
    renderDashboardWithMocks();
    
    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByTestId('api-message-data')).toBeInTheDocument();
    });
    
    // Clear the mocks to check for new calls
    jest.clearAllMocks();
    
    // Click reload button
    fireEvent.click(screen.getByTestId('reload-button'));
    
    // Verify loading state
    expect(screen.getByTestId('reload-button')).toHaveTextContent(/Loading/);
    
    // Wait for the complete reload process, including notification
    await waitFor(() => {
      // Wait for loading to finish
      expect(screen.getByTestId('reload-button')).not.toHaveTextContent(/Loading/);
      
      // Check API calls
      expect(getUserData).toHaveBeenCalledTimes(1);
      expect(getAllGroups).toHaveBeenCalledTimes(1);
      
      // Now check the notification was called
      expect(notyfService.success).toHaveBeenCalledWith('Data loaded successfully!');
    }, { timeout: 3000 });
    
    // WorldlineMonitor component should stay rendered throughout
    expect(screen.getByTestId('worldline-monitor-mock')).toBeInTheDocument();
  });
  
  // Add a new test for the dashboardPage structure with WorldlineMonitor
  test('verifies dashboard layout with WorldlineMonitor at the top', () => {
    renderDashboardWithMocks();
    
    // Get the main container
    const dashboardPage = screen.getByTestId('dashboard-page');
    
    // Get both main sections
    const worldlineContainer = screen.getByTestId('worldline-container');
    const homeContainer = screen.getByTestId('home-container');
    
    // Verify structure: worldlineContainer should come before homeContainer
    expect(dashboardPage.firstChild).toBe(worldlineContainer);
    
    // Verify separator exists between the sections
    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    
    // Verify worldline container is immediately followed by the separator
    expect(worldlineContainer.nextElementSibling).toBe(separator);
    
    // Check that separator and home container are siblings (both children of dashboardPage)
    expect(separator.parentNode).toBe(dashboardPage);
    expect(homeContainer.parentNode).toBe(dashboardPage);
    
    // Verify that separator appears before home container in the DOM
    const separatorIndex = Array.from(dashboardPage.children).indexOf(separator);
    const homeContainerIndex = Array.from(dashboardPage.children).indexOf(homeContainer);
    expect(separatorIndex).toBeLessThan(homeContainerIndex);
  });

  describe('missing Graph consent (issue #151)', () => {
    const consentError = () => new GraphConsentRequiredError(['User.Read', 'Group.Read.All']);

    beforeEach(() => {
      getUserData.mockResolvedValue({ message: 'API response' });
      getWorldlineStatus.mockResolvedValue({});
      getWorldlineHistory.mockResolvedValue([]);
      getDivergenceReadings.mockResolvedValue([]);
    });

    test('degrades to a Grant access button instead of failing the page', async () => {
      // Before the fix a user without Group.Read.All consent got a popup per
      // navigation; the page itself also failed, because the groups fetch sat
      // inside the same Promise.all as the app's own API call.
      getAllGroups.mockRejectedValue(consentError());

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('groups-consent-required')).toBeInTheDocument();
      });

      // The rest of the dashboard still loaded.
      expect(screen.getByTestId('api-response-card')).toBeInTheDocument();
      expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
      expect(notyfService.error).not.toHaveBeenCalled();
    });

    test('the Grant access button is the only path that may open a popup', async () => {
      getAllGroups.mockRejectedValueOnce(consentError());

      render(<Dashboard />);
      await waitFor(() => {
        expect(screen.getByTestId('grant-groups-access-button')).toBeInTheDocument();
      });

      // Mount-time call was non-interactive.
      expect(getAllGroups).toHaveBeenNthCalledWith(
        1,
        mockMsalInstance,
        expect.objectContaining({ interactive: false }),
      );

      getAllGroups.mockResolvedValueOnce([{ id: '1', displayName: 'Granted Group' }]);
      fireEvent.click(screen.getByTestId('grant-groups-access-button'));

      // The click is a real user gesture, so this one may prompt.
      await waitFor(() => {
        expect(getAllGroups).toHaveBeenNthCalledWith(
          2,
          mockMsalInstance,
          expect.objectContaining({ interactive: true }),
        );
      });

      // A successful grant replaces the prompt with the groups list.
      await waitFor(() => {
        expect(screen.queryByTestId('groups-consent-required')).not.toBeInTheDocument();
      });
    });

    test('a non-consent Graph failure is still reported as an error', async () => {
      // The degraded path is only for consent. A genuine Graph outage must
      // not be silently rendered as "you need to grant access".
      getAllGroups.mockRejectedValue(new Error('Graph API error (503)'));

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('groups-consent-required')).not.toBeInTheDocument();
      expect(notyfService.error).toHaveBeenCalled();
    });
  });
});
describe('Dashboard — abort, grant-access failure and user-change paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // mockClear keeps non-once implementations other describes set, so
    // pin explicit defaults here instead of inheriting a rejecting mock.
    getUserData.mockResolvedValue({ message: 'Hello from API' });
    getAllGroups.mockResolvedValue([{ id: '1', displayName: 'Test Group' }]);
  });

  test('a caller-driven abort of the initial fetch is silent', async () => {
    // Issue #113: unmounting mid-fetch rejects with AbortError; that is
    // the normal path, not an error — nothing user-visible may fire.
    getUserData.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    render(<Dashboard />);

    // Let the fetch settle.
    await waitFor(() => {
      expect(getUserData).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('api-message-empty')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    expect(notyfService.error).not.toHaveBeenCalled();
    expect(appInsights.trackException).not.toHaveBeenCalledWith(
      expect.objectContaining({ exception: expect.objectContaining({ name: 'AbortError' }) })
    );
  });

  test('a failing Grant access request is reported and the page stays usable', async () => {
    // Mount without consent → prompt; the interactive retry then fails
    // for a non-consent reason, which grantGroupAccess must surface.
    getAllGroups.mockRejectedValueOnce(
      new GraphConsentRequiredError(['User.Read', 'Group.Read.All'])
    );
    getUserData.mockResolvedValueOnce({ message: 'Hello from API' });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('grant-groups-access-button')).toBeInTheDocument();
    });

    getAllGroups.mockRejectedValueOnce(new Error('Graph API error (503)'));
    fireEvent.click(screen.getByTestId('grant-groups-access-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent('Graph API error (503)');
    });
    expect(notyfService.error).toHaveBeenCalledWith('Failed to load groups: Graph API error (503)');
    expect(appInsights.trackException).toHaveBeenCalledWith({
      exception: expect.objectContaining({ message: 'Graph API error (503)' })
    });
    // The consent prompt stays up so the user can retry.
    expect(screen.getByTestId('grant-groups-access-button')).toBeInTheDocument();
  });

  test('an aborted Grant access request is silent', async () => {
    getAllGroups.mockRejectedValueOnce(
      new GraphConsentRequiredError(['User.Read', 'Group.Read.All'])
    );
    getUserData.mockResolvedValueOnce({ message: 'Hello from API' });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('grant-groups-access-button')).toBeInTheDocument();
    });

    getAllGroups.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );
    fireEvent.click(screen.getByTestId('grant-groups-access-button'));

    await waitFor(() => {
      expect(getAllGroups).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    expect(notyfService.error).not.toHaveBeenCalled();
  });

  test('re-fetches when the signed-in user changes, and leaves the cache alone otherwise', async () => {
    const accountSpy = jest.spyOn(mockMsalInstance, 'getActiveAccount')
      .mockReturnValue({ username: 'user-a@example.com', name: 'User A' });

    try {
      const { rerender } = render(<Dashboard />);
      await waitFor(() => {
        expect(screen.getByTestId('api-message-data')).toBeInTheDocument();
      });
      expect(getUserData).toHaveBeenCalledTimes(1);

      // A re-render where only the display NAME changed: the effect
      // re-runs (the name is in its dep array) but must neither log a
      // user change nor refetch.
      accountSpy.mockReturnValue({ username: 'user-a@example.com', name: 'User A (renamed)' });
      rerender(<Dashboard />);
      await act(async () => { await Promise.resolve(); });
      expect(getUserData).toHaveBeenCalledTimes(1);

      // The username itself changed → the cached data belongs to a
      // different user; the dashboard must reload.
      accountSpy.mockReturnValue({ username: 'user-b@example.com', name: 'User B' });
      rerender(<Dashboard />);
      await waitFor(() => {
        expect(getUserData).toHaveBeenCalledTimes(2);
      });
    } finally {
      accountSpy.mockRestore();
    }
  });
});
