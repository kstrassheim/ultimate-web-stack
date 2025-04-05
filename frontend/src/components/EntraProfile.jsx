import React, { useState, useEffect } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { Button } from 'react-bootstrap';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { loginRequest } from '@/auth/entraAuth';
import dummy_avatar from '@/assets/dummy-avatar.jpg';
import appInsights from '@/log/appInsights';
import { getProfilePhoto } from '@/api/graphApi';

const EntraProfile = () => {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(dummy_avatar);
  const [account, setAccount] = useState(null);
  
  const fetchProfilePhotoFunc = async () => {
    if (account) {
      try {
        let photo = await getProfilePhoto(instance, account);
        setPhotoUrl(photo);
      } catch (error) {
        console.error("Error fetching profile photo:", error);
        setPhotoUrl(dummy_avatar);
        appInsights.trackException({ error });
      }
    } else {
      setPhotoUrl(dummy_avatar);
    }
  };

  useEffect(() => {
    const currentAccount = instance.getActiveAccount();
    if (!currentAccount) {
      setAccount(null);
      setPhotoUrl(dummy_avatar);
    }
    else if (currentAccount !== account) {
      setAccount(currentAccount);
      fetchProfilePhotoFunc();
    }
  }, [instance.getActiveAccount()?.name]);

  useEffect(() => { fetchProfilePhotoFunc(); }, [account]);

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
    await instance.logoutPopup();
  };

  return (
    <div className="d-flex align-items-center" data-testid="profile-wrapper">
      <AuthenticatedTemplate>
        <div className="d-flex align-items-center" data-testid="authenticated-container">
          {account && (
            <div className="profile-container d-flex align-items-center me-3" data-testid="profile-container">
              <img 
                src={photoUrl} 
                alt="Profile" 
                className="profile-image rounded-circle me-2" 
                style={{ width: "32px", height: "32px" }}
                data-testid="profile-image" 
              />
              <div className="profile-name text-light" data-testid="profile-name">
                {account.name}
              </div>
            </div>
          )}
          <div>
            <Button variant="outline-light" size="sm" onClick={logoutFunc} data-testid="sign-out-button" className="me-2">
              Sign Out
            </Button>
            <Button variant="outline-light" size="sm" onClick={() => logonFunc(true)} data-testid="change-account-button">
              Change Account
            </Button>
          </div>
        </div>
      </AuthenticatedTemplate>
      
      <UnauthenticatedTemplate>
        <div data-testid="unauthenticated-container">
          <Button variant="outline-light" size="sm" onClick={() => logonFunc(false)} data-testid="sign-in-button">
            Sign In
          </Button>
        </div>
      </UnauthenticatedTemplate>
    </div>
  );
};

export default EntraProfile;