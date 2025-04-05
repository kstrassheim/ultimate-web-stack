import React from 'react';
import { render, screen, waitFor, act, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import EntraProfile from './EntraProfile';
import { getProfilePhoto } from '@/api/graphApi';
import appInsights from '@/log/appInsights';
import dummy_avatar from '@/assets/dummy-avatar.jpg';
import { MemoryRouter } from 'react-router-dom';

// Mock React Router hooks
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/test' })
}));

// Mock the external dependencies
jest.mock('@/api/graphApi', () => ({
  getProfilePhoto: jest.fn()
}));

jest.mock('@/assets/dummy-avatar.jpg', () => "dummy-avatar-path.jpg");

// Required wrapper for component due to router hooks
const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter 
      initialEntries={['/test']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {ui}
    </MemoryRouter>
  );
};

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
    
    // Setup MSAL instance mock with required functions
    msalInstance = {
      getActiveAccount: jest.fn().mockReturnValue(null), // Default to null
      loginPopup: jest.fn().mockResolvedValue({ account: mockAccount }),
      setActiveAccount: jest.fn(),
      logoutPopup: jest.fn().mockResolvedValue({}),
    };
    
    // Setup useMsal mock
    useMsal.mockReturnValue({ instance: msalInstance });
    
    // Mock sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true
    });
    
    // Default photo mock
    getProfilePhoto.mockResolvedValue('photo-url.jpg');
  });
  
  test('renders sign-in button when no active account', () => {
    // Explicitly ensure no active account
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    renderWithRouter(<EntraProfile />);
    
    // Check for wrapper and unauthenticated container
    expect(screen.getByTestId('profile-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('unauthenticated-container')).toBeInTheDocument();
    
    // Check for sign-in button
    expect(screen.getByTestId('sign-in-button')).toBeInTheDocument();
    
    // Ensure authenticated elements are not present - using queryByTestId which returns null if not found
    expect(screen.queryByTestId('profile-image')).not.toBeInTheDocument();
  });
  
  test('renders profile dropdown when authenticated', async () => {
    // Set up active account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    renderWithRouter(<EntraProfile />);
    
    // Wait for photo fetch to complete
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalledWith(msalInstance, mockAccount);
    });
    
    // Check that authenticated container is rendered
    expect(screen.getByTestId('authenticated-container')).toBeInTheDocument();
    expect(screen.getByTestId('profile-dropdown')).toBeInTheDocument();
    
    // Check profile image
    const profileImage = screen.getByTestId('profile-image');
    expect(profileImage).toBeInTheDocument();
    expect(profileImage).toHaveAttribute('src', 'photo-url.jpg');
  });
  
  test('uses dummy avatar when photo fetch fails', async () => {
    // Set up active account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    // Spy on console.error
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock photo fetch failure
    getProfilePhoto.mockRejectedValue(new Error('Failed to fetch photo'));
    
    renderWithRouter(<EntraProfile />);
    
    // Wait for error handling to complete
    await waitFor(() => {
      expect(appInsights.trackException).toHaveBeenCalled();
    });
    
    // Check for dummy avatar
    const profileImage = screen.getByTestId('profile-image');
    expect(profileImage).toHaveAttribute('src', 'dummy-avatar-path.jpg');
  });
  
  test('calls loginPopup when sign-in button is clicked', async () => {
    // Ensure no active account
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    renderWithRouter(<EntraProfile />);
    
    // Click the sign-in button
    const signInButton = screen.getByTestId('sign-in-button');
    fireEvent.click(signInButton);
    
    // Verify login was attempted
    expect(msalInstance.loginPopup).toHaveBeenCalled();
    expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Logon started' });
    
    // Wait for login to complete
    await waitFor(() => {
      expect(msalInstance.setActiveAccount).toHaveBeenCalled();
    });
  });
  
  test('shows dropdown menu when clicking profile image', async () => {
    // Set up active account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    renderWithRouter(<EntraProfile />);
    
    // Wait for photo fetch to complete
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
    
    // Click profile image to open dropdown
    const profileImage = screen.getByTestId('profile-image');
    fireEvent.click(profileImage);
    
    // Check dropdown menu items by testId instead of text
    expect(screen.getByTestId('change-account-button')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
  });
  
  test('calls logoutPopup when sign-out button is clicked', async () => {
    // Set up active account
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    
    renderWithRouter(<EntraProfile />);
    
    // Wait for photo fetch
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
    
    // Click profile image to open dropdown
    const profileImage = screen.getByTestId('profile-image');
    fireEvent.click(profileImage);
    
    // Click sign-out button
    const signOutButton = screen.getByTestId('sign-out-button');
    fireEvent.click(signOutButton);
    
    // Verify logout was attempted
    expect(msalInstance.logoutPopup).toHaveBeenCalled();
  });
  
  test('updates when active account changes', async () => {
    // Start with no account
    msalInstance.getActiveAccount.mockReturnValue(null);
    const { rerender } = renderWithRouter(<EntraProfile />);
    
    // Verify sign-in button initially
    expect(screen.getByTestId('sign-in-button')).toBeInTheDocument();
    
    // Now simulate account change
    const newAccount = {
      name: 'New User',
      username: 'new@example.com',
      localAccountId: '456'
    };
    
    // Update the mock to return the new account
    msalInstance.getActiveAccount.mockReturnValue(newAccount);
    
    // Force re-render
    rerender(
      <MemoryRouter 
        initialEntries={['/test']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <EntraProfile />
      </MemoryRouter>
    );
    
    // Wait for photo fetch to complete
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalledWith(msalInstance, newAccount);
    });
    
    // Check authenticated container now present
    expect(screen.getByTestId('authenticated-container')).toBeInTheDocument();
  });

  test('displays tooltip on mouse enter and hides on mouse leave', async () => {
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    renderWithRouter(<EntraProfile />);
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
  
    const profileImage = screen.getByTestId('profile-image');
    
    // Initially, tooltip should not be visible
    const tooltipSelector = '.profile-custom-tooltip';
    expect(screen.queryByText(mockAccount.name, { selector: tooltipSelector })).not.toBeInTheDocument();
    
    // Mouse enter: tooltip appears with class profile-custom-tooltip
    fireEvent.mouseEnter(profileImage);
    expect(screen.queryByText(mockAccount.name, { selector: tooltipSelector })).toBeInTheDocument();

    // Mouse leave: tooltip becomes invisible
    fireEvent.mouseLeave(profileImage);
    
    // Toggle the dropdown to reset states
    const dropdownToggle = screen.getByTestId('profile-dropdown').querySelector('.dropdown-toggle');
    fireEvent.click(dropdownToggle);  // Open dropdown
    fireEvent.click(dropdownToggle);  // Close dropdown
    
    // Now check that tooltip (specifically) is gone
    await waitFor(() => {
      expect(screen.queryByText(mockAccount.name, { selector: tooltipSelector })).not.toBeInTheDocument();
    });
  });
  
  test('forces a new login (change account) when selected', async () => {
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    msalInstance.loginPopup = jest.fn(); // Use msalInstance, not instance
    renderWithRouter(<EntraProfile />);
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
  
    // Open profile menu and click "change account"
    fireEvent.click(screen.getByTestId('profile-image'));
    fireEvent.click(screen.getByTestId('change-account-button'));
  
    // Ensure logon function is called with forcePopup
    expect(msalInstance.loginPopup).toHaveBeenCalledWith(expect.objectContaining({}));
  });
  
  test('logs out and navigates away when sign-out is clicked', async () => {
    msalInstance.getActiveAccount.mockReturnValue(mockAccount);
    msalInstance.logoutPopup = jest.fn(); // Use msalInstance, not instance
    renderWithRouter(<EntraProfile />);
    await waitFor(() => {
      expect(getProfilePhoto).toHaveBeenCalled();
    });
  
    // Open menu and click "sign out"
    fireEvent.click(screen.getByTestId('profile-image'));
    fireEvent.click(screen.getByTestId('sign-out-button'));
  
    // Ensure logout logic ran
    expect(msalInstance.logoutPopup).toHaveBeenCalled();
    // If your code navigates after logout, verify that as well:
    // expect(mockedNavigate).toHaveBeenCalledWith('/post-logout');
  });

  test('redirects to saved path after successful login', async () => {
    // Set up initial state - no active account
    msalInstance.getActiveAccount.mockReturnValue(null);
    
    // Mock sessionStorage
    const originalGetItem = window.sessionStorage.getItem;
    const originalRemoveItem = window.sessionStorage.removeItem;
    
    window.sessionStorage.getItem = jest.fn().mockReturnValue('/admin');
    window.sessionStorage.removeItem = jest.fn();
    
    // Mock navigate function
    const mockedNavigate = jest.fn();
    jest.spyOn(require('react-router-dom'), 'useNavigate').mockReturnValue(mockedNavigate);
    
    // Mock successful login response
    msalInstance.loginPopup.mockResolvedValue({
      account: mockAccount
    });
    
    // Render component
    renderWithRouter(<EntraProfile />);
    
    // Click sign-in button
    fireEvent.click(screen.getByTestId('sign-in-button'));
    
    // Wait for login process to complete
    await waitFor(() => {
      expect(msalInstance.loginPopup).toHaveBeenCalledWith(expect.objectContaining({}));
      expect(msalInstance.setActiveAccount).toHaveBeenCalled();
    });
    
    // Verify sessionStorage interactions
    expect(window.sessionStorage.getItem).toHaveBeenCalledWith('redirectPath');
    expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('redirectPath');
    
    // Verify navigation
    expect(mockedNavigate).toHaveBeenCalledWith('/admin', { replace: true });
    
    // Restore original sessionStorage methods
    window.sessionStorage.getItem = originalGetItem;
    window.sessionStorage.removeItem = originalRemoveItem;
  });
});