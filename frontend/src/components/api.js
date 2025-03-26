import { backendUrl } from '../config';
import { retreiveTokenForBackend, retreiveTokenForGraph } from './entraAuth';
import appInsights from './appInsights'; 

export const getUserData = async (instance) => {
  try {
    appInsights.trackEvent({ name: 'Api Call - getUserData' });
    const accessToken = await retreiveTokenForBackend(instance);
    const response = await fetch(`${backendUrl}/api/user-data`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    appInsights.trackException({ error });
    console.error('Error fetching data:', error);
  }
};

export const getAdminData = async (instance) => {
  try {
    appInsights.trackEvent({ name: 'Api Call - getUserData' });
    const accessToken = await retreiveTokenForBackend(instance, ['Group.Read.All']);
    const response = await fetch(`${backendUrl}/api/admin-data`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    appInsights.trackException({ error });
    console.error('Error fetching data:', error);
  }
};

export const getAllGroups = async (instance) => {
  try {
    appInsights.trackEvent({ name: 'Api Call - getAllGroups (Graph API)' });
    
    // Request token with Group.Read.All scope for Graph API
    const accessToken = await retreiveTokenForGraph(instance, ['Group.Read.All']);
    
    // Call Microsoft Graph API directly
    const response = await fetch('https://graph.microsoft.com/v1.0/groups', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.value; // MS Graph returns data in a 'value' property
  } catch (error) {
    appInsights.trackException({ 
      exception: error,
      properties: { operation: 'getAllGroups', source: 'Graph API' }
    });
    console.error('Error fetching groups from Graph API:', error);
    throw error; // Re-throw to allow caller to handle it
  }
};