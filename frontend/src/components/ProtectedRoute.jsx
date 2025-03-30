import React from 'react';
import { Navigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import appInsights from '@/log/appInsights';

const ProtectedRoute = ({ children, requiredRoles = [] }) => {
  const { instance } = useMsal();
  const account = instance.getActiveAccount();
  
  // If there is no active account, redirect to logon (or a login page)
  if (!account) {
    return (
      <div data-testid="protected-route-no-account">
        <Navigate to="/access-denied" replace />
      </div>
    );
  }

  // Get user roles from the token claims (depends on your configuration)
  const userRoles = account.idTokenClaims?.roles || [];
  // Normalize arrays before comparison
  const normalizedUserRoles = userRoles.map(r => r.toLowerCase());
  const normalizedRequiredRoles = requiredRoles.map(r => r.toLowerCase());

  const hasAccess = normalizedRequiredRoles.every(role => normalizedUserRoles.includes(role));
  
  if (!hasAccess) {
    appInsights.trackEvent({ name: 'Protected Route - Redirecting to Access denied page' });
    sessionStorage.setItem("redirectPath", location.pathname);
    // navigate does not work on account change
    return (
      <div data-testid="protected-route-insufficient-permissions">
        <Navigate to="/access-denied" replace state={{ requiredRoles }} />
      </div>
    );
  }
  
  return <div data-testid="protected-route-authorized">{children}</div>;
};

export default ProtectedRoute;