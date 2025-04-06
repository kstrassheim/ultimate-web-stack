import { WebSocketClient } from './socket';
import { backendSocketUrl } from '@/config';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';

// Mock dependencies
jest.mock('@/config', () => ({
  backendSocketUrl: 'wss://test.example.com'
}));

jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForBackend: jest.fn()
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
}));

// Create mock WebSocket class
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.OPEN;
    this.send = jest.fn();
    this.close = jest.fn();
  }
  
  // Helper methods to simulate WebSocket events
  simulateOpen() {
    if (this.onopen) this.onopen();
  }
  
  simulateMessage(data) {
    if (this.onmessage) this.onmessage({ data });
  }
  
  simulateError(error) {
    if (this.onerror) this.onerror(error);
  }
  
  simulateClose() {
    if (this.onclose) this.onclose();
  }
}

// Define WebSocket constants
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

// Replace global WebSocket with mock
global.WebSocket = MockWebSocket;

describe('WebSocketClient', () => {
  let client;
  let mockInstance;
  let mockWebSocket;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock MSAL instance
    mockInstance = {
      getActiveAccount: jest.fn().mockReturnValue({
        name: 'Test User',
        username: 'test.user@example.com'
      })
    };
    
    // Setup auth mock to return a token
    retrieveTokenForBackend.mockResolvedValue('mock-token-123');
    
    // Create new WebSocketClient
    client = new WebSocketClient('api/test-socket');
    
    // Capture created WebSocket instance
    global.WebSocket = jest.fn(url => {
      mockWebSocket = new MockWebSocket(url);
      return mockWebSocket;
    });
  });
  
  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(client.path).toBe('api/test-socket');
      expect(client.socket).toBeNull();
      expect(client.listeners).toEqual([]);
      expect(client.statusListeners).toEqual([]);
      expect(client.connectionStatus).toBe('disconnected');
    });
  });
  
  describe('connect', () => {
    it('should establish WebSocket connection and authenticate', async () => {
      const result = await client.connect(mockInstance);
      
      // Check WebSocket was created with correct URL
      expect(global.WebSocket).toHaveBeenCalledWith('wss://test.example.com/api/test-socket');
      
      // Check token was requested
      expect(retrieveTokenForBackend).toHaveBeenCalledWith(mockInstance);
      
      // Simulate WebSocket connected
      mockWebSocket.simulateOpen();
      
      // Check authentication message was sent
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'authenticate',
          token: 'mock-token-123'
        })
      );
      
      // Check status was updated
      expect(client.connectionStatus).toBe('connected');
      
      // Connection should return true for success
      expect(result).toBe(true);
      
      // Check telemetry was logged
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ 
        name: 'WebSocket - Connect' 
      });
    });
    
    it('should disconnect existing connection before creating a new one', async () => {
      // First connect
      await client.connect(mockInstance);
      const firstSocket = mockWebSocket;
      
      // Connect again
      await client.connect(mockInstance);
      
      // Check first socket was closed
      expect(firstSocket.close).toHaveBeenCalled();
    });
    
    it('should handle connection errors', async () => {
      // Make token retrieval fail
      retrieveTokenForBackend.mockRejectedValue(new Error('Token error'));
      
      const result = await client.connect(mockInstance);
      
      // Should return false for failure
      expect(result).toBe(false);
      
      // Status should be error
      expect(client.connectionStatus).toBe('error');
      
      // Error should be tracked
      expect(appInsights.trackException).toHaveBeenCalled();
    });
  });
  
  describe('send', () => {
    beforeEach(async () => {
      await client.connect(mockInstance);
      mockWebSocket.simulateOpen();
      
      // Clear mock history before each test
      mockWebSocket.send.mockClear();
    });
    
    it('should send string messages directly', () => {
      const result = client.send('Hello, WebSocket!');
      
      expect(mockWebSocket.send).toHaveBeenCalledWith('Hello, WebSocket!');
      expect(result).toBe(true);
    });
    
    it('should convert object messages to JSON with default type', () => {
      const result = client.send({ content: 'Test message' });
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          content: 'Test message',
          type: 'message'  // Default type
        })
      );
      expect(result).toBe(true);
    });
    
    it('should respect custom message type for objects', () => {
      const result = client.send({ 
        content: 'New item',
        type: 'create'
      });
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          content: 'New item',
          type: 'create'  // Custom type preserved
        })
      );
      expect(result).toBe(true);
    });
    
    it('should convert non-string, non-object data to string', () => {
      const result = client.send(123);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith('123');
      expect(result).toBe(true);
    });
    
    it('should return false if WebSocket is not connected', () => {
      // Clear previous mock calls and set disconnected state
      mockWebSocket.send.mockClear();
      client.connectionStatus = 'disconnected';
      
      const result = client.send('Test message');
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
    
    it('should handle send errors and track exceptions', () => {
      mockWebSocket.send.mockImplementation(() => {
        throw new Error('Send failed');
      });
      
      const result = client.send('Test message');
      
      expect(result).toBe(false);
      expect(appInsights.trackException).toHaveBeenCalled();
    });
  });
  
  describe('message handling', () => {
    let messageListener;
    
    beforeEach(async () => {
      messageListener = jest.fn();
      client.subscribe(messageListener);
      await client.connect(mockInstance);
    });
    
    it('should parse JSON messages with message type', () => {
      const message = {
        type: 'message',
        content: 'Hello World',
        username: 'Test User',
        timestamp: '2025-04-06T12:00:00Z'
      };
      
      mockWebSocket.simulateMessage(JSON.stringify(message));
      
      expect(messageListener).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Hello World',
        type: 'received',
        timestamp: expect.any(String),
        rawData: message
      }));
    });
    
    it('should handle non-message JSON types', () => {
      const updateMessage = {
        type: 'update',
        content: 'Item updated',
        id: '123'
      };
      
      mockWebSocket.simulateMessage(JSON.stringify(updateMessage));
      
      expect(messageListener).toHaveBeenCalledWith(expect.objectContaining({
        text: '[update] Item updated',
        type: 'received',
        rawData: updateMessage
      }));
    });
    
    it('should identify sent messages by "You sent:" prefix', () => {
      const sentMessage = {
        type: 'message',
        content: 'You sent: Hello!',
        username: 'Test User'
      };
      
      mockWebSocket.simulateMessage(JSON.stringify(sentMessage));
      
      expect(messageListener).toHaveBeenCalledWith(expect.objectContaining({
        text: 'You sent: Hello!',
        type: 'sent',
        rawData: sentMessage
      }));
    });
    
    it('should handle plain text messages', () => {
      mockWebSocket.simulateMessage('Plain text message');
      
      expect(messageListener).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Plain text message',
        type: 'received',
        rawData: 'Plain text message'
      }));
    });
    
    it('should handle JSON parse errors', () => {
      mockWebSocket.simulateMessage('{invalid json');
      
      expect(messageListener).toHaveBeenCalledWith(expect.objectContaining({
        text: '{invalid json',
        type: 'received',
        rawData: '{invalid json'
      }));
    });
  });
  
  describe('disconnect', () => {
    beforeEach(async () => {
      await client.connect(mockInstance);
    });
    
    it('should close WebSocket connection', () => {
      const result = client.disconnect();
      
      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(client.socket).toBeNull();
      expect(result).toBe(true);
    });
    
    it('should handle disconnect errors', () => {
      mockWebSocket.close.mockImplementation(() => {
        throw new Error('Close failed');
      });
      
      const result = client.disconnect();
      
      expect(result).toBe(false);
      expect(appInsights.trackException).toHaveBeenCalled();
    });
    
    it('should return false if no connection exists', () => {
      client.socket = null;
      
      const result = client.disconnect();
      
      expect(result).toBe(false);
    });
  });
  
  describe('status management', () => {
    it('should notify status listeners on connection status changes', async () => {
      const statusListener = jest.fn();
      client.subscribeToStatus(statusListener);
      
      // Initial notification
      expect(statusListener).toHaveBeenCalledWith('disconnected');
      
      // Connect
      await client.connect(mockInstance);
      mockWebSocket.simulateOpen();
      expect(statusListener).toHaveBeenCalledWith('connected');
      
      // Error
      mockWebSocket.simulateError(new Error('Test error'));
      expect(statusListener).toHaveBeenCalledWith('error');
      
      // Disconnect
      mockWebSocket.simulateClose();
      expect(statusListener).toHaveBeenCalledWith('disconnected');
    });
  });
  
  describe('subscription management', () => {
    it('should add and remove message listeners', () => {
      const listener = jest.fn();
      
      // Subscribe
      const unsubscribe = client.subscribe(listener);
      expect(client.listeners).toContain(listener);
      
      // Unsubscribe
      unsubscribe();
      expect(client.listeners).not.toContain(listener);
    });
    
    it('should add and remove status listeners', () => {
      const listener = jest.fn();
      
      // Subscribe
      const unsubscribe = client.subscribeToStatus(listener);
      expect(client.statusListeners).toContain(listener);
      
      // Unsubscribe
      unsubscribe();
      expect(client.statusListeners).not.toContain(listener);
    });
  });
});