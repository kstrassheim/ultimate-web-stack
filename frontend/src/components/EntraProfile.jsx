import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import dummy_avatar from '@/assets/dummy-avatar.jpg'
import appInsights from '@/log/appInsights'; 
import { getProfilePhoto } from '@/api/graphApi';


const EntraProfile = () => {
  const { instance } = useMsal();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [account, setAccount] = useState(null);
  const fetchProfilePhotoFunc = async () => {
    if (account) {
      let photo = await getProfilePhoto(instance, account);
      setPhotoUrl(photo);
    }
  };

  useEffect(() => {
    const currentAccount = instance.getActiveAccount();
    if (currentAccount && currentAccount !== account) {
      setAccount(currentAccount);
    }
  }, [instance,  instance.getActiveAccount()?.name]);

  useEffect(() => { fetchProfilePhotoFunc(); }, [account]);

  return (
    <>
      {account && (
        <div className="profile-container">
          {photoUrl ? (
              <img src={photoUrl} alt="Profile" className="profile-image" />
          ) : (
            <img src={dummy_avatar} alt="Profile" className="profile-image" />
          )}
          <div className="profile-name">{account.name}</div>
        </div>
      )}
    </>
  );
};

export default EntraProfile;