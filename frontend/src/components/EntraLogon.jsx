import React from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate} from '@azure/msal-react';
import { loginRequest } from './entraAuth';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import appInsights from './appInsights';

const EntraLogon = () => {
  const { instance } = useMsal();
  const navigate = useNavigate();

  const logonFunc = async (forcePopup = false) => {
    try {
      appInsights.trackEvent({ name: 'Logon started' });
      let loginRequestParam = forcePopup ? { ...loginRequest, prompt: "select_account" } : loginRequest;
      const response = await instance.loginPopup(loginRequestParam);
      instance.setActiveAccount(response.account);

      // Retrieve the saved path from sessionStorage
      const redirectPath = sessionStorage.getItem("redirectPath") || "/";
      sessionStorage.removeItem("redirectPath");
      // Navigate to the originally requested page
      navigate(redirectPath, { replace: true });

    } catch (error) {
      appInsights.trackException({ error });
      console.error("Logon failed:", error);
    }
  };

  const logoutFunc = async () => {
    // sessionStorage.clear();
    // localStorage.clear();
    await instance.logoutPopup();
  }

  return <div className="logon-buttons" data-testid="entra-logon">
      <AuthenticatedTemplate>
        <button onClick={logoutFunc} data-testid="sign-out-button">Sign Out</button>
        <button onClick={()=>logonFunc(true)} data-testid="change-account-button">Change Account</button>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <button onClick={logonFunc} data-testid="sign-in-button">Sign In</button>
      </UnauthenticatedTemplate>
    </div>
};

export default EntraLogon;