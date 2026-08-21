import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import appInsights from '@/log/appInsights';

const ProtectedRoute = ({ children, requiredRoles = [] }) => {
  const { account, hasAllRoles } = useAuth();

  // If there is no active account, redirect to logon (or a login page)
  if (!account) {
    return (
      <div data-testid="protected-route-no-account">
        <Navigate to="/access-denied" replace />
      </div>
    );
  }

  if (!hasAllRoles(requiredRoles)) {
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
