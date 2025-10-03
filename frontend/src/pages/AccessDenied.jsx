import React from 'react';
import { useLocation } from 'react-router';
import appInsights from '@/log/appInsights';

const AccessDenied = () => {
  appInsights.trackEvent({ name: 'Access Denied page' });
  const location = useLocation();
  const requiredRoles = location.state?.requiredRoles || [];
  return (
    <div data-testid="access-denied-page">
      <h2 data-testid="access-denied-heading">Access Denied</h2>
      {requiredRoles.length > 0 ? (
        <>
          <p data-testid="access-denied-role-message">You do not have permission to view this section.</p>
          <p data-testid="access-denied-required-roles">Required roles: {requiredRoles.join(', ')}</p>
          
        </>
      ) : (<>
        <p data-testid="access-denied-login-message">You do not have permission to view this page.</p>
        <p data-testid="access-denied-signin-prompt">Please sign in for access</p>
        </>
      )}
      
    </div>
  );
};

export default AccessDenied;