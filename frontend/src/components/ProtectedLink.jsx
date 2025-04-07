import React from 'react';
import { useMsal } from '@azure/msal-react';
import PropTypes from 'prop-types';

/**
 * Component that conditionally renders children based on user roles
 * Use this to hide navigation links or UI elements that require specific roles
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - The content to conditionally render
 * @param {Array<string>} [props.requiredRoles=[]] - Roles required to view the content
 * @param {boolean} [props.showIfUnauthenticated=false] - Whether to show content if user is not authenticated
 * @returns {React.ReactElement|null} The children if authorized, otherwise null
 */
const ProtectedLink = ({ 
  children, 
  requiredRoles = [], 
  showIfUnauthenticated = false 
}) => {
  const { instance } = useMsal();
  const account = instance.getActiveAccount();
  
  // If there is no active account, either hide or show based on showIfUnauthenticated
  if (!account) {
    return showIfUnauthenticated ? children : null;
  }

  // If no specific roles are required, show the content
  if (requiredRoles.length === 0) {
    return children;
  }

  // Get user roles from the token claims
  const userRoles = account.idTokenClaims?.roles || [];
  
  // Normalize arrays before comparison for case-insensitive matching
  const normalizedUserRoles = userRoles.map(r => r.toLowerCase());
  const normalizedRequiredRoles = requiredRoles.map(r => r.toLowerCase());

  // Check if user has all required roles
  const hasAllRequiredRoles = normalizedRequiredRoles.every(
    role => normalizedUserRoles.includes(role)
  );
  
  // If user has required roles, render the children, otherwise return null
  return hasAllRequiredRoles ? children : null;
};

ProtectedLink.propTypes = {
  children: PropTypes.node.isRequired,
  requiredRoles: PropTypes.arrayOf(PropTypes.string),
  showIfUnauthenticated: PropTypes.bool
};

export default ProtectedLink;