import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MsalProvider, useMsal } from '@azure/msal-react';
import Home from './Home';
import { getUserData } from '@/api/api';
import { getAllGroups } from '@/api/graphApi';
import appInsights from '@/log/appInsights';

// Mock dependencies
jest.mock('@/api/api');
jest.mock('@/api/graphApi');
jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

// Sample mock data
const mockUserData = { message: 'Test user data' };
const mockGroups = [
  { id: '1', displayName: 'Group 1', description: 'Description 1', mail: 'group1@example.com' },
  { id: '2', displayName: 'Group 2', description: 'Description 2', mail: 'group2@example.com' }
];

// Use the mockMsalInstance that's already defined in your setup
const { instance: mockMsalInstance } = useMsal();

describe('Home Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Mock API calls
    getUserData.mockResolvedValue(mockUserData);
    getAllGroups.mockResolvedValue(mockGroups);
  });
  
  const renderHomeWithMocks = () => {
    return render(<Home />);
  };

  test('renders and loads data successfully', async () => {
    renderHomeWithMocks();
    
    // Verify heading is present
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test user data')).toBeInTheDocument();
    });
    
    // Verify that groups are displayed
    expect(screen.getByText('Groups from Microsoft Graph API')).toBeInTheDocument();
    expect(screen.getByTestId('groups-container')).toBeInTheDocument();
    expect(screen.getByTestId('group-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('group-row-2')).toBeInTheDocument();
    
    // Verify API calls were made
    expect(getUserData).toHaveBeenCalledTimes(1);
    expect(getUserData).toHaveBeenCalledWith(mockMsalInstance);
    expect(getAllGroups).toHaveBeenCalledTimes(1);
    expect(getAllGroups).toHaveBeenCalledWith(mockMsalInstance);
    
    // Verify tracking was called
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Home - Fetch data started' });
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Home - Fetch data completed' });
  });

  test('handles API error correctly', async () => {
    // Mock API failure
    getUserData.mockRejectedValue(new Error('API Error'));
    
    renderHomeWithMocks();
    
    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText('Error: API Error')).toBeInTheDocument();
    });
    
    // Verify exception was tracked
    expect(appInsights.trackException).toHaveBeenCalled();
  });

  test('reload button fetches fresh data', async () => {
    renderHomeWithMocks();
    
    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByText('Test user data')).toBeInTheDocument();
    });
    
    // Clear the mocks to check for new calls
    jest.clearAllMocks();
    
    // Update mock data for second call
    getUserData.mockResolvedValue({ message: 'Updated data' });
    
    // Click reload button
    fireEvent.click(screen.getByText('Reload Data'));
    
    // Verify loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Wait for updated data
    await waitFor(() => {
      expect(screen.getByText('Updated data')).toBeInTheDocument();
    });
    
    // Verify API calls were made again
    expect(getUserData).toHaveBeenCalledTimes(1);
    expect(getAllGroups).toHaveBeenCalledTimes(1);
  });
});