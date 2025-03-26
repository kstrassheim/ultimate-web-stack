import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from './entraAuth';
import dummy_avatar from '../assets/dummy-avatar.jpg'
import appInsights from './appInsights'; 

// Custom function to receive the profile photo
export const getProfilePhoto = async (instance, activeAccount) => {
  try {
    appInsights.trackEvent({ name: 'Profile - Getting profile image' });
    if (!activeAccount) return;
    const tokenResponse = await instance.acquireTokenSilent({
      ...loginRequest,
      account: activeAccount,
    });
    const accessToken = tokenResponse.accessToken;
    const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } else {
      console.error('Failed to fetch profile photo:', response.statusText);
    }
  } catch (error) {
    appInsights.trackException({ error });
    console.error('Error fetching profile photo:', error);
  }
};

const EntraProfile = () => {
  const { instance } = useMsal();
  const [account, setAccount] = useState(instance.getActiveAccount());
  const activeAccount = instance.getActiveAccount();
  const [photoUrl, setPhotoUrl] = useState(null);

  const fetchProfilePhotoFunc = async () => {
    if (activeAccount) {
      let photo = await getProfilePhoto(instance, activeAccount);
      setPhotoUrl(photo);
    }
  };

  useEffect(() => {
    const currentAccount = instance.getActiveAccount();
    if (currentAccount && currentAccount !== account) {
      setAccount(currentAccount);
    }
  }, [instance, activeAccount ? activeAccount.name : null]);

  useEffect(() => { fetchProfilePhotoFunc(); }, [account]);

  return (
    <>
      {activeAccount && (
        <div className="profile-container">
          {photoUrl ? (
              <img src={photoUrl} alt="Profile" className="profile-image" />
          ) : (
            <img src={dummy_avatar} alt="Profile" className="profile-image" />
          )}
          <div className="profile-name">{activeAccount.name}</div>
        </div>
      )}
    </>
  );
};

export default EntraProfile;