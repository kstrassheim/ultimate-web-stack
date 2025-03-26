import { useState, useEffect, useRef } from 'react';
import './Home.css';
import { getAdminData } from '../components/api';
import { useMsal } from '@azure/msal-react';
import appInsights from '../components/appInsights';
import Loading, { sleep } from '../components/Loading'; // Import the Loading component

const Admin = () => {
  const { instance } = useMsal();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false); // Add loading state
  const [error, setError] = useState(null); // Add error state
  const initFetchCompleted = useRef(false);

  const fetchData = async () => {
    setLoading(true); // Start loading
    setError(null); // Clear any previous errors
    
    try {
      const result = await getAdminData(instance);
      await sleep(1000); // Optional: Add a delay to show the loading state
      setData(result);
    } catch (err) {
      setError(err.message);
      appInsights.trackException({ exception: err });
    } finally {
      setLoading(false); // End loading regardless of success/failure
    }
  }

  useEffect(() => { 
    if (!initFetchCompleted.current) {
      appInsights.trackEvent({ name: 'Admin - Fetch data started' });
      fetchData();
      initFetchCompleted.current = true;
      appInsights.trackEvent({ name: 'Admin - Fetch data completed' });
    }
  }, []);

  return (
    <>
      {/* Add the loading overlay */}
      <Loading visible={loading} message="Loading admin data..." />
      
      <div>
        <h1>Admin Page</h1>
        
        {/* Show error message if there is one */}
        {error && <div className="error">Error: {error}</div>}
        
        {/* Show data or a message if no data */}
        <div className="card">
          <h2>Admin Data</h2>
          <p>{data ? data.message : 'No data available'}</p>
        </div>
        
        <button 
          onClick={fetchData} 
          disabled={loading} 
          className="reload-button"
        >
          {loading ? 'Loading...' : 'Reload Data'}
        </button>
      </div>
    </>
  );
};

export default Admin;
