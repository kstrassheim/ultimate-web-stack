import { useState, useEffect, useRef } from 'react'
import './Dashboard.css'
import { getUserData } from '@/api/api'
import { getAllGroups } from '@/api/graphApi'
import { useMsal } from '@azure/msal-react';
import appInsights from '@/log/appInsights';
import GroupsList from '@/pages/components/GroupsList';
import WorldlineMonitor from '@/pages/components/WorldlineMonitor';
import Loading, {sleep} from '@/components/Loading';
import notyfService from '@/log/notyfService';

const Dashboard = () => {
  const { instance } = useMsal();
  const [data, setData] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initFetchCompleted = useRef(false);
  const currentUserRef = useRef(instance.getActiveAccount()?.username);

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
      notyfService.success('Data loaded successfully!');
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
    // Get current user
    const currentUser = instance.getActiveAccount()?.username;
    
    // Force a reload of data when the user changes
    if (currentUserRef.current !== currentUser) {
      console.log('User changed, reloading data...');
      currentUserRef.current = currentUser;
      initFetchCompleted.current = false; // Reset to force reload
    }
    
    if (!initFetchCompleted.current) {
      appInsights.trackEvent({ name: 'Home - Fetch data started' });
      fetchData();
      appInsights.trackEvent({ name: 'Home - Fetch data completed' });
      initFetchCompleted.current = true;
    }
  }, [instance, instance.getActiveAccount()?.username, instance.getActiveAccount()?.name]);

  return (
    <div data-testid="dashboard-page">
      {/* Add WorldlineMonitor at the top of the dashboard */}
      <div className="mb-5" data-testid="worldline-container">
        <WorldlineMonitor />
      </div>
      
      <hr className="my-5" />
      
      <Loading visible={loading} message="Fetching data from APIs..." />
      
      <div data-testid="home-container">

       
        
        <div data-testid="groups-container" className="card">
          <h2>Groups from Microsoft Graph API</h2>
          <GroupsList groups={groupData} loading={loading} />
        </div>
        {error && <div data-testid="error-message" className="error">Error: {error}</div>}
        
        <div data-testid="api-response-card" className="card">
          <h2>API Response</h2>
          {data ? (
            <p data-testid="api-message-data">{data.message}</p>
          ) : (
            <p data-testid="api-message-empty">No data available</p>
          )}
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
    </div>
  )
}

export default Dashboard;
