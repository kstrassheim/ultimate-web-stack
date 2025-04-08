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
// Fix the AppInsights mock by directly returning the mock implementation
jest.mock('@/log/appInsights', () => {
  // Get the original mock
  const originalMock = jest.requireActual('./mock/appInsights').default;
  
  // Create a new object with the same properties
  const spiedMock = { ...originalMock };
  
  // Add spies to all functions while preserving their implementation
  Object.keys(originalMock).forEach(key => {
    if (typeof originalMock[key] === 'function') {
      // Create a spy that calls the original implementation
      spiedMock[key] = jest.fn().mockImplementation((...args) => 
        originalMock[key](...args)
      );
    }
  });
  
  return spiedMock;
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
    env: 'dev',
    isDev: false,
    isProd: false,
    productionUrl: '',
    developmentUrl: 'http://localhost:5173',
    backendUrl: '',
    frontendUrl: 'http://localhost:5173'
  }));

// Mock the terraform.config.json import
jest.mock('@/../terraform.config.json', () => ({
  client_id: { value: 'mock-client-id' },
  tenant_id: { value: 'mock-tenant-id' },
  oauth2_permission_scope_uri: { value: 'api://mock-app/access' },
  oauth2_permission_scope: { value: 'access_as_user' },
  requested_graph_api_delegated_permissions: { 
    value: ['User.Read', 'Group.Read.All'] 
  },
  web_url: { value: 'https://mock-app.azurewebsites.net' },
  application_insights_connection_string: { 
    value: 'InstrumentationKey=mock-key;IngestionEndpoint=https://mock-endpoint' 
  },
  env: { value: 'dev' }
}), { virtual: true });

// Configure jest-preview
jestPreviewConfigure({
    port: 3336,
    autoOpen: true,
    cssFiles: ['src/index.css', 'src/App.css'], // Add your CSS files // Add your CSS files
    //debugOptions: { autoRefresh: true, pauseOnError: true }
    webServerOptions: { headers: {'Cache-Control': 'no-store'}}
  });

global.debug = debug;

beforeEach(() => {
  jest.clearAllMocks();
});

// Automatically open preview after each test
afterEach(() => {
  debug();
});
