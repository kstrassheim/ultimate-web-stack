import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from '@/auth/entraAuth';
import { PublicClientApplication } from '@azure/msal-browser';
import 'bootstrap/dist/css/bootstrap.min.css';  // Add this line

import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <MsalProvider instance={new PublicClientApplication(msalConfig())}>
        <App />
      </MsalProvider>
    </BrowserRouter>
  </React.StrictMode>
);