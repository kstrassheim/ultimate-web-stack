import { backendUrl } from '../config';
import { retreiveTokenForBackend, retreiveTokenForGraph, loginRequest } from './entraAuth';
import appInsights from './appInsights'; 

import mockGraphApi from '../mock/graphApiMock';
if (__DEBUG__) {
  // import('../mock/graphApiMock').then(module => {
  //   console.log('Debug mode is enabled! Applying mock Graph API instance...');
  //   // Use the default export from the dynamically imported module
  //   const mockGraphApi = module.default;
  //   mockGraphApi(__MOCKROLE__);
  // });
  console.log('Debug mode is enabled! Applying mock Graph API instance...');
  const mockRoleFromStorage = localStorage.getItem('MOCKROLE');
  console.log('Mock role from storage:', mockRoleFromStorage);
  console.log('Mock role from vite:', __MOCKROLE__);
  mockGraphApi(mockRoleFromStorage || __MOCKROLE__);
// Replace '__MOCKROLE__' with a default value if needed
}

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

export const getAdminData = async (instance, message = "Hello from frontend", status = 123) => {
  try {
    appInsights.trackEvent({ name: 'Api Call - getAdminData' });
    const accessToken = await retreiveTokenForBackend(instance, ['Group.Read.All']);
    
    // Changed to POST request with JSON body
    const response = await fetch(`${backendUrl}/api/admin-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        status: status
      })
    });
    
    if (!response.ok) {
      throw new Error(`Network response was not ok (${response.status}): ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    appInsights.trackException({ error });
    console.error('Error fetching admin data:', error);
    throw error; // Re-throw to allow caller to handle it
  }
};

// Mock image funktion if required
export const getProfilePhoto = window.getProfilePhoto ? window.getProfilePhoto : async (instance, activeAccount) => {
  try {
    appInsights.trackEvent({ name: 'Profile - Getting profile image' });
    if (!activeAccount) return;
    const tokenResponse = await instance.acquireTokenSilent({
      ...loginRequest,
      account: activeAccount,
    });
    const accessToken = tokenResponse.accessToken;
    const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } else {
      console.error('Failed to fetch profile photo:', response.statusText);
    }
  } catch (error) {
    appInsights.trackException({ error });
    console.error('Error fetching profile photo:', error);
  }
};

export const getAllGroups = window.getAllGroups ? window.getAllGroups : async (instance) => {
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