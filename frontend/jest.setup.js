import '@testing-library/jest-dom';
import { jestPreviewConfigure, debug } from 'jest-preview';
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

// Also mock the appInsights instance directly
// Add this to your jest.setup.js
jest.mock('@/log/appInsights', () => {
  return {
    trackEvent: jest.fn(),
    trackException: jest.fn(),
    trackPageView: jest.fn(),
    trackMetric: jest.fn(),
    setAuthenticatedUserContext: jest.fn()
  };
});

// Mock graph API with spy wrappers
jest.mock('@/api/graphApi', () => {
  const actualMock = jest.requireActual('./mock/graphApi');
  
  // Create an object to hold all spied functions
  const spiedMock = { ...actualMock };
  
  // Spy on all functions exported from the mock
  Object.keys(actualMock).forEach(key => {
    if (typeof actualMock[key] === 'function') {
      spiedMock[key] = jest.fn().mockImplementation(actualMock[key]);
    }
  });
  
  return spiedMock;
});

// Mock API with spy wrappers
jest.mock('@/api/api', () => {
  const actualMock = jest.requireActual('./mock/api');
  
  // Create an object to hold all spied functions
  const spiedMock = { ...actualMock };
  
  // Spy on all functions exported from the mock
  Object.keys(actualMock).forEach(key => {
    if (typeof actualMock[key] === 'function') {
      spiedMock[key] = jest.fn().mockImplementation(actualMock[key]);
    }
  });
  
  return spiedMock;
});

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
    cssFiles: ['src/index.css', 'src/App.css'], // Add your CSS files // Add your CSS files
});
  

beforeEach(() => {
  jest.clearAllMocks();
  //debug();
});
  // Automatically open preview after each test
afterEach(() => {
  // You can conditionally call preview.debug() if needed.
  // Be aware this will trigger the preview for every test (which might slow down your test run).
  debug();
});
