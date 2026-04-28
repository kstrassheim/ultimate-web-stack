// In mock mode there is no real Entra redirect, so this is a no-op that
// exists only to satisfy vite's import-analysis when mocking is enabled.
export const broadcastResponseToMainFrame = async () => {};
