import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import EntraLogon from './EntraLogon';
import appInsights from '@/log/appInsights';
import { useNavigate } from 'react-router-dom';

// Add this with your other mocks at the top of the file
jest.mock('@/auth/entraAuth', () => ({
  loginRequest: { 
    scopes: ['User.Read'] 
  }
}));

// Mock only the react-router-dom's useNavigate
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn()
}));

describe('EntraLogon Component', () => {
  let mockNavigate;
  let msalInstance;
  
  beforeEach(() => {
    // Setup navigate mock
    mockNavigate = jest.fn();
    useNavigate.mockReturnValue(mockNavigate);
    
    // Get the msal instance that's already set up in jest.setup.js
    msalInstance = useMsal().instance;
    
    // Mock sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn()
      },
      writable: true
    });
  });

  test('renders sign-in button when no accounts', () => {
    // Mock no accounts for this test
    jest.spyOn(msalInstance, 'getAllAccounts').mockReturnValueOnce([]);
    
    render(<EntraLogon />);
    
    expect(screen.getByTestId('entra-logon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('renders sign-out button when accounts exist', () => {
    // Mock accounts present
    jest.spyOn(msalInstance, 'getAllAccounts').mockReturnValueOnce([
      { username: 'test@example.com' }
    ]);
    
    render(<EntraLogon />);
    
    expect(screen.getByTestId('entra-logon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change account/i })).toBeInTheDocument();
  });

  test('handles login successfully', async () => {
    // Mock no accounts initially
    jest.spyOn(msalInstance, 'getAllAccounts').mockReturnValueOnce([]);
    
    // Add this line to spy on setActiveAccount
    jest.spyOn(msalInstance, 'setActiveAccount');
    
    // Mock successful login
    const mockAccount = { username: 'test@example.com' };
    jest.spyOn(msalInstance, 'loginPopup').mockResolvedValueOnce({ account: mockAccount });
    
    // Mock redirect path in session storage
    window.sessionStorage.getItem.mockReturnValueOnce('/dashboard');
    
    render(<EntraLogon />);
    
    // Trigger login
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for async operations
    await waitFor(() => {
      // Verify login was called with correct parameters
      expect(msalInstance.loginPopup).toHaveBeenCalled();
      
      // Verify active account was set
      expect(msalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      
      // Verify redirect happened
      expect(window.sessionStorage.getItem).toHaveBeenCalledWith('redirectPath');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      
      // Verify telemetry
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Logon started' });
    });
  });

  test('handles login errors', async () => {
    // Mock no accounts
    jest.spyOn(msalInstance, 'getAllAccounts').mockReturnValueOnce([]);
    
    // Mock login error
    const error = new Error('Login failed');
    jest.spyOn(msalInstance, 'loginPopup').mockRejectedValueOnce(error);
    
    // Spy on console.error
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<EntraLogon />);
    
    // Trigger login
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for async operations
    await waitFor(() => {
      // Verify error was tracked
      expect(appInsights.trackException).toHaveBeenCalledWith({ error });
      expect(console.error).toHaveBeenCalled();
    });
  });

  test('handles logout', async () => {
    // Mock accounts present
    jest.spyOn(msalInstance, 'getAllAccounts').mockReturnValueOnce([
      { username: 'test@example.com' }
    ]);
    
    // Mock successful logout
    jest.spyOn(msalInstance, 'logoutPopup').mockResolvedValueOnce();
    
    render(<EntraLogon />);
    
    // Trigger logout
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    
    // Wait for async operations
    await waitFor(() => {
      expect(msalInstance.logoutPopup).toHaveBeenCalled();
    });
  });

  test('handles account switching', async () => {
    // Mock accounts present
    jest.spyOn(msalInstance, 'getAllAccounts').mockReturnValueOnce([
      { username: 'test@example.com' }
    ]);
    
    // Mock successful account switch
    jest.spyOn(msalInstance, 'loginPopup').mockResolvedValueOnce({
      account: { username: 'new@example.com' }
    });
    
    render(<EntraLogon />);
    
    // Trigger account switch
    fireEvent.click(screen.getByRole('button', { name: /change account/i }));
    
    // Wait for async operations
    await waitFor(() => {
      // Verify login was called with account selection prompt
      expect(msalInstance.loginPopup).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'select_account' })
      );
    });
  });
});