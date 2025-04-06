import { backendUrl } from '@/config';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';

// Base URL for API endpoints
const BASE_URL = `${backendUrl}/api`;

// Helper function to make authenticated API requests
const makeAuthenticatedRequest = async (instance, url, method = 'GET', body = null) => {
  try {
    appInsights.trackEvent({ name: `Api Call - ${method === 'GET' ? 'get' : 'post'}${url.charAt(0).toUpperCase() + url.slice(1)}` });
    
    // Get the authentication token
    const accessToken = await retrieveTokenForBackend(
      instance, 
      url.includes('admin') ? ['Group.Read.All'] : []
    );
    
    // Setup headers and options
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    
    const options = {
      method,
      headers
    };
    
    // Add request body for non-GET requests
    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }
    
    // Make the API request
    const response = await fetch(`${BASE_URL}${url}`, options);
    
    if (!response.ok) {
      throw new Error(`Network response was not ok (${response.status}): ${response.statusText}`);
    }
    
    // Parse and return the response
    return await response.json();
  } catch (error) {
    appInsights.trackException({ 
      error, 
      properties: { operation: `${method} ${url}`, source: 'API' }
    });
    console.error(`Error in API (${method} ${url}):`, error);
    
    // For user data, return undefined (consistent with current tests)
    // For admin data, rethrow the error (consistent with current tests)
    if (url.includes('admin')) {
      throw error;
    }
    
    // Return undefined for getUserData as expected by tests
    return undefined;
  }
};

export const getUserData = async (instance) => {
  return makeAuthenticatedRequest(instance, '/user-data');
};

export const getAdminData = async (instance, message = "Hello from frontend", status = 123) => {
  const body = {
    message,
    status
  };
  
  return makeAuthenticatedRequest(instance, '/admin-data', 'POST', body);
};