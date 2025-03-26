import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import tfconfig from '../../terraform.config.json' assert { type: 'json' };

const appInsights = new ApplicationInsights({
  config: {
    connectionString: tfconfig.application_insights_connection_string.value,
    enableAutoRouteTracking: true, 
    disableFlushOnBeforeUnload: true,
    disablePageUnloadEvents: true  // Remove comma from last property
  }
});

appInsights.loadAppInsights();

export default appInsights;