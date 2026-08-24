import { useState, useEffect, forwardRef } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { Button, Dropdown } from 'react-bootstrap';
import { useAuth } from '@/auth/AuthContext';
import { useNavigate, useLocation } from 'react-router';
import { reauthenticate } from '@/auth/authFlow';
import dummy_avatar from '@/assets/dummy-avatar.jpg';
import appInsights from '@/log/appInsights';
import { getProfilePhoto } from '@/api/graphApi';
import { useAbortController } from '@/utils/useAbortController';
import './EntraProfile.css'; // Create this file for custom tooltip styles

const EntraProfile = () => {
  // Centralised auth state (issue #87) - pulls the MSAL instance and
  // the active account from `useAuth()` instead of reaching into
  // `@azure/msal-react` directly. The hook still ultimately calls
  // useMsal(), so any test that mocks `@azure/msal-react` keeps working.
  const { instance, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Profile photo state. We keep the account in a local ref + state
  // mirror so the dropdown re-renders when MSAL's active account
  // changes (login/logout/profile-switch).
  const [account, setAccount] = useState(instance.getActiveAccount());
  const [photoUrl, setPhotoUrl] = useState(dummy_avatar);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  
  const abortController = useAbortController();

  // Resolve the current account from the MSAL instance. This effect
  // intentionally mirrors MSAL's state into local React state so the
  // dropdown updates on logout/switch-account; the official React docs
  // recommend useSyncExternalStore for this kind of external-state sync
  // (https://react.dev/reference/react/useSyncExternalStore), which would
  // be the right next refactor. For now the effect + setState is correct
  // and lint-clean.
  const fetchProfilePhotoFunc = async () => {
    try {
      if (account) {
        const photoBlob = await getProfilePhoto(instance, account, { signal: abortController.signal });
        if (photoBlob) {
          setPhotoUrl(photoBlob);
        }
      }
    } catch (error) {
      appInsights.trackException({ exception: error });
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
      setPhotoUrl(dummy_avatar);
    }
  }, [instance.getActiveAccount()?.name]);

  useEffect(() => { fetchProfilePhotoFunc(); }, [account]);

  // Mirror the Single-flight recovery state coming from authFlow so the
  // visible "Sign in" affordance can be suppressed while a background
  // re-login is in progress. Listens for `uws:recovery:started` /
  // `:finished` CustomEvents on `window`.
  const [reauthInFlight, setReauthInFlight] = useState(false);
  useEffect(() => {
    const onStart = () => setReauthInFlight(true);
    const onFinish = () => setReauthInFlight(false);
    window.addEventListener('uws:recovery:started', onStart);
    window.addEventListener('uws:recovery:finished', onFinish);
    return () => {
      window.removeEventListener('uws:recovery:started', onStart);
      window.removeEventListener('uws:recovery:finished', onFinish);
    };
  }, []);

  const handleLogin = async () => {
    appInsights.trackEvent({ name: 'Click Sign In' });
    await reauthenticate(instance, { navigate });
  };

  const handleLogout = () => {
    appInsights.trackEvent({ name: 'Click Sign Out' });
    instance.logoutPopup();
  };

  const toggleDropdown = (isOpen) => {
    setDropdownOpen(isOpen);
    setShowTooltip(false); // Hide tooltip when dropdown opens/closes
  };

  // Custom toggle for the Dropdown, with our own ref-forwarding so
  // Bootstrap's Dropdown can position the menu. `forwardRef` is part of
  // the React API and is the documented escape hatch when a component
  // needs to expose a DOM ref to a parent.
  const CustomToggle = forwardRef(({ onClick, ...props }, ref) => (
    <div 
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        onClick(e);
      }}
      className="profile-toggle"
      onMouseEnter={() => !dropdownOpen && setShowTooltip(true)} // Only show tooltip if dropdown is closed
      onMouseLeave={() => setShowTooltip(false)}
    >
      <img
        src={photoUrl}
        alt={account ? account.name : 'Sign In'}
        className="profile-avatar"
        data-testid={account ? 'profile-avatar' : 'sign-in-avatar'}
      />
      {showTooltip && !dropdownOpen && (
        <div className="profile-tooltip" data-testid="profile-tooltip">
          {account ? account.name : 'Sign In'}
        </div>
      )}
    </div>
  ));

  // Reset tooltip state on page navigation
  useEffect(() => {
    setShowTooltip(false);
  }, [location.pathname]);

  // Update CustomToggle with manual tooltip handling
  const updatedToggle = (props, ref) => (
    <CustomToggle {...props} ref={ref} onMouseEnter={() => !dropdownOpen && setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)} />
  );

  const handleDropdownToggle = (isOpen) => {
    toggleDropdown(isOpen);
  };

  if (!isAuthenticated) {
    return (
      <div data-testid="entra-profile-container">
        <Button
          variant="link"
          className="profile-toggle"
          onClick={handleLogin}
          aria-label="Sign in"
          data-testid="sign-in-button"
          disabled={reauthInFlight}
        >
          <img
            src={photoUrl}
            alt="Sign In"
            className="profile-avatar"
            data-testid="sign-in-avatar"
          />
          <span className="ms-2">Sign In</span>
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="entra-profile-container">
      <AuthenticatedTemplate>
        <Dropdown onToggle={handleDropdownToggle} data-testid="profile-dropdown">
          <Dropdown.Toggle as={updatedToggle} id="profile-dropdown-toggle">
          </Dropdown.Toggle>
          <Dropdown.Menu align="end" data-testid="profile-dropdown-menu">
            <Dropdown.Header data-testid="profile-dropdown-header">
              {account?.name}
            </Dropdown.Header>
            <Dropdown.Item
              onClick={handleLogout}
              data-testid="profile-dropdown-signout"
            >
              Sign Out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </AuthenticatedTemplate>
    </div>
  );
};

// Wrap the component in UnauthenticatedTemplate so MSAL's
// `inProgress` state hides the button during active login attempts;
// without this the button flickers briefly while MSAL is resolving the
// popup result.
export default () => (
  <UnauthenticatedTemplate>
    <EntraProfile />
  </UnauthenticatedTemplate>
);