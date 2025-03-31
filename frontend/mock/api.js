// Mock implementation for backend API calls based on actual API responses
export const getUserData = async (instance) => {
  console.log('Using mock getUserData');
  
  // Add a small delay to simulate network latency
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Return exactly what the real backend API returns
  return {
    "message": "Hello from API"
  };
};

export const getAdminData = async (instance, message = "Hello from frontend", status = 123) => {
  console.log('Using mock getAdminData with:', { message, status });
  const isAdmin = instance.getActiveAccount()?.idTokenClaims?.roles?.includes('Admin');
  
  // Add a small delay to simulate network latency
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (!isAdmin) {
    // Simulate unauthorized error for non-admin users
    throw new Error('Unauthorized access to admin data');
  }
  
  if (status >= 400) {
    throw new Error(`Error: ${message}`);
  }
  
  // Return exactly what the real backend API returns
  return {
    "message": `Hello Admin: ${message}`,
    "status": status,
    "received": true
  };
};