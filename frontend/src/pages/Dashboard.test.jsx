import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import Dashboard from './Dashboard';
import { getUserData } from '@/api/api';
import { getAllGroups } from '@/api/graphApi';
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
    
    // Verify WorldlineMonitor component is present
    expect(screen.getByTestId('worldline-monitor-mock')).toBeInTheDocument();
    expect(screen.getByTestId('worldline-container')).toBeInTheDocument();
    
    // Verify the separator is present between WorldlineMonitor and other content
    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveClass('my-5');
    
    // Verify basic structure is present
    expect(screen.getByRole('heading', { level: 1, name: /Home Page/i })).toBeInTheDocument();
    
    // Wait for ALL data to load with a longer timeout
    await waitFor(() => {
      expect(screen.getByTestId('api-message-data')).toBeInTheDocument();
      expect(screen.getByTestId('groups-container')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    // Once data is loaded, verify display containers
    expect(screen.getByTestId('api-response-card')).toBeInTheDocument();

    // Verify API calls were made
    expect(getUserData).toHaveBeenCalledTimes(1);
    expect(getUserData).toHaveBeenCalledWith(mockMsalInstance);
    expect(getAllGroups).toHaveBeenCalledTimes(1);
    expect(getAllGroups).toHaveBeenCalledWith(mockMsalInstance);
    
    // Verify tracking was called
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Home - Fetch data started' });
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Home - Fetch data completed' });
    
    // Verify Notyf success notification was shown
    expect(notyfService.success).toHaveBeenCalledWith('Data loaded successfully!');

    // Add these assertions after the existing tests in the 'renders and loads data successfully' test
    // Wait for ALL data to load with a longer timeout
    await waitFor(() => {
      expect(screen.getByTestId('api-message-data')).toBeInTheDocument();
      expect(screen.getByTestId('groups-container')).toBeInTheDocument();
      
      // Add additional checks for the content from the mock API file
      expect(screen.getByTestId('api-message-data')).toHaveTextContent('Hello from API');
    }, { timeout: 3000 });
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
});