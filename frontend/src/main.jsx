import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './components/entraAuth';

import { PublicClientApplication } from '@azure/msal-browser';

// mock out instance if available
export const msalInstance = new PublicClientApplication(msalConfig());


import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </BrowserRouter>
  </React.StrictMode>
);