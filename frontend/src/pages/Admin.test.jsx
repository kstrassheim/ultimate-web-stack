import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from '@testing-library/react'; // Import act
import { useMsal } from '@azure/msal-react';
import Admin from './Admin';
import { getAdminData } from '@/api/api';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

// Mock the notyfService
jest.mock('@/log/notyfService', () => ({
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn()
}));

// Use the mockMsalInstance that's already defined in jest.setup.js
const { instance: mockMsalInstance } = useMsal();

describe('Admin Component', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

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
    
    // Verify Notyf success notification was shown
    expect(notyfService.success).toHaveBeenCalledWith('Data reloaded successfully!');
  });

  test('handles API error correctly', async () => {
    const errorMessage = 'Admin API Error';
    getAdminData.mockRejectedValueOnce(new Error(errorMessage));
    
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
    
    // Verify Notyf error notification was shown with the correct message
    expect(notyfService.error).toHaveBeenCalledWith('Failed to load data: ' + errorMessage);
  });

  test('reload button fetches fresh admin data', async () => {
    // Use a mock implementation that resolves after a short delay
    getAdminData.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50)); // Increase delay for stability
      return { message: 'Success', status: 200 };
    });
    
    // Render the component
    renderAdminWithMocks();
    
    // First, wait for initial data load to complete
    await waitFor(() => {
      expect(screen.getByTestId('admin-data-message')).toBeInTheDocument();
      expect(screen.getByTestId('admin-data-message')).toHaveTextContent('Success');
    }, { timeout: 3000 });
    
    // Clear all mocks AFTER initial data load
    jest.clearAllMocks();
    
    // Use act to wrap the button click for state updates
    await act(async () => {
      fireEvent.click(screen.getByTestId('admin-reload-button'));
    });
    
    // Verify the button shows loading state
    expect(screen.getByTestId('admin-reload-button')).toHaveTextContent(/Loading/);
    
    // Wait for the reload to complete (this is critical)
    await waitFor(() => {
      expect(screen.getByTestId('admin-reload-button')).not.toHaveTextContent(/Loading/);
    }, { timeout: 3000 });
    
    // Now verify the API and notification calls
    expect(getAdminData).toHaveBeenCalledTimes(1);
    expect(getAdminData).toHaveBeenCalledWith(mockMsalInstance);
    expect(notyfService.success).toHaveBeenCalledWith('Data reloaded successfully!');
  });
});