import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import './index.css'
import App from './App.jsx'

import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './components/entraAuth.js';
import appInsights from './components/appInsights'; // This will initialize Application Insights

// init Application Insights as soon as the app starts
appInsights.trackPageView({ name: window.location.pathname });

const msalConfigVal= msalConfig();
const msalInstance = new PublicClientApplication(msalConfigVal);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MsalProvider instance={msalInstance}>
      <BrowserRouter  future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </MsalProvider>
  </StrictMode>
)

// const loadingScreen = `<div style="position: fixed; z-index: 9999; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center;"><div style="border: 16px solid #f3f3f3; border-radius: 50%; border-top: 16px solid #3498db; width: 120px; height: 120px; animation: spin 1s linear infinite;"></div></div><style>@keyframes spin {0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);}}</style>`;// Initially render the loading screen
// document.getElementById('root').innerHTML = loadingScreen;
// // in dev retry init page because backend may not be ready
// const retryInit = async (retries, delay) => { for (let i = 0; i < retries; i++) { try { await init(); break; } catch (error) {  if (i < retries - 1) { await new Promise(resolve => setTimeout(resolve, delay)); }} }};
// if (isDev) { retryInit(20, 500);} else {init();}


