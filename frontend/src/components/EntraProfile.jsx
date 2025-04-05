import React, { useState, useEffect } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { Button, Dropdown } from 'react-bootstrap';
import { useMsal } from '@azure/msal-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loginRequest } from '@/auth/entraAuth';
import dummy_avatar from '@/assets/dummy-avatar.jpg';
import appInsights from '@/log/appInsights';
import { getProfilePhoto } from '@/api/graphApi';
import './EntraProfile.css'; // Create this file for custom tooltip styles

const EntraProfile = () => {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const location = useLocation(); // Track location changes
  const [photoUrl, setPhotoUrl] = useState(dummy_avatar);
  const [account, setAccount] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);
  
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

  // Reset tooltip state on page navigation
  useEffect(() => {
    setShowTooltip(false);
  }, [location.pathname]);

  // Update CustomToggle with manual tooltip handling
  const CustomToggle = React.forwardRef(({ onClick, ...props }, ref) => (
    <div 
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        onClick(e);
      }}
      className="profile-toggle"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      {...props}
    >
      <img 
        src={photoUrl} 
        alt="Profile" 
        className="profile-image" 
        data-testid="profile-image" 
      />
      {showTooltip && account && (
        <span className="profile-custom-tooltip">{account.name}</span>
      )}
    </div>
  ));

  return (
    <div className="d-flex align-items-center" data-testid="profile-wrapper">
      <AuthenticatedTemplate>
        <div className="d-flex align-items-center" data-testid="authenticated-container">
          {account && (
            <Dropdown align="end" data-testid="profile-dropdown">
              <Dropdown.Toggle as={CustomToggle} id="dropdown-profile" />
              
              <Dropdown.Menu variant="dark">
                <Dropdown.Item as="div" className="text-light" disabled>
                  Signed in as: <strong>{account.name}</strong>
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item 
                  onClick={() => logonFunc(true)} 
                  data-testid="change-account-button"
                >
                  Change Account
                </Dropdown.Item>
                <Dropdown.Item 
                  onClick={logoutFunc} 
                  data-testid="sign-out-button"
                >
                  Sign Out
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          )}
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