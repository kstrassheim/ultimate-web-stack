import React from 'react';
import { useLocation } from 'react-router-dom';
import appInsights from './appInsights';

const AccessDenied = () => {
  appInsights.trackEvent({ name: 'Access Denied page' });
  const location = useLocation();
  const requiredRoles = location.state?.requiredRoles || [];
  return (
    <div>
      <h2>Access Denied</h2>
      {requiredRoles.length > 0 ? (
        <>
          <p>You do not have permission to view this section.</p>
          <p>Required roles: {requiredRoles.join(', ')}</p>
          
        </>
      ) : (<>
        <p>You do not have permission to view this page.</p>
        <p>Please sign in for access</p>
        </>
      )}
      
    </div>
  );
};

export default AccessDenied;