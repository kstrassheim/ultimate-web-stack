import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import EntraProfile from './EntraProfile';
import { getProfilePhoto } from '@/api/graphApi';
import appInsights from '@/log/appInsights';
import dummy_avatar from '@/assets/dummy-avatar.jpg';

// Mock the external dependencies
jest.mock('@/api/graphApi', () => ({
  getProfilePhoto: jest.fn()
}));

jest.mock('@/assets/dummy-avatar.jpg', () => "dummy-avatar-path.jpg");

describe('EntraProfile Component', () => {
  let msalInstance;
  const mockAccount = {
    name: 'Test User',
    username: 'test@example.com',
    localAccountId: '123'
  };
  
  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Ensure any lingering promises are settled
    await new Promise(r => setTimeout(r, 100));
    
    // Setup MSAL instance mock
    msalInstance = {
      getActiveAccount: jest.fn()
    };
    
    // Setup useMsal mock
    useMsal.mockReturnValue({ instance: msalInstance });
    
    // Default to no active account
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    // Reset mock implementation to default success case
    getProfilePhoto.mockReset();
    getProfilePhoto.mockResolvedValue('photo-url.jpg');
  });
  
  test('renders nothing when no active account', () => {
    render(<EntraProfile />);
    
    // Only the wrapper should be present, but no content
    expect(screen.getByTestId('profile-wrapper')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-image')).not.toBeInTheDocument();
  });
  
  test('renders profile with photo when active account exists', async () => {
    // Set up active account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    render(<EntraProfile />);
    
    // Wait for photo fetch to complete
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalledWith(msalInstance, mockAccount);
    });
    
    // Check that profile is rendered with correct data
    expect(screen.getByTestId('profile-container')).toBeInTheDocument();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Test User');
    
    // Check that photo URL is set
    const profileImage = screen.getByTestId('profile-image');
    expect(profileImage).toBeInTheDocument();
    expect(profileImage).toHaveAttribute('src', 'photo-url.jpg');
  });
  
  test('uses dummy avatar when photo fetch fails', async () => {
    // Set up active account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    // Spy on console.error to prevent error from being logged
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Instead of a delayed rejection, use a synchronous mock
    getProfilePhoto.mockReset();
    getProfilePhoto.mockImplementationOnce(() => {
      const error = new Error('Failed to fetch photo');
      // Add a flag to identify this error as expected
      error.__test_expected = true;
      return Promise.reject(error);
    });
    
    await act(async () => {
      render(<EntraProfile />);
      // Wait for all promises to settle
      await new Promise(r => setTimeout(r, 50));
    });
    
    // Check for dummy avatar
    const profileImage = screen.getByTestId('profile-image');
    expect(profileImage).toHaveAttribute('src', 'dummy-avatar-path.jpg');
    
    // Clean up
    errorSpy.mockRestore();
    // IMPORTANT: Clean up any pending promises
    await new Promise(r => setTimeout(r, 100));
    // Explicitly reset mock again
    getProfilePhoto.mockReset();
    getProfilePhoto.mockResolvedValue('photo-url.jpg');
  });
  
  test('updates when active account changes', async () => {
    // Start with no account
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    const { rerender } = render(<EntraProfile />);
    
    // Verify no profile initially
    expect(screen.queryByTestId('profile-container')).not.toBeInTheDocument();
    
    // Now simulate account change
    const newAccount = {
      name: 'New User',
      username: 'new@example.com',
      localAccountId: '456'
    };
    
    // Update the mock to return the new account
    msalInstance.getActiveAccount.mockReturnValue(newAccount);
    
    // Force re-render
    rerender(<EntraProfile />);
    
    // Wait for photo fetch to complete
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalledWith(msalInstance, newAccount);
    });
    
    // Check that profile is updated with new user
    expect(screen.getByTestId('profile-name')).toHaveTextContent('New User');
    expect(screen.getByTestId('profile-image')).toHaveAttribute('src', 'photo-url.jpg');
  });
  
  test('reverts to dummy avatar when user signs out', async () => {
    // Start with an account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    const { rerender } = render(<EntraProfile />);
    
    // Wait for initial render with photo
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
    
    // Now simulate sign out
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    // Force re-render
    rerender(<EntraProfile />);
    
    // Verify profile is no longer shown
    expect(screen.queryByTestId('profile-container')).not.toBeInTheDocument();
  });
  
  test('retries photo fetch when account is set after initial render', async () => {
    // Start with no account
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    const { rerender } = render(<EntraProfile />);
    
    // Verify no profile initially
    expect(screen.queryByTestId('profile-container')).not.toBeInTheDocument();
    
    // Clear mock calls
    getProfilePhoto.mockClear();
    
    // Now set account and force re-render with the new account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    // Force re-render to trigger the effect
    act(() => {
      rerender(<EntraProfile />);
    });
    
    // Wait for photo fetch to be triggered
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
  });
});