import React from 'react';
import { useMsal , AuthenticatedTemplate, UnauthenticatedTemplate} from '@azure/msal-react';
import { loginRequest } from './entraAuth';
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
    sessionStorage.clear();
    localStorage.clear();
    await instance.logoutPopup();
  }

  return <div className="logon-buttons">
      <AuthenticatedTemplate>
        <button onClick={logoutFunc}>Sign Out</button>
        <button onClick={()=>logonFunc(true)}>Change Account</button>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <button onClick={logonFunc}>Sign In</button>
      </UnauthenticatedTemplate>
    </div>
};

export default EntraLogon;