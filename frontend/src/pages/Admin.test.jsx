import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useMsal } from '@azure/msal-react';
import Admin from './Admin';
import { getAdminData } from '@/api/api';
import { getAllUsers } from '@/api/graphApi';
import appInsights from '@/log/appInsights';
import { debug } from 'jest-preview';

// We'll use the mockMsalInstance that's already defined in jest.setup.js
const { instance: mockMsalInstance } = useMsal();

describe('Admin Component', () => {
  const renderAdminWithMocks = () => {
    return render(<Admin />);
  };

  test('renders and loads admin data successfully', async () => {
    renderAdminWithMocks();
    
    // Verify basic structure is present
    expect(screen.getByRole('heading', { level: 1, name: /Admin Dashboard/i })).toBeInTheDocument();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('admin-stats-container')).toBeInTheDocument();
      expect(screen.getByTestId('users-table')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    // Verify API calls were made using the existing mocks
    expect(getAdminData).toHaveBeenCalledTimes(1);
    expect(getAllUsers).toHaveBeenCalledTimes(1);
    
    // Verify tracking was called
    expect(appInsights.trackEvent).toHaveBeenCalled();
  });

  test('handles API error correctly', async () => {
    // Override mock to throw an error for this test only
    getAdminData.mockImplementationOnce(() => {
      throw new Error('Admin API Error');
    });
    
    renderAdminWithMocks();
    
    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByTestId('admin-error-message')).toBeInTheDocument();
    });
    
    // Verify exception was tracked
    expect(appInsights.trackException).toHaveBeenCalled();
  });

  test('refresh button fetches fresh admin data', async () => {
    renderAdminWithMocks();
    
    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByTestId('admin-stats-container')).toBeInTheDocument();
    });
    
    // Clear the mocks to check for new calls
    jest.clearAllMocks();
    
    // Click refresh button
    fireEvent.click(screen.getByTestId('admin-refresh-button'));
    
    // Wait for data to be reloaded
    await waitFor(() => {
      // The API was called again
      expect(getAdminData).toHaveBeenCalledTimes(1);
      expect(getAllUsers).toHaveBeenCalledTimes(1);
    });
  });

  test('user filter works correctly', async () => {
    // Setup mock users with different roles for filtering
    getAllUsers.mockResolvedValueOnce([
      { id: '1', displayName: 'User One', mail: 'user1@example.com', jobTitle: 'Developer' },
      { id: '2', displayName: 'User Two', mail: 'user2@example.com', jobTitle: 'Manager' }
    ]);
    
    renderAdminWithMocks();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('users-table')).toBeInTheDocument();
    });
    
    // Type in the filter input
    const filterInput = screen.getByTestId('user-filter-input');
    fireEvent.change(filterInput, { target: { value: 'Developer' } });
    
    // Wait for filtered results
    await waitFor(() => {
      expect(screen.getByText('User One')).toBeInTheDocument();
      expect(screen.queryByText('User Two')).not.toBeInTheDocument();
    });
  });

  test('sorting user table works correctly', async () => {
    renderAdminWithMocks();
    //debug();
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('users-table')).toBeInTheDocument();
    });
    
    // Find and click the name column header to sort
    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);
    
    // Verify sort was tracked (if your component tracks this)
    expect(appInsights.trackEvent).toHaveBeenCalled();
    
    // Click again to reverse sort
    fireEvent.click(nameHeader);
    
    // Verify second sort was tracked (if applicable)
    expect(appInsights.trackEvent).toHaveBeenCalledTimes(2);
  });
});