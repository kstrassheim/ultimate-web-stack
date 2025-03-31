import '@testing-library/jest-dom';
import { jestPreviewConfigure, preview } from 'jest-preview';
import PublicClientApplication from './mock/azureMsalBrowser';

global.import = { meta: { env: { MODE: 'test', PROD: false, DEV: false } } };

// Create a mock MSAL instance using the full implementation
const mockMsalInstance = new PublicClientApplication({
    auth: {
      clientId: 'test-client-id',
      authority: 'https://login.microsoftonline.com/common'
    }
  });

// Mock the MSAL components
jest.mock('@azure/msal-react', () => ({
    useMsal: jest.fn().mockReturnValue({
      instance: mockMsalInstance,
      accounts: mockMsalInstance.getAllAccounts(),
      inProgress: "none"
    }),
    // Keep the component mocks
    MsalProvider: ({ children }) => children,
    AuthenticatedTemplate: ({ children }) => children,
    UnauthenticatedTemplate: ({ children }) => children
  }));

// Mock config.js entirely - this is the most reliable approach
jest.mock('@/config', () => ({
    env: 'test',
    isDev: false,
    isProd: false,
    productionUrl: '',
    developmentUrl: 'http://localhost:5173',
    backendUrl: '',
    frontendUrl: 'http://localhost:5173'
  }));


// Configure jest-preview
jestPreviewConfigure({
    // Optional: Specify a custom port (default is 3336)
    port: 3336,
    // Optional: Automatically open preview after the first debug() call
    autoOpen: true,
  });
  
  // Make preview globally available
  global.preview = preview;
  
  // Add a convenience function for quick debugging
  global.debugComponent = () => {
    console.log('⚡ Component rendered in preview - http://localhost:3336');
    preview.debug();
  };
  