import { useState, useEffect, useRef } from 'react'
import './Dashboard.css'
import { getUserData } from '@/api/api'
import { getAllGroups } from '@/api/graphApi'
import { isGraphConsentRequiredError } from '@/auth/entraAuth'
import { useMsal } from '@azure/msal-react';
import appInsights from '@/log/appInsights';
import GroupsList from '@/pages/components/GroupsList';
import WorldlineMonitor from '@/pages/components/WorldlineMonitor';
import Loading, {sleep} from '@/components/Loading';
import notyfService from '@/log/notyfService';
import { useAbortController } from '@/utils/useAbortController';

const Dashboard = () => {
  const { instance } = useMsal();
  const [data, setData] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const initFetchCompleted = useRef(false);
  const currentUserRef = useRef(instance.getActiveAccount()?.username);
  // Issue #113: keep an AbortController scoped to this component's mount
  // so an in-flight `getUserData` / `getAllGroups` is cancelled when the
  // Dashboard unmounts (or when the user-account effect re-runs). The
  // helper functions accept an optional `{ signal }` arg; without one
  // they fall back to their default timeout behaviour.
  const abortController = useAbortController();

  // Graph groups are fetched separately from the app's own API so a missing
  // Graph consent degrades to a "Grant access" prompt instead of failing the
  // whole dashboard (issue #151). Only `interactive: true` — reached from the
  // button below, i.e. a real user gesture — may open an MSAL popup; a popup
  // from this mount effect lands outside the window in an installed PWA.
  const fetchGroups = async (signal, { interactive = false } = {}) => {
    try {
      const groupsData = await getAllGroups(instance, { signal, interactive });
      setGroupData(groupsData);
      setConsentRequired(false);
    } catch (err) {
      if (!isGraphConsentRequiredError(err)) {
        throw err;
      }
      setGroupData(null);
      setConsentRequired(true);
    }
  };

  const grantGroupAccess = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchGroups(abortController.signal, { interactive: true });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setError(err.message);
      notyfService.error('Failed to load groups: ' + err.message);
      appInsights.trackException({ exception: err });
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const [userData] = await Promise.all([
        getUserData(instance, { signal }),
        fetchGroups(signal)
      ]);

      setData(userData);
      // Show success notification
      notyfService.success('Data loaded successfully!');
    } catch (err) {
      // A caller-driven abort (component unmounted) is the silent path;
      // skip surfacing it as a user-visible error.
      if (err && err.name === 'AbortError') return;
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
      fetchData(abortController.signal);
      appInsights.trackEvent({ name: 'Home - Fetch data completed' });
      initFetchCompleted.current = true;
    }
  }, [instance, instance.getActiveAccount()?.username, instance.getActiveAccount()?.name, abortController.signal]);

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
          {consentRequired ? (
            <div className="groups-consent" data-testid="groups-consent-required">
              <p>Your account has not granted this app access to your groups.</p>
              <button
                data-testid="grant-groups-access-button"
                onClick={grantGroupAccess}
                disabled={loading}
                className="reload-button"
              >
                Grant access
              </button>
            </div>
          ) : (
            <GroupsList groups={groupData} loading={loading} />
          )}
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
          onClick={() => fetchData(abortController.signal)}
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