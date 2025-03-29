import { LogLevel } from '@azure/msal-browser';
import { PublicClientApplication } from '@azure/msal-browser';
import { useMsal as originalUseMsal } from '@azure/msal-react';
import { frontendUrl } from "../config";
import tfconfig from '../../terraform.config.json' assert { type: 'json' };
import appInsights from './appInsights';
import mockMsal from '../mock/msalMock';
// Apply mock msal when in debug mode with mocked role
if (__DEBUG__) {
  console.log('Debug mode is enabled! Applying mock MSAL instance...');
  // Use the default export from the dynamically imported module
  const mockRoleFromStorage = localStorage.getItem('MOCKROLE');
  console.log('Mock role from storage:', mockRoleFromStorage);
  console.log('Mock role from vite:', __MOCKROLE__);
  mockMsal(mockRoleFromStorage || __MOCKROLE__);
}

export const msalConfig = () =>{
  console.log("redirect uri:" + frontendUrl);
  return {
    auth: {
      clientId: tfconfig.client_id.value,
      authority: `https://login.microsoftonline.com/${tfconfig.tenant_id.value}/v2.0`,
      redirectUri: frontendUrl,
      postLogoutRedirectUri: frontendUrl+'/post-logout',
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          console[level === LogLevel.Error ? 'error' : 'info'](message);
        },
      },
    },
  };
};

// mock out instance if available
export const useMsal = window.mockUseMsal || originalUseMsal;
export const msalInstance = window.mockInstance || new PublicClientApplication(msalConfig());

export const loginRequest = {
  scopes: tfconfig.requested_graph_api_delegated_permissions.value,
};

export const retreiveTokenForBackend = window.retreiveTokenForBackend ? window.retreiveTokenForBackend : async (instance, extraScopes = []) => {
  appInsights.trackEvent({ name: 'MSAL Retrieving Token' });
  const account = instance.getActiveAccount();
  const tokenResponse = await instance.acquireTokenSilent({
    scopes: [tfconfig.oauth2_permission_scope_uri.value, ...extraScopes],
    account: account,
  });
  return tokenResponse.accessToken;
}

export const retreiveTokenForGraph = window.retreiveTokenForGraph ? window.retreiveTokenForGraph :  async (instance, extraScopes = []) => {
  appInsights.trackEvent({ name: 'MSAL Retrieving Graph Token' });
  const account = instance.getActiveAccount();
  
  // For Graph API, use the graph scopes - not the API scope
  const defaultGraphScopes = ['https://graph.microsoft.com/.default'];
  const scopesToRequest = [...defaultGraphScopes] //, ...extraScopes];
  
  try {
    const tokenResponse = await instance.acquireTokenSilent({
      scopes: scopesToRequest,
      account: account
    });
    
    return tokenResponse.accessToken;
  } catch (error) {
    appInsights.trackException({ 
      exception: error,
      properties: { 
        operation: 'retreiveTokenForGraph', 
        scopes: scopesToRequest.join(',') 
      }
    });
    
    // If silent token acquisition fails, you might want to try interactive
    if (error.name === "InteractionRequiredAuthError") {
      // fallback to interactive method
      const interactiveResponse = await instance.acquireTokenPopup({
        scopes: scopesToRequest,
      });
      return interactiveResponse.accessToken;
    }
    
    throw error;
  }
};


