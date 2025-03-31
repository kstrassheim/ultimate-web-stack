import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import Home from './Home';
import { getUserData } from '@/api/api';
import { getAllGroups } from '@/api/graphApi';
import appInsights from '@/log/appInsights';

// Use the mockMsalInstance that's already defined in your setup
const { instance: mockMsalInstance } = useMsal();

describe('Home Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });
  
  const renderHomeWithMocks = () => {
    return render(<Home />);
  };

  test('renders and loads data successfully', async () => {
    // Make sure our mock returns something
    getAllGroups.mockResolvedValue([{ id: '1', displayName: 'Test Group' }]);
    
    renderHomeWithMocks();
    
    // Verify basic structure is present
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    
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
    getUserData.mockImplementationOnce(() => {
      throw new Error('API Error');
    });
    
    renderHomeWithMocks();
    
    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    
    // Verify exception was tracked
    expect(appInsights.trackException).toHaveBeenCalled();
  });

  test('reload button fetches fresh data', async () => {
    renderHomeWithMocks();
    
    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByTestId('api-message-data')).toBeInTheDocument();
      expect(screen.getByTestId('groups-container')).toBeInTheDocument();
      
      // Verify content matches the mock API response
      expect(screen.getByTestId('api-message-data')).toHaveTextContent('Hello from API');
    });
    
    // Clear the mocks to check for new calls
    jest.clearAllMocks();
    
    // Click reload button
    fireEvent.click(screen.getByTestId('reload-button'));
    
    // Verify loading state
    expect(screen.getByTestId('reload-button')).toHaveTextContent(/Loading/);
    
    // Wait for data to be reloaded
    await waitFor(() => {
      // The API was called again
      expect(getUserData).toHaveBeenCalledTimes(1);
    });
    
    // Verify API calls were made again with the same parameters
    expect(getUserData).toHaveBeenCalledWith(mockMsalInstance);
    expect(getAllGroups).toHaveBeenCalledTimes(1);
    expect(getAllGroups).toHaveBeenCalledWith(mockMsalInstance);
  });
});