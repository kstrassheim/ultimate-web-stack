import { useState, useEffect, useRef } from 'react';
import './Home.css';
import { getAdminData } from '@/api/api';
import { useMsal } from '@azure/msal-react';
import appInsights from '@/log/appInsights';
import Loading from '@/components/Loading';
import notyfService from '@/log/notyfService';

const Admin = () => {
  const { instance } = useMsal();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initFetchCompleted = useRef(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getAdminData(instance);
      setData(result);
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
      appInsights.trackEvent({ name: 'Admin - Fetch data started' });
      fetchData();
      initFetchCompleted.current = true;
      appInsights.trackEvent({ name: 'Admin - Fetch data completed' });
    }
  }, []);

  return (
    <>
      <Loading visible={loading} message="Loading admin data..." />
      
      <div data-testid="admin-page">
        <h1 data-testid="admin-heading">Admin Page</h1>
        
        {error && <div className="error" data-testid="admin-error">Error: {error}</div>}
        
        <div className="card" data-testid="admin-card">
          <h2 data-testid="admin-card-heading">Admin Data</h2>
          <p data-testid="admin-data-message">{data ? data.message : 'No data available'}</p>
        </div>
        
        <button 
          onClick={fetchData} 
          disabled={loading} 
          className="reload-button"
          data-testid="admin-reload-button"
        >
          {loading ? 'Loading...' : 'Reload Data'}
        </button>
      </div>
    </>
  );
};

export default Admin;
