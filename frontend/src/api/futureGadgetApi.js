import { backendUrl, backendSocketUrl } from '@/config';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import { WebSocketClient } from './socket';

// Base URL for all Future Gadget Lab API endpoints
const BASE_URL = `${backendUrl}/future-gadget-lab`;

// Helper function to make authenticated API requests
const makeAuthenticatedRequest = async (instance, url, method = 'GET', body = null) => {
  try {
    appInsights.trackEvent({ name: `Api Call - Future Gadget Lab - ${method} ${url}` });
    
    const accessToken = await retrieveTokenForBackend(
      instance, 
      url.includes('admin') ? ['Group.Read.All'] : []
    );
    
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
    
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${response.statusText}`);
    }
    
    return method === 'DELETE' ? { success: true } : await response.json();
  } catch (error) {
    appInsights.trackException({ 
      exception: error, 
      properties: { operation: `${method} ${url}`, source: 'Future Gadget Lab API' }
    });
    console.error(`Error in Future Gadget Lab API (${method} ${url}):`, error);
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

// ----- WEBSOCKET CLIENTS -----

// WebSocket client for experiments only
export class ExperimentsSocketClient extends WebSocketClient {
  constructor() {
    super('future-gadget-lab/ws/lab-experiments');
  }
}

// Create singleton instance for easy access
const experimentsSocket = new ExperimentsSocketClient();

// Export the socket client
export { experimentsSocket };