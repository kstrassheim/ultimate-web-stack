import { 
  getAllExperiments, getExperimentById, createExperiment, updateExperiment, deleteExperiment,
  getAllDMails, getDMailById, createDMail, updateDMail, deleteDMail,
  getAllDivergenceReadings, getDivergenceReadingById, createDivergenceReading, updateDivergenceReading, deleteDivergenceReading,
  getAllLabMembers, getLabMemberById, createLabMember, updateLabMember, deleteLabMember,
  ExperimentsSocketClient, DMailsSocketClient, DivergenceReadingsSocketClient, LabMembersSocketClient
} from './futureGadgetApi';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';
import { WebSocketClient } from './socket';

// Mock dependencies
jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForBackend: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

jest.mock('./socket', () => ({
  WebSocketClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    send: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    subscribeToStatus: jest.fn()
  }))
}));

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

  // Helper to verify common aspects of API calls
  const verifyCommonApiCall = (method = 'GET', endpoint, body = null) => {
    expect(retrieveTokenForBackend).toHaveBeenCalledWith(mockInstance);
    expect(appInsights.trackEvent).toHaveBeenCalledWith({
      name: `Api Call - Future Gadget Lab - ${method} ${endpoint}`
    });
    
    const expectedOptions = {
      method,
      headers: {
        'Authorization': `Bearer ${mockToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
      expectedOptions.body = JSON.stringify(body);
    }
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/future-gadget-lab${endpoint}`),
      expectedOptions
    );
  };

  // Test for failed API request
  const testFailedRequest = async (apiMethod, ...args) => {
    // Setup fetch to return error
    const errorResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    };
    global.fetch.mockResolvedValueOnce(errorResponse);

    // Call the API and expect it to throw
    await expect(apiMethod(mockInstance, ...args)).rejects.toThrow();
    
    // Verify error was tracked
    expect(appInsights.trackException).toHaveBeenCalled();
    
    // Verify console.error was called (optional, can be removed if not needed)
    expect(console.error).toHaveBeenCalled();
  };

  // === EXPERIMENTS API TESTS ===
  describe('Experiments API', () => {
    it('getAllExperiments fetches all experiments', async () => {
      const result = await getAllExperiments(mockInstance);
      
      verifyCommonApiCall('GET', '/experiments');
      expect(result).toEqual(mockResponse);
    });
    
    it('getExperimentById fetches a specific experiment', async () => {
      const experimentId = 'exp-123';
      const result = await getExperimentById(mockInstance, experimentId);
      
      verifyCommonApiCall('GET', `/experiments/${experimentId}`);
      expect(result).toEqual(mockResponse);
    });
    
    it('createExperiment creates a new experiment', async () => {
      const experimentData = { name: 'New Experiment', description: 'Testing' };
      const result = await createExperiment(mockInstance, experimentData);
      
      verifyCommonApiCall('POST', '/experiments', experimentData);
      expect(result).toEqual(mockResponse);
    });
    
    it('updateExperiment updates an existing experiment', async () => {
      const experimentId = 'exp-123';
      const experimentData = { name: 'Updated Experiment' };
      const result = await updateExperiment(mockInstance, experimentId, experimentData);
      
      verifyCommonApiCall('PUT', `/experiments/${experimentId}`, experimentData);
      expect(result).toEqual(mockResponse);
    });
    
    it('deleteExperiment deletes an experiment', async () => {
      const experimentId = 'exp-123';
      // Mock specific success response for DELETE
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
      
      const result = await deleteExperiment(mockInstance, experimentId);
      
      verifyCommonApiCall('DELETE', `/experiments/${experimentId}`);
      expect(result).toEqual({ success: true });
    });
    
    it('handles failed experiments API request', async () => {
      await testFailedRequest(getAllExperiments);
    });
  });
  
  // === D-MAIL API TESTS ===
  describe('D-Mail API', () => {
    it('getAllDMails fetches all D-Mails', async () => {
      const result = await getAllDMails(mockInstance);
      
      verifyCommonApiCall('GET', '/d-mails');
      expect(result).toEqual(mockResponse);
    });
    
    it('getDMailById fetches a specific D-Mail', async () => {
      const dMailId = 'dm-123';
      const result = await getDMailById(mockInstance, dMailId);
      
      verifyCommonApiCall('GET', `/d-mails/${dMailId}`);
      expect(result).toEqual(mockResponse);
    });
    
    it('createDMail creates a new D-Mail', async () => {
      const dMailData = { 
        sender_id: '001', 
        recipient: '002',
        content: 'Test message',
        target_timestamp: '2025-04-05T20:00:00' 
      };
      const result = await createDMail(mockInstance, dMailData);
      
      verifyCommonApiCall('POST', '/d-mails', dMailData);
      expect(result).toEqual(mockResponse);
    });
    
    it('updateDMail updates an existing D-Mail', async () => {
      const dMailId = 'dm-123';
      const dMailData = { content: 'Updated message' };
      const result = await updateDMail(mockInstance, dMailId, dMailData);
      
      verifyCommonApiCall('PUT', `/d-mails/${dMailId}`, dMailData);
      expect(result).toEqual(mockResponse);
    });
    
    it('deleteDMail deletes a D-Mail', async () => {
      const dMailId = 'dm-123';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
      
      const result = await deleteDMail(mockInstance, dMailId);
      
      verifyCommonApiCall('DELETE', `/d-mails/${dMailId}`);
      expect(result).toEqual({ success: true });
    });
    
    it('handles failed D-Mail API request', async () => {
      await testFailedRequest(getDMailById, 'dm-123');
    });
  });
  
  // === DIVERGENCE READINGS API TESTS ===
  describe('Divergence Readings API', () => {
    it('getAllDivergenceReadings fetches all readings', async () => {
      const result = await getAllDivergenceReadings(mockInstance);
      
      verifyCommonApiCall('GET', '/divergence-readings');
      expect(result).toEqual(mockResponse);
    });
    
    it('getDivergenceReadingById fetches a specific reading', async () => {
      const readingId = 'dr-123';
      const result = await getDivergenceReadingById(mockInstance, readingId);
      
      verifyCommonApiCall('GET', `/divergence-readings/${readingId}`);
      expect(result).toEqual(mockResponse);
    });
    
    it('createDivergenceReading creates a new reading', async () => {
      const readingData = { reading: 1.048596, status: 'alpha', recorded_by: '001' };
      const result = await createDivergenceReading(mockInstance, readingData);
      
      verifyCommonApiCall('POST', '/divergence-readings', readingData);
      expect(result).toEqual(mockResponse);
    });
    
    it('updateDivergenceReading updates a reading', async () => {
      const readingId = 'dr-123';
      const readingData = { reading: 0.571024, status: 'beta' };
      const result = await updateDivergenceReading(mockInstance, readingId, readingData);
      
      verifyCommonApiCall('PUT', `/divergence-readings/${readingId}`, readingData);
      expect(result).toEqual(mockResponse);
    });
    
    it('deleteDivergenceReading deletes a reading', async () => {
      const readingId = 'dr-123';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
      
      const result = await deleteDivergenceReading(mockInstance, readingId);
      
      verifyCommonApiCall('DELETE', `/divergence-readings/${readingId}`);
      expect(result).toEqual({ success: true });
    });
    
    it('handles failed divergence reading API request', async () => {
      await testFailedRequest(updateDivergenceReading, 'dr-123', {});
    });
  });
  
  // === LAB MEMBERS API TESTS ===
  describe('Lab Members API', () => {
    it('getAllLabMembers fetches all lab members', async () => {
      const result = await getAllLabMembers(mockInstance);
      
      verifyCommonApiCall('GET', '/lab-members');
      expect(result).toEqual(mockResponse);
    });
    
    it('getLabMemberById fetches a specific lab member', async () => {
      const memberId = 'lm-123';
      const result = await getLabMemberById(mockInstance, memberId);
      
      verifyCommonApiCall('GET', `/lab-members/${memberId}`);
      expect(result).toEqual(mockResponse);
    });
    
    it('createLabMember creates a new lab member', async () => {
      const memberData = { name: 'Okabe Rintaro', codename: 'Hououin Kyouma', role: 'Lab Leader' };
      const result = await createLabMember(mockInstance, memberData);
      
      verifyCommonApiCall('POST', '/lab-members', memberData);
      expect(result).toEqual(mockResponse);
    });
    
    it('updateLabMember updates a lab member', async () => {
      const memberId = 'lm-123';
      const memberData = { codename: 'Mad Scientist' };
      const result = await updateLabMember(mockInstance, memberId, memberData);
      
      verifyCommonApiCall('PUT', `/lab-members/${memberId}`, memberData);
      expect(result).toEqual(mockResponse);
    });
    
    it('deleteLabMember deletes a lab member', async () => {
      const memberId = 'lm-123';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });
      
      const result = await deleteLabMember(mockInstance, memberId);
      
      verifyCommonApiCall('DELETE', `/lab-members/${memberId}`);
      expect(result).toEqual({ success: true });
    });
    
    it('handles failed lab member API request', async () => {
      await testFailedRequest(createLabMember, {});
    });
  });
  
  // === WEBSOCKET CLIENT TESTS ===
  describe('WebSocket Clients', () => {
    it('initializes ExperimentsSocketClient with correct path', () => {
      const client = new ExperimentsSocketClient();
      expect(WebSocketClient).toHaveBeenCalledWith('future-gadget-lab/ws/experiments');
    });
    
    it('initializes DMailsSocketClient with correct path', () => {
      const client = new DMailsSocketClient();
      expect(WebSocketClient).toHaveBeenCalledWith('future-gadget-lab/ws/d-mails');
    });
    
    it('initializes DivergenceReadingsSocketClient with correct path', () => {
      const client = new DivergenceReadingsSocketClient();
      expect(WebSocketClient).toHaveBeenCalledWith('future-gadget-lab/ws/divergence-readings');
    });
    
    it('initializes LabMembersSocketClient with correct path', () => {
      const client = new LabMembersSocketClient();
      expect(WebSocketClient).toHaveBeenCalledWith('future-gadget-lab/ws/lab-members');
    });
  });
  
  // === COMMON ERROR HANDLING TESTS ===
  describe('Error handling', () => {
    it('throws and logs network errors', async () => {
      const networkError = new Error('Network failure');
      global.fetch.mockRejectedValueOnce(networkError);
      
      await expect(getAllExperiments(mockInstance)).rejects.toThrow(networkError);
      
      expect(appInsights.trackException).toHaveBeenCalledWith({
        exception: networkError,
        properties: { 
          operation: 'GET /experiments', 
          source: 'Future Gadget Lab API' 
        }
      });
      
      // Verify console.error was called with the right message
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in Future Gadget Lab API (GET /experiments)'),
        networkError
      );
    });
    
    it('throws and logs API error responses', async () => {
      const errorResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      };
      global.fetch.mockResolvedValueOnce(errorResponse);
      
      await expect(getAllExperiments(mockInstance)).rejects.toThrow('Request failed (403): Forbidden');
      
      expect(appInsights.trackException).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});