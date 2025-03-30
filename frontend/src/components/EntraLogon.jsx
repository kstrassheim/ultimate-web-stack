import React from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate} from '@azure/msal-react';
import { loginRequest } from '@/auth/entraAuth';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import appInsights from '@/log/appInsights';

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
        <div data-testid="authenticated-container">
          <button onClick={logoutFunc} data-testid="sign-out-button">Sign Out</button>
          <button onClick={()=>logonFunc(true)} data-testid="change-account-button">Change Account</button>
        </div>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <div data-testid="unauthenticated-container">
          <button onClick={()=>logonFunc(false)} data-testid="sign-in-button">Sign In</button>
        </div>
      </UnauthenticatedTemplate>
    </div>
};

export default EntraLogon;