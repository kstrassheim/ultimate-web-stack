/**
 * Mock implementation of Application Insights
 */

// Create a full mock that matches the structure of the ApplicationInsights instance.
// All callbacks are intentionally no-op stubs; their parameter names use a
// leading underscore so `eslint --fix` and the `no-unused-vars` rule ignore them.
const mockAppInsights = {
  // Core tracking methods used in your app
  trackEvent: (_event) => {
    //console.log('[Mock AppInsights] trackEvent:', event);
  },
  trackException: (_exception) => {
    //console.log('[Mock AppInsights] trackException:', exception);
  },
  trackPageView: (_pageView) => {
    //console.log('[Mock AppInsights] trackPageView:', pageView);
  },
  trackMetric: (_metric) => {
    //console.log('[Mock AppInsights] trackMetric:', metric);
  },
  setAuthenticatedUserContext: (_userId, _accountId) => {
    //console.log('[Mock AppInsights] setAuthenticatedUserContext:', userId, accountId);
  },
  
  // Add the loadAppInsights method that is called in the real implementation
  loadAppInsights: () => {
   //console.log('[Mock AppInsights] loadAppInsights called');
    return mockAppInsights;
  },
  
  // Add any other methods the real SDK might use
  flush: () => {
    //console.log('[Mock AppInsights] flush called');
  },
  
  // Configuration property
  config: {
    instrumentationKey: 'mock-key',
    connectionString: 'mock-connection-string'
  }
};

// Make sure loadAppInsights has already been called, just like in the real implementation
mockAppInsights.loadAppInsights();

// Export default should be the initialized instance, not an object of methods
export default mockAppInsights;