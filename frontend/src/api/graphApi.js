import { retrieveTokenForGraph, loginRequest } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights'; 

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
      const accessToken = await retrieveTokenForGraph(instance, ['Group.Read.All']);
      
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