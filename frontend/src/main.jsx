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
const AUTH_RESPONSE_KEYS = ['code', 'error', 'state'];

const hasResponseKey = (url, key) =>
  ['#', '?', '&'].some((prefix) => url.includes(`${prefix}${key}=`));

export const isAuthRedirectUrl = (url, hasOpener) => {
  // `state` is round-tripped on every MSAL response, success or error, so it
  // is what separates a real auth response from an app URL that merely
  // happens to carry a `code=` parameter. Matching `code=` alone blanked the
  // whole app for an installed PWA whose start_url captured `?code=…` at
  // install time — the manifest pins start_url now (issue #151), but this
  // must not depend on that.
  if (hasResponseKey(url, 'state')) {
    return true;
  }
  // Belt and braces: a window that still has an opener and carries a
  // code/error response is a popup even without the state marker.
  return Boolean(hasOpener) && AUTH_RESPONSE_KEYS.some((key) => hasResponseKey(url, key));
};

const isAuthRedirectFrame =
  typeof window !== 'undefined' &&
  isAuthRedirectUrl(window.location.hash + window.location.search, window.opener);

// broadcastResponseToMainFrame ends in window.close(). When that call is
// refused the document stays blank, because this branch deliberately never
// renders the app — and a popup opened from an installed PWA lands in its own
// Edge browser window, which is exactly where close() is most likely to be
// ignored. Leave the user something readable instead of an empty window.
export const AUTH_POPUP_SELF_CLOSE_GRACE_MS = 2000;

export const renderAuthPopupFallback = () => {
  const rootElement = document.getElementById('root');
  /* istanbul ignore next -- index.html always ships the #root container */
  if (!rootElement) {
    return;
  }
  rootElement.textContent = '';
  const notice = document.createElement('p');
  notice.dataset.testid = 'auth-popup-fallback';
  notice.textContent = 'Sign-in complete. You can close this window.';
  notice.style.cssText = 'font: 1rem system-ui, sans-serif; margin: 3rem; text-align: center;';
  rootElement.appendChild(notice);
};

if (isAuthRedirectFrame) {
  import('@azure/msal-browser/redirect-bridge')
    .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
    .catch((error) => {
      console.error('MSAL redirect bridge failed', error);
    })
    .finally(() => {
      window.setTimeout(renderAuthPopupFallback, AUTH_POPUP_SELF_CLOSE_GRACE_MS);
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
