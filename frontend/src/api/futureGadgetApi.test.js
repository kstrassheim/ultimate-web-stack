// First define the mocks before importing anything
jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForBackend: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

// Define a mock function for WebSocketClient
jest.mock('./socket', () => {
  // Factory function approach
  return {
    WebSocketClient: function(endpoint) {
      this.endpoint = endpoint;
      this.connect = jest.fn();
      this.send = jest.fn();
      this.disconnect = jest.fn();
      this.subscribe = jest.fn();
      this.subscribeToStatus = jest.fn();
    }
  };
});

// Now import the modules that use the mocks
import { 
  getAllExperiments, getExperimentById, createExperiment, updateExperiment, deleteExperiment,
  formatExperimentTimestamp, formatWorldLineChange,
  ExperimentsSocketClient, experimentsSocket
} from './futureGadgetApi';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import { WebSocketClient } from './socket';

// Mock global fetch
global.fetch = jest.fn();

describe('Future Gadget Lab API', () => {
  const mockInstance = { name: 'mockInstance' };
  const mockToken = 'fake-token-123';
  const mockResponse = { id: '123', name: 'Test Data' };
  let originalConsoleError;
  
  beforeAll(() => {
    // Store original console.error
    originalConsoleError = console.error;
    // Replace with silent mock for all tests
    console.error = jest.fn();
  });
  
  afterAll(() => {
    // Restore original console.error
    console.error = originalConsoleError;
  });
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementation
    retrieveTokenForBackend.mockResolvedValue(mockToken);
    
    // Setup fetch default success response
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse)
    });
  });
  
  // Test helper functions first
  describe('formatExperimentTimestamp', () => {
    it('should format a timestamp correctly', () => {
      const experiment = { timestamp: '2025-04-07T12:34:56.789Z' };
      const formatted = formatExperimentTimestamp(experiment);
      expect(formatted).not.toBe('Unknown');
      expect(formatted).toContain('2025');
    });
    
    it('should return "Unknown" for missing timestamp', () => {
      const experiment = { name: 'No timestamp experiment' };
      const formatted = formatExperimentTimestamp(experiment);
      expect(formatted).toBe('Unknown');
    });
  });
  
  describe('formatWorldLineChange', () => {
    it('should format a world line change value with 6 decimal places', () => {
      expect(formatWorldLineChange(1.048596)).toBe('+1.048596');
      expect(formatWorldLineChange('0.337192')).toBe('+0.337192');
    });
    
    it('should handle zero values', () => {
      expect(formatWorldLineChange(0)).toBe('+0.000000');
    });
    
    it('should return "N/A" for null or undefined values', () => {
      expect(formatWorldLineChange(null)).toBe('N/A');
      expect(formatWorldLineChange(undefined)).toBe('N/A');
    });
    
    it('should preserve and show negative values with their sign', () => {
      expect(formatWorldLineChange(-1.048596)).toBe('-1.048596');
      expect(formatWorldLineChange('-0.337192')).toBe('-0.337192');
    });

    it('should add plus sign to positive values', () => {
      expect(formatWorldLineChange(1.048596)).toBe('+1.048596');
      expect(formatWorldLineChange('0.337192')).toBe('+0.337192');
    });
  });
  
  // Now test API methods - Experiments only
  describe('getAllExperiments', () => {
    it('should make a GET request to /lab-experiments', async () => {
      await getAllExperiments(mockInstance);
      
      expect(retrieveTokenForBackend).toHaveBeenCalledWith(mockInstance, []);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`
          })
        })
      );
      expect(appInsights.trackEvent).toHaveBeenCalled();
    });
    
    it('should handle errors properly', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(getAllExperiments(mockInstance)).rejects.toThrow('Network error');
      expect(appInsights.trackException).toHaveBeenCalled();
    });
  });
  
  describe('getExperimentById', () => {
    it('should make a GET request to /lab-experiments/{id}', async () => {
      await getExperimentById(mockInstance, '123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments/123'),
        expect.any(Object)
      );
    });
  });
  
  describe('createExperiment', () => {
    it('should make a POST request to /lab-experiments with experiment data', async () => {
      const experimentData = {
        name: 'New Experiment',
        description: 'Test description',
        status: 'in_progress',
        creator_id: '001',
        world_line_change: 0.337192,
        timestamp: '2025-04-07T12:00:00Z'
      };
      
      await createExperiment(mockInstance, experimentData);
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(experimentData)
        })
      );
    });
    
    it('should automatically add timestamp if not provided', async () => {
      const experimentData = {
        name: 'New Experiment Without Timestamp',
        description: 'Test description',
        status: 'in_progress',
        creator_id: '001',
        world_line_change: 0.337192
        // No timestamp provided
      };
      
      await createExperiment(mockInstance, experimentData);
      
      // Get the actual data that was passed to fetch
      const actualCall = global.fetch.mock.calls[0];
      const actualBody = JSON.parse(actualCall[1].body);
      
      // Check that timestamp was added
      expect(actualBody).toHaveProperty('timestamp');
      expect(actualBody.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      
      // All other data should be preserved
      expect(actualBody.name).toBe(experimentData.name);
      expect(actualBody.description).toBe(experimentData.description);
    });

    it('should handle negative world line change values', async () => {
      const experimentData = {
        name: 'Negative World Line Change',
        description: 'Testing negative divergence',
        status: 'completed',
        creator_id: '001',
        world_line_change: -0.412591,
        timestamp: '2025-04-07T12:00:00Z'
      };
      
      await createExperiment(mockInstance, experimentData);
      
      // Get the actual data that was passed to fetch
      const actualCall = global.fetch.mock.calls[0];
      const actualBody = JSON.parse(actualCall[1].body);
      
      // Verify negative value is preserved
      expect(actualBody.world_line_change).toBe(-0.412591);
    });
  });
  
  describe('updateExperiment', () => {
    it('should make a PUT request to /lab-experiments/{id} with update data', async () => {
      const updateData = {
        name: 'Updated Experiment',
        status: 'completed',
        world_line_change: 0.571024
      };
      
      await updateExperiment(mockInstance, '123', updateData);
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments/123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData)
        })
      );
    });

    it('should handle updating to a negative world line change value', async () => {
      const updateData = {
        name: 'Undoing Previous Experiment',
        status: 'completed',
        world_line_change: -0.275349
      };
      
      await updateExperiment(mockInstance, '123', updateData);
      
      // Get the actual data that was passed to fetch
      const actualCall = global.fetch.mock.calls[0];
      const actualBody = JSON.parse(actualCall[1].body);
      
      // Verify negative value is preserved
      expect(actualBody.world_line_change).toBe(-0.275349);
    });
  });
  
  describe('deleteExperiment', () => {
    it('should make a DELETE request to /lab-experiments/{id}', async () => {
      await deleteExperiment(mockInstance, '123');
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/future-gadget-lab/lab-experiments/123'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
    
    it('should return a success object for DELETE operations', async () => {
      const result = await deleteExperiment(mockInstance, '123');
      expect(result).toEqual({ success: true });
    });
  });
  
  // Test WebSocket client
  describe('ExperimentsSocketClient', () => {
    it('should create a WebSocket client with the correct endpoint', () => {
      const client = new ExperimentsSocketClient();
      expect(client.endpoint).toBe('future-gadget-lab/ws/lab-experiments');
    });
    
    it('should export a singleton instance with WebSocket methods', () => {
      // Check for properties instead of instance type
      expect(experimentsSocket).toHaveProperty('connect');
      expect(experimentsSocket).toHaveProperty('disconnect');
      expect(experimentsSocket).toHaveProperty('subscribe');
      expect(experimentsSocket).toHaveProperty('send');
      expect(experimentsSocket).toHaveProperty('subscribeToStatus');
    });
  });
});