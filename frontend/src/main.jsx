import React from 'react';
import ReactDOM from 'react-dom/client';
// React Router 8 dropped the `react-router-dom` re-export package
// (it stops at 7.18.2). Declarative routers (BrowserRouter /
// MemoryRouter / HashRouter / ...) still live in core `react-router`;
// only Framework-mode helpers (RouterProvider / HydratedRouter) live
// under `react-router/dom`. We're in Declarative mode, so core stays
// the right entry point — see https://reactrouter.com/upgrading/v7#react-router-dom
import { BrowserRouter } from 'react-router';
import { MsalProvider } from '@azure/msal-react';
import msalInstance, { msalInitialization } from '@/auth/msalInstance';
import 'bootstrap/dist/css/bootstrap.min.css';  // Add this line

import App from './App';
import './index.css';

// MSAL v5 popup redirect bridge: any URL carrying an auth response
// (#code=…, #error=…, or #state=…) is a popup window that Entra redirected
// back to. broadcastResponseToMainFrame posts the response to the opener
// via BroadcastChannel and calls window.close(). Skip rendering — opener
// checks fail when COOP severs window.opener after the cross-origin
// Entra navigation.
const isAuthRedirectFrame =
  typeof window !== 'undefined' &&
  /[#?&](code|error|state)=/.test(window.location.hash + window.location.search);

if (isAuthRedirectFrame) {
  import('@azure/msal-browser/redirect-bridge')
    .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
    .catch((error) => {
      console.error('MSAL redirect bridge failed', error);
    });
} else {
  msalInitialization.then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <BrowserRouter>
          <MsalProvider instance={msalInstance}>
            <App />
          </MsalProvider>
        </BrowserRouter>
      </React.StrictMode>
    );
  });
}
