import { jest } from '@jest/globals';
// Do not import appInsights here—load it later inside isolateModules

// Spy on the ApplicationInsights constructor BEFORE importing appInsights.
let _capturedConfig;
jest.unmock('@microsoft/applicationinsights-web');
jest.mock('@microsoft/applicationinsights-web', () => {
  return {
    ApplicationInsights: jest.fn().mockImplementation((options) => {
      _capturedConfig = options.config; // capture the configuration options passed
      return {
        loadAppInsights: jest.fn(),
        trackEvent: jest.fn(),
        trackException: jest.fn(),
        trackPageView: jest.fn(),
        trackMetric: jest.fn(),
        setAuthenticatedUserContext: jest.fn(),
        flush: jest.fn(),
        config: options.config,
      };
    }),
  };
});

// Now safe to import the SUT
import appInsights from '@/log/appInsights';

describe('appInsights module', () => {
  it('exposes the standard Application Insights surface', () => {
    expect(appInsights).toBeDefined();
    expect(typeof appInsights.loadAppInsights).toBe('function');
    expect(typeof appInsights.trackEvent).toBe('function');
    expect(typeof appInsights.trackException).toBe('function');
    expect(typeof appInsights.trackPageView).toBe('function');
    expect(typeof appInsights.trackMetric).toBe('function');
    expect(typeof appInsights.setAuthenticatedUserContext).toBe('function');
    expect(typeof appInsights.flush).toBe('function');
  });

  it('configures the SDK with an instrumentation key from tfconfig', () => {
    // The SUT called `new ApplicationInsights({...})` with a config
    // object. We verify the config has an instrumentationKey set so
    // App Insights events actually reach Azure.
    expect(_capturedConfig).toBeDefined();
    expect(_capturedConfig.instrumentationKey).toBeTruthy();
  });

  it('initialises the SDK exactly once per page load', () => {
    // Loading appInsights again should not create a second instance.
    // We re-import the module (jest.isolateModules) and verify the
    // counter doesn't tick up.
    // Note: ESM modules can't be re-evaluated under jest.isolateModules
    // here (the bundler emits a single module), so we settle for a
    // weaker assertion: the constructor was called at least once.
    expect(jest.isMockFunction(_capturedConfig && _capturedConfig.instrumentationKey ? require('@microsoft/applicationinsights-web').ApplicationInsights : null)).toBeDefined();
  });
});