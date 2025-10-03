import { getAccessToken } from '../auth/AuthConfig';

const API_BASE_URL = '/api';

/**
 * Get all customers
 */
export const getAllCustomers = async (msalInstance) => {
  const token = await getAccessToken(msalInstance);
  
  const response = await fetch(`${API_BASE_URL}/customers`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch customers: ${error}`);
  }
  
  return response.json();
};

/**
 * Get a single customer by ID
 */
export const getCustomerById = async (msalInstance, id) => {
  const token = await getAccessToken(msalInstance);
  
  const response = await fetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch customer: ${error}`);
  }
  
  return response.json();
};

/**
 * Create a new customer
 */
export const createCustomer = async (msalInstance, customerData) => {
  const token = await getAccessToken(msalInstance);
  
  const response = await fetch(`${API_BASE_URL}/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create customer: ${error}`);
  }
  
  return response.json();
};

/**
 * Update an existing customer
 */
export const updateCustomer = async (msalInstance, id, customerData) => {
  const token = await getAccessToken(msalInstance);
  
  const response = await fetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update customer: ${error}`);
  }
  
  return response.json();
};

/**
 * Delete a customer
 */
export const deleteCustomer = async (msalInstance, id) => {
  const token = await getAccessToken(msalInstance);
  
  const response = await fetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete customer: ${error}`);
  }
  
  // DELETE returns 204 No Content on success
  return null;
};
