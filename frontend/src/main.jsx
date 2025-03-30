import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './components/entraAuth';

import { PublicClientApplication } from '@azure/msal-browser';
import { PublicClientApplication as MockPublicClientApplication} from './mock/mockAzureMsalBrowser';

let mockRole = null;
let debug = false;
if (__DEBUG__) {
  debug = true;
  console.log('Debug mode is enabled! Applying mock MSAL instance...');
  // Use the default export from the dynamically imported module
  mockRole = localStorage.getItem('MOCKROLE') || __MOCKROLE__;
  console.log('Mock role:', mockRole);
}

// mock out instance if available
export const msalInstance = mockRole ? new MockPublicClientApplication(msalConfig(), mockRole) : new PublicClientApplication(msalConfig());


import App from './App';
import './index.css';

if (__DEBUG__) {
  console.log('Debug mode is enabled!');
  // Debugging logic...
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </BrowserRouter>
  </React.StrictMode>
);