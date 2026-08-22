import { backendUrl } from '@/config';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import {
  ApiError,
  SessionExpiredError,
  inspectResponseForExpiry,
  inspectionJson,
  notifySessionExpired,
} from '@/api/errors';
import { WebSocketClient } from '@/api/socket';

// Base URL for all Future Gadget Lab API endpoints
const BASE_URL = `${backendUrl}/future-gadget-lab`;

const summarizeBody = (bodyText) => {
  if (!bodyText) return '';
  const trimmed = bodyText.trim();
  if (trimmed.length <= 200) return trimmed;
  return `${trimmed.slice(0, 200)}…`;
};

// Helper function to make authenticated API requests. Mirrors the
// session-expiry / genuine-error semantics in `api.js`. The previous
// version threw a generic `new Error(...)`; the new version raises a
// `SessionExpiredError` (which the SessionRecoveryGuard catches and turns
// into a re-login prompt) when the backend or proxy hands back an HTML
// login page or a redirect chain that lands on a login URL, and raises
// `ApiError` otherwise so the calling page can surface a real error.
const makeAuthenticatedRequest = async (instance, url, method = 'GET', body = null) => {
  const operation = `${method} ${url}`;
  try {
    appInsights.trackEvent({ name: `Api Call - Future Gadget Lab - ${method} ${url}` });

    let accessToken;
    try {
      accessToken = await retrieveTokenForBackend(
        instance,
        url.includes('admin') ? ['Group.Read.All'] : []
      );
    } catch (tokenError) {
      const isInteractionRequired =
        tokenError &&
        (tokenError.name === 'InteractionRequiredAuthError' ||
          tokenError.errorCode === 'interaction_required' ||
          /interaction.?required/i.test(String(tokenError.errorMessage || tokenError.message || '')));

      if (isInteractionRequired) {
        const err = new SessionExpiredError(
          'Silent token acquisition requires user interaction',
          {
            detection: 'interaction-required',
            status: 0,
            cause: tokenError,
          }
        );
        notifySessionExpired({ error: err, source: url });
        throw err;
      }

      throw new ApiError(`Failed to acquire access token: ${tokenError.message || tokenError}`, {
        cause: tokenError,
        operation,
      });
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    const options = {
      method,
      headers
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${url}`, options);

    const inspection = await inspectResponseForExpiry(response, { expectsJson: true });

    if (inspection.looksLikeExpiry) {
      const err = new SessionExpiredError(
        `API responded as session expiry (${inspection.detection})`,
        {
          detection: inspection.detection,
          targetUrl: inspection.finalUrl,
          status: inspection.status,
        }
      );
      appInsights.trackEvent({
        name: 'Future Gadget Api Session Expired',
        properties: {
          url,
          method,
          detection: inspection.detection,
          status: String(inspection.status),
          finalUrl: inspection.finalUrl,
          bodyPreview: summarizeBody(inspection.bodyText),
        },
      });
      notifySessionExpired({ error: err, source: url });
      throw err;
    }

    // DELETE is treated as a no-content success — none of the lab endpoints
    // really return JSON on DELETE today.
    if (method === 'DELETE') {
      if (inspection.status < 200 || inspection.status >= 300) {
        const err = new ApiError(
          `Request failed (${inspection.status}): ${inspection.statusText || 'Unknown'}`,
          { status: inspection.status, operation }
        );
        appInsights.trackException({ exception: err, properties: { operation, source: 'Future Gadget Lab API' } });
        console.error(`Error in Future Gadget Lab API (${operation}):`, err);
        throw err;
      }
      return { success: true };
    }

    if (inspection.status < 200 || inspection.status >= 300) {
      // Genuine, non-expiry error response.
      const err = new ApiError(
        `Request failed (${inspection.status}): ${inspection.statusText || 'Unknown'}`,
        { status: inspection.status, operation }
      );
      appInsights.trackException({
        exception: err,
        properties: { operation, source: 'Future Gadget Lab API' }
      });
      console.error(`Error in Future Gadget Lab API (${operation}):`, err);
      throw err;
    }

    // Genuine JSON response — prefer the inspection-captured body, fall back
    // to response.json() when the body wasn't captured (test mocks).
    try {
      if (inspection.bodyText !== '' || typeof response.json !== 'function') {
        return inspectionJson(inspection);
      }
      return await response.json();
    } catch (parseErr) {
      appInsights.trackException({
        exception: parseErr,
        properties: { operation, source: 'Future Gadget Lab API' }
      });
      console.error(`Error in Future Gadget Lab API (${operation}):`, parseErr);
      throw parseErr;
    }
  } catch (error) {
    appInsights.trackException({
      exception: error,
      properties: { operation, source: 'Future Gadget Lab API' }
    });
    console.error(`Error in Future Gadget Lab API (${operation}):`, error);
    throw error;
  }
};

// Format timestamp for display
export const formatExperimentTimestamp = (experiment) => {
  if (experiment.timestamp) {
    const date = new Date(experiment.timestamp);
    return date.toLocaleString();
  }
  return 'Unknown';
};

// Format world line change to a nice readable format with +/- sign
export const formatWorldLineChange = (change) => {
  if (change === null || change === undefined) return 'N/A';
  
  // Convert to number if it's a string
  const numChange = parseFloat(change);
  
  // Format with 6 decimal places (standard format for divergence values)
  // Include sign for both positive and negative values
  return (numChange >= 0 ? '+' : '') + numChange.toFixed(6);
};

// ----- EXPERIMENTS API ONLY -----

export const getAllExperiments = async (instance) => {
  return makeAuthenticatedRequest(instance, '/lab-experiments');
};

export const getExperimentById = async (instance, experimentId) => {
  return makeAuthenticatedRequest(instance, `/lab-experiments/${experimentId}`);
};

export const createExperiment = async (instance, experimentData) => {
  // Only add timestamp if not provided by user
  const dataWithTimestamp = {
    ...experimentData,
    // Add timestamp if not provided or empty
    timestamp: experimentData.timestamp || new Date().toISOString()
  };
  
  return makeAuthenticatedRequest(instance, '/lab-experiments', 'POST', dataWithTimestamp);
};

export const updateExperiment = async (instance, experimentId, experimentData) => {
  return makeAuthenticatedRequest(instance, `/lab-experiments/${experimentId}`, 'PUT', experimentData);
};

export const deleteExperiment = async (instance, experimentId) => {
  return makeAuthenticatedRequest(instance, `/lab-experiments/${experimentId}`, 'DELETE');
};

// Add these functions after the existing experiment functions

// ----- WORLDLINE & DIVERGENCE API -----

export const getWorldlineStatus = async (instance) => {
  return makeAuthenticatedRequest(instance, '/worldline-status');
};

export const getWorldlineHistory = async (instance) => {
  return makeAuthenticatedRequest(instance, '/worldline-history');
};

export const getDivergenceReadings = async (instance, {
  status = null,
  recordedBy = null,
  minValue = null,
  maxValue = null
} = {}) => {
  // Build query string with any provided filters
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (recordedBy) params.append('recorded_by', recordedBy);
  if (minValue !== null) params.append('min_value', minValue);
  if (maxValue !== null) params.append('max_value', maxValue);
  
  const queryString = params.toString();
  const url = `/divergence-readings${queryString ? `?${queryString}` : ''}`;
  
  return makeAuthenticatedRequest(instance, url);
};

// Format divergence reading for display
export const formatDivergenceReading = (reading) => {
  // Handle reading being in different field names
  const value = reading.reading || reading.value;
  if (value === null || value === undefined) return 'N/A';
  
  // Format with 6 decimal places (standard for divergence meters)
  return parseFloat(value).toFixed(6);
};

// ----- WEBSOCKET CLIENTS -----

// WebSocket client for experiments only
export class ExperimentsSocketClient extends WebSocketClient {
  constructor() {
    super(`future-gadget-lab/ws/lab-experiments`);
  }
}

// New WebSocket client for worldline status updates
export class WorldlineSocketClient extends WebSocketClient {
  constructor() {
    // Fix the path to make it consistent with ExperimentsSocketClient (no leading slash)
    super(`future-gadget-lab/ws/worldline-status`);
  }
}

// Create singleton instances for easy access
const experimentsSocket = new ExperimentsSocketClient();
const worldlineSocket = new WorldlineSocketClient();

// Export the socket clients
export { experimentsSocket, worldlineSocket };