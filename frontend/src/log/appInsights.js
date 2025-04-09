import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import tfconfig from '@/../terraform.config.json';

const config = {
  connectionString: tfconfig.application_insights_connection_string.value,
  enableAutoRouteTracking: true,
  disableFlushOnBeforeUnload: true,
  disablePageUnloadEvents: true
};

const appInsights = new ApplicationInsights({ config });
appInsights.loadAppInsights();

export default appInsights;