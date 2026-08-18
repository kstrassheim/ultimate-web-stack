import React, { useState, useEffect } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { Button, Dropdown } from 'react-bootstrap';
import { useMsal } from '@azure/msal-react';
import { useNavigate, useLocation } from 'react-router';
import { loginRequest } from '@/auth/entraAuth';
import { reauthenticate } from '@/auth/authFlow';
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
  const [dropdownOpen, setDropdownOpen] = useState(false); // Track dropdown state
  const [recoveryInFlight, setRecoveryInFlight] = useState(false);

  const fetchProfilePhotoFunc = async (targetAccount) => {
    const accountToUse = targetAccount ?? account;
    if (accountToUse) {
      try {
        const photo = await getProfilePhoto(instance, accountToUse);
        // Only set photo URL if it's a valid URL string
        if (photo && typeof photo === 'string' && photo.trim() !== '') {
          setPhotoUrl(photo);
        } else {
          // If photo is empty, null, or invalid, use dummy avatar
          setPhotoUrl(dummy_avatar);
        }
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
      fetchProfilePhotoFunc(currentAccount);
    }
  }, [instance.getActiveAccount()?.name]);

  useEffect(() => { fetchProfilePhotoFunc(); }, [account]);

  // Mirror the Single-flight recovery state coming from authFlow so the
  // visible "Sign in" affordance can be suppressed while a background
  // session-recovery attempt is already under way — otherwise the user
  // sees two popups stacked.
  useEffect(() => {
    const tick = () => {
      // Re-read the in-flight flag from authFlow so the Sign-In button
      // shows the "Re-authenticating…" copy while a background recovery
      // is already running.
      setRecoveryInFlight(!!window.__uwsRecoveryInFlight);
    };
    const handleStarted = () => { tick(); setRecoveryInFlight(true); };
    const handleFinished = () => { tick(); setRecoveryInFlight(false); };
    window.addEventListener('uws:recovery:started', handleStarted);
    window.addEventListener('uws:recovery:finished', handleFinished);
    tick();
    return () => {
      window.removeEventListener('uws:recovery:started', handleStarted);
      window.removeEventListener('uws:recovery:finished', handleFinished);
    };
  }, []);

  const logonFunc = async (forcePopup = false) => {
    setRecoveryInFlight(true);
    try {
      // Deleting the existing path means we use the page the user is
      // currently on (which is "/" if they were not redirected there).
      window.sessionStorage.removeItem('redirectPath');
      const result = await reauthenticate(instance, {
        navigate,
        forceSelectAccount: forcePopup,
        // We always want to drop the user back on whatever page they
        // were trying to reach — the SessionRecoveryGuard may already
        // have saved a value, so let consumeRedirectPath() find it.
        target: null,
      });
      if (result && result.success) {
        // No-op: reauthenticate navigated to the saved path.
      } else if (result && result.error) {
        console.error("Logon failed:", result.error);
      }
    } finally {
      setRecoveryInFlight(false);
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
      onMouseEnter={() => !dropdownOpen && setShowTooltip(true)} // Only show tooltip if dropdown is closed
      onMouseLeave={() => setShowTooltip(false)}
      {...props}
    >
      <img 
        src={photoUrl} 
        alt="Profile" 
        className="profile-image" 
        data-testid="profile-image" 
      />
      {showTooltip && account && !dropdownOpen && ( // Only render tooltip if dropdown is closed
        <span className="profile-custom-tooltip" data-testid="profile-custom-tooltip">{account.name}</span>
      )}
    </div>
  ));

  return (
    <div className="d-flex align-items-center" data-testid="profile-wrapper">
      <AuthenticatedTemplate>
        <div className="d-flex align-items-center" data-testid="authenticated-container">
          {account && (
            <Dropdown 
              align="end" 
              data-testid="profile-dropdown"
              onToggle={(isOpen) => {
                setDropdownOpen(isOpen); // Track dropdown open state
                if (isOpen) setShowTooltip(false); // Hide tooltip when dropdown opens
              }}
            >
              <Dropdown.Toggle as={CustomToggle} id="dropdown-profile" />
              
              <Dropdown.Menu variant="dark" data-testid="profile-dropdown-menu">
                <Dropdown.Item as="div" className="text-light" disabled>
                  <strong>{account.name}</strong>
                </Dropdown.Item>
                
                {/* Add roles section */}
                <Dropdown.Item as="div" className="text-light" disabled>
                  <div className="mt-1">
                    <div className="d-flex align-items-center">
                      <small className="me-2">Roles:</small>
                      <div className="d-flex flex-wrap gap-1">
                        {account?.idTokenClaims?.roles?.length > 0 ? (
                          account.idTokenClaims.roles.map((role, index) => (
                            <span 
                              key={index} 
                              className="badge bg-primary badge-sm" 
                              data-testid={`role-badge-${role}`}
                            >
                              {role}
                            </span>
                          ))
                        ) : (
                          <span className="badge bg-secondary badge-sm" data-testid={`role-badge-none`}>None</span>
                        )}
                      </div>
                    </div>
                  </div>
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
          <Button
            variant="outline-light"
            className="me-3"
            size="sm"
            onClick={() => logonFunc(false)}
            disabled={recoveryInFlight}
            data-testid="sign-in-button"
          >
            {recoveryInFlight ? 'Re-authenticating…' : 'Sign In'}
          </Button>
        </div>
      </UnauthenticatedTemplate>
    </div>
  );
};

export default EntraProfile;