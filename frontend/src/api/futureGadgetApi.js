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
    
    const accessToken = await retrieveTokenForBackend(instance);
    
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

// ----- EXPERIMENTS API -----

export const getAllExperiments = async (instance) => {
  return makeAuthenticatedRequest(instance, '/experiments');
};

export const getExperimentById = async (instance, experimentId) => {
  return makeAuthenticatedRequest(instance, `/experiments/${experimentId}`);
};

export const createExperiment = async (instance, experimentData) => {
  return makeAuthenticatedRequest(instance, '/experiments', 'POST', experimentData);
};

export const updateExperiment = async (instance, experimentId, experimentData) => {
  return makeAuthenticatedRequest(instance, `/experiments/${experimentId}`, 'PUT', experimentData);
};

export const deleteExperiment = async (instance, experimentId) => {
  return makeAuthenticatedRequest(instance, `/experiments/${experimentId}`, 'DELETE');
};

// ----- D-MAIL API -----

export const getAllDMails = async (instance) => {
  return makeAuthenticatedRequest(instance, '/d-mails');
};

export const getDMailById = async (instance, dMailId) => {
  return makeAuthenticatedRequest(instance, `/d-mails/${dMailId}`);
};

export const createDMail = async (instance, dMailData) => {
  return makeAuthenticatedRequest(instance, '/d-mails', 'POST', dMailData);
};

export const updateDMail = async (instance, dMailId, dMailData) => {
  return makeAuthenticatedRequest(instance, `/d-mails/${dMailId}`, 'PUT', dMailData);
};

export const deleteDMail = async (instance, dMailId) => {
  return makeAuthenticatedRequest(instance, `/d-mails/${dMailId}`, 'DELETE');
};

// ----- DIVERGENCE READINGS API -----

export const getAllDivergenceReadings = async (instance) => {
  return makeAuthenticatedRequest(instance, '/divergence-readings');
};

export const getDivergenceReadingById = async (instance, readingId) => {
  return makeAuthenticatedRequest(instance, `/divergence-readings/${readingId}`);
};

export const createDivergenceReading = async (instance, readingData) => {
  return makeAuthenticatedRequest(instance, '/divergence-readings', 'POST', readingData);
};

export const updateDivergenceReading = async (instance, readingId, readingData) => {
  return makeAuthenticatedRequest(instance, `/divergence-readings/${readingId}`, 'PUT', readingData);
};

export const deleteDivergenceReading = async (instance, readingId) => {
  return makeAuthenticatedRequest(instance, `/divergence-readings/${readingId}`, 'DELETE');
};

// ----- LAB MEMBERS API -----

export const getAllLabMembers = async (instance) => {
  return makeAuthenticatedRequest(instance, '/lab-members');
};

export const getLabMemberById = async (instance, memberId) => {
  return makeAuthenticatedRequest(instance, `/lab-members/${memberId}`);
};

export const createLabMember = async (instance, memberData) => {
  return makeAuthenticatedRequest(instance, '/lab-members', 'POST', memberData);
};

export const updateLabMember = async (instance, memberId, memberData) => {
  return makeAuthenticatedRequest(instance, `/lab-members/${memberId}`, 'PUT', memberData);
};

export const deleteLabMember = async (instance, memberId) => {
  return makeAuthenticatedRequest(instance, `/lab-members/${memberId}`, 'DELETE');
};

// ----- WEBSOCKET CLIENTS -----

// WebSocket client for experiments
export class ExperimentsSocketClient extends WebSocketClient {
  constructor() {
    super('future-gadget-lab/ws/experiments');
  }
}

// WebSocket client for D-Mails
export class DMailsSocketClient extends WebSocketClient {
  constructor() {
    super('future-gadget-lab/ws/d-mails');
  }
}

// WebSocket client for divergence readings
export class DivergenceReadingsSocketClient extends WebSocketClient {
  constructor() {
    super('future-gadget-lab/ws/divergence-readings');
  }
}

// WebSocket client for lab members
export class LabMembersSocketClient extends WebSocketClient {
  constructor() {
    super('future-gadget-lab/ws/lab-members');
  }
}

// Create singleton instances for easy access
const experimentsSocket = new ExperimentsSocketClient();
const dMailsSocket = new DMailsSocketClient();
const divergenceReadingsSocket = new DivergenceReadingsSocketClient();
const labMembersSocket = new LabMembersSocketClient();

// Export the socket clients
export { 
  experimentsSocket,
  dMailsSocket, 
  divergenceReadingsSocket, 
  labMembersSocket 
};