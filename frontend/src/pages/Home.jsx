import { useState, useEffect, useRef } from 'react'
import './Home.css'
import { getUserData, getAllGroups } from '../components/api'
import { useMsal } from '@azure/msal-react';
import {env} from '../config'
import appInsights from '../components/appInsights';
import GroupsList from '../components/GroupsList';
import Loading, {sleep} from '../components/Loading';

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
      // await sleep(1000);
    } catch (err) {
      setError(err.message);
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
  }, [])

  return (
    <>
      <Loading visible={loading} message="Fetching data from APIs..." />
      
      <div>
        <h1>Home Page</h1>
        {/* <p>Environment: {env}</p>
         */}
        {error && <div className="error">Error: {error}</div>}
        
        <div className="card">
          <h2>API Response</h2>
          <p>{data ? data.message : 'No data available'}</p>
        </div>
        
        <div className="card">
          <h2>Groups from Microsoft Graph API</h2>
          <GroupsList groups={groupData} loading={loading} />
        </div>
        
        <button onClick={fetchData} disabled={loading} className="reload-button">
          {loading ? 'Loading...' : 'Reload Data'}
        </button>
      </div>
    </>
  )
}

export default Home;
