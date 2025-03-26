import { useState, useEffect } from 'react';
import { loginRequest, useMsal } from './entraAuth';
import dummy_avatar from '../assets/dummy-avatar.jpg'
import appInsights from './appInsights'; 
import { getProfilePhoto } from './api';


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