import '@testing-library/jest-dom';
import { jestPreviewConfigure, debug } from 'jest-preview';
import { TextEncoder, TextDecoder } from 'util';
import PublicClientApplication from './mock/azureMsalBrowser';

// Provide TextEncoder/TextDecoder in the JSDOM environment for libraries like React Router
if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}


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

// Configure jest-preview
jestPreviewConfigure({
    port: 3336,
    autoOpen: true,
    cssFiles: ['src/index.css', 'src/App.css'], // Add your CSS files // Add your CSS files
    //debugOptions: { autoRefresh: true, pauseOnError: true }
    webServerOptions: { headers: {'Cache-Control': 'no-store'}}
  });

global.debug = debug;

// JSDOM does not implement window.matchMedia. The Settings/theme code
// reads prefers-color-scheme to follow OS preference, so provide a
// controllable stub. Default = light; tests that need dark override
// via `window.__setMatchMediaDark(true)`.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const OS_QUERY = '(prefers-color-scheme: dark)';
  let currentMatches = false;
  const listeners = new Set();
  window.matchMedia = (query) => {
    const mql = {
      matches: currentMatches,
      media: query,
      onchange: null,
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb),
      addEventListener: (_evt, cb) => listeners.add(cb),
      removeEventListener: (_evt, cb) => listeners.delete(cb),
      dispatchEvent: () => true,
    };
    return mql;
  };
  // Test-only escape hatch. Production code never touches this.
  window.__setMatchMediaDark = (matches) => {
    currentMatches = !!matches;
    const evt = { matches: currentMatches, media: OS_QUERY };
    listeners.forEach((cb) => { try { cb(evt); } catch (_) { /* ignore */ } });
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  if (typeof window !== 'undefined' && typeof window.__setMatchMediaDark === 'function') {
    window.__setMatchMediaDark(false);
  }
});

// Automatically open preview after each test
afterEach(() => {
  debug();
});
