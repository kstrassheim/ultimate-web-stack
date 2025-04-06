import { useState, useEffect, useRef } from 'react'
import './Home.css'
import { getUserData } from '@/api/api'
import { getAllGroups } from '@/api/graphApi'
import { useMsal } from '@azure/msal-react';
import appInsights from '@/log/appInsights';
import GroupsList from '@/pages/components/GroupsList';
import Loading, {sleep} from '@/components/Loading';
import notyfService from '@/log/notyfService';

const Home = () => {
  const { instance } = useMsal();
  const [data, setData] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initFetchCompleted = useRef(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userData, groupsData] = await Promise.all([
        getUserData(instance),
        getAllGroups(instance)
      ]);
   
      setData(userData);
      setGroupData(groupsData);
      // Show success notification
      notyfService.success('Data reloaded successfully!');
    } catch (err) {
      setError(err.message);
      // Show error notification
      notyfService.error('Failed to load data: ' + err.message);
      appInsights.trackException({ exception: err });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    if (!initFetchCompleted.current) {
      appInsights.trackEvent({ name: 'Home - Fetch data started' });
      fetchData();
      appInsights.trackEvent({ name: 'Home - Fetch data completed' });
      initFetchCompleted.current = true;
    }
  }, [instance, instance.getActiveAccount()?.name])

  return (
    <>
      <Loading visible={loading} message="Fetching data from APIs..." />
      
      <div data-testid="home-container">
        <h1>Home Page</h1>
        
        {error && <div data-testid="error-message" className="error">Error: {error}</div>}
        
        <div data-testid="api-response-card" className="card">
          <h2>API Response</h2>
          {data ? (
            <p data-testid="api-message-data">{data.message}</p>
          ) : (
            <p data-testid="api-message-empty">No data available</p>
          )}
        </div>
        
        <div data-testid="groups-container" className="card">
          <h2>Groups from Microsoft Graph API</h2>
          <GroupsList groups={groupData} loading={loading} />
        </div>
        
        <button 
          data-testid="reload-button"
          onClick={fetchData} 
          disabled={loading} 
          className="reload-button"
        >
          {loading ? 'Loading...' : 'Reload Data'}
        </button>
      </div>
    </>
  )
}

export default Home;
