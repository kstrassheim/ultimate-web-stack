import { backendUrl } from '@/config';
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
    super('future-gadget-lab/ws/lab-experiments');
  }
}

// New WebSocket client for worldline status updates
export class WorldlineSocketClient extends WebSocketClient {
  constructor() {
    super('future-gadget-lab/ws/worldline-status');
  }
}

// Create singleton instances for easy access
const experimentsSocket = new ExperimentsSocketClient();
const worldlineSocket = new WorldlineSocketClient();

// Export the socket clients
export { experimentsSocket, worldlineSocket };