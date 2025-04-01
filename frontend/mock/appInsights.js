/**
 * Mock implementation of Application Insights
 */

// Create a full mock that matches the structure of the ApplicationInsights instance
const mockAppInsights = {
  // Core tracking methods used in your app
  trackEvent: (event) => {
    //console.log('[Mock AppInsights] trackEvent:', event);
  },
  trackException: (exception) => {
    //console.log('[Mock AppInsights] trackException:', exception);
  },
  trackPageView: (pageView) => {
    //console.log('[Mock AppInsights] trackPageView:', pageView);
  },
  trackMetric: (metric) => {
    //console.log('[Mock AppInsights] trackMetric:', metric);
  },
  setAuthenticatedUserContext: (userId, accountId) => {
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