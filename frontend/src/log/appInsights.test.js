import { jest } from '@jest/globals';

/**
 * Coverage for the REAL src/log/appInsights.js module.
 *
 * jest.setup.js globally mocks '@/log/appInsights' so component tests never
 * boot the SDK; this suite unmocks it and stubs the underlying
 * `@microsoft/applicationinsights-web` package instead, so the module's own
 * wiring (config shape + loadAppInsights call) is what runs.
 */

// Do not import appInsights here—load it later inside isolateModules
jest.unmock('@/log/appInsights');

// Spy on the ApplicationInsights constructor BEFORE importing appInsights.
let capturedConfig;
const loadAppInsightsSpy = jest.fn();
jest.unmock('@microsoft/applicationinsights-web');
jest.mock('@microsoft/applicationinsights-web', () => {
  return {
    ApplicationInsights: jest.fn().mockImplementation((options) => {
      capturedConfig = options.config; // capture the configuration options passed
      return {
        config: options.config,
        loadAppInsights: loadAppInsightsSpy,
        trackEvent: jest.fn(),
        trackException: jest.fn()
      };
    })
  };
});

// Reset modules and override tfconfig so that appInsights.js reads our desired config.
let appInsights;
let loadCallCountAtModuleLoad;
beforeAll(async () => {
  jest.resetModules();

  await jest.isolateModulesAsync(async () => {
    // Import appInsights after our mocks are in place.
    const module = await import('./appInsights');
    appInsights = module.default;
  });

  // jest.setup.js runs jest.clearAllMocks() before every test, which would
  // erase this call history — capture it now, before any test runs.
  loadCallCountAtModuleLoad = loadAppInsightsSpy.mock.calls.length;
});

describe("Application Insights", () => {
  it("should expose a loadAppInsights function (indicating a proper instance)", () => {
    expect(typeof appInsights.loadAppInsights).toBe('function');
    expect(typeof appInsights.trackEvent).toBe('function');
  });

  it("passes the terraform-provided connection string and the app's tracking flags to the SDK", () => {
    expect(capturedConfig).toEqual({
      connectionString: 'MockInstrumentationConnectionString',
      enableAutoRouteTracking: true,
      disableFlushOnBeforeUnload: true,
      disablePageUnloadEvents: true
    });
  });

  it("calls loadAppInsights() exactly once at module load", () => {
    expect(loadCallCountAtModuleLoad).toBe(1);
  });
});
