import { backendUrl } from '@/config';
import { retreiveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights'; 

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