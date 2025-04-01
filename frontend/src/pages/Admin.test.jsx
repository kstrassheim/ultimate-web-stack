import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from '@testing-library/react'; // Import act
import { useMsal } from '@azure/msal-react';
import Admin from './Admin';
import { getAdminData } from '@/api/api';
import appInsights from '@/log/appInsights';

// Use the mockMsalInstance that's already defined in jest.setup.js
const { instance: mockMsalInstance } = useMsal();



describe('Admin Component', () => {
  const renderAdminWithMocks = () => {
    return render(<Admin />);
  };

  test('renders and loads admin data successfully', async () => {
    getAdminData.mockResolvedValue({ message: 'Success', status: 200 });
    
    // Wrap rendering and any asynchronous updates in act
    await act(async () => {
      renderAdminWithMocks();
    });
    
    // Verify basic structure is present
    expect(screen.getByTestId('admin-heading')).toBeInTheDocument();
    
    //Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
    }, { timeout: 3000 });
    
    //Verify data is loaded
    expect(screen.getByTestId('admin-data-message')).toHaveTextContent('Success');
    
    // Verify tracking was called
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Admin - Fetch data started' });
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Admin - Fetch data completed' });
  });

  test('handles API error correctly', async () => {
    getAdminData.mockRejectedValueOnce(new Error('Admin API Error'));
    
    // Wrap rendering in act
    await act(async () => {
      renderAdminWithMocks(); // triggers the fetch on mount
    });
    
    // Wait for the component to handle the error
    await waitFor(() => {
      expect(screen.getByTestId('admin-error')).toBeInTheDocument();
    });
    
    // Verify exception tracking
    expect(appInsights.trackException).toHaveBeenCalled();
  });

  test('reload button fetches fresh admin data', async () => {
    getAdminData.mockResolvedValue({ message: 'Success', status: 200 });
    renderAdminWithMocks();
    
    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByTestId('admin-data-message')).toBeInTheDocument();
    });
    
    // Clear the mocks to check for new calls
    jest.clearAllMocks();
    
    // Click reload button
    fireEvent.click(screen.getByTestId('admin-reload-button'));
    
    // Wait for data to be reloaded
    await waitFor(() => {
      // The API was called again
      expect(getAdminData).toHaveBeenCalledTimes(1);
    });
  });
});