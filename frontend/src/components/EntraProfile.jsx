import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import dummy_avatar from '@/assets/dummy-avatar.jpg'
import appInsights from '@/log/appInsights'; 
import { getProfilePhoto } from '@/api/graphApi';

const EntraProfile = () => {
  const { instance } = useMsal();
  const [photoUrl, setPhotoUrl] = useState(dummy_avatar);
  const [account, setAccount] = useState(null);
  
  const fetchProfilePhotoFunc = async () => {
    if (account) {
      try {
        let photo = await getProfilePhoto(instance, account);
        setPhotoUrl(photo);
      } catch (error) {
        console.error("Error fetching profile photo:", error);
        // Fall back to dummy avatar on error
        setPhotoUrl(dummy_avatar);
        // Log the error for telemetry
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

  return (
    <div data-testid="profile-wrapper">
      {account && (
        <div className="profile-container" data-testid="profile-container">
          <img src={photoUrl} alt="Profile" className="profile-image" data-testid="profile-image" />
          <div className="profile-name" data-testid="profile-name">{account.name}</div>
        </div>
      )}
    </div>
  );
};

export default EntraProfile;