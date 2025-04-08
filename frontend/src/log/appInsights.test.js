import { jest } from '@jest/globals';
// Do not import appInsights here—load it later inside isolateModules

// Spy on the ApplicationInsights constructor BEFORE importing appInsights.
let capturedConfig;
jest.unmock('@microsoft/applicationinsights-web');
jest.mock('@microsoft/applicationinsights-web', () => {
  return {
    ApplicationInsights: jest.fn().mockImplementation((options) => {
      capturedConfig = options.config; // capture the configuration options passed
      return {
        config: options.config,
        loadAppInsights: jest.fn(),
        trackEvent: jest.fn(),
        trackException: jest.fn()
      };
    })
  };
});

// Reset modules and override tfconfig so that appInsights.js reads our desired config.
let appInsights;
beforeAll(async () => {
  jest.resetModules();
  // jest.doMock('@/../terraform.config.json', () => ({
  //   application_insights_connection_string: {
  //     value: 'Test_Connection_String'
  //   }
  // }), { virtual: true });
  
  await jest.isolateModulesAsync(async () => {
    // Import appInsights after our mocks are in place.
    const module = await import('./appInsights');
    appInsights = module.default;
  });
  
  // (Optional) Log capturedConfig for debugging:
  // console.log("Captured config:", capturedConfig);
});

describe("Application Insights", () => {
  it("should expose a loadAppInsights function (indicating a proper instance)", () => {
    expect(typeof appInsights.loadAppInsights).toBe('function');
    expect(typeof appInsights.trackEvent).toBe('function');
  });
});