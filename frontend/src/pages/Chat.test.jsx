import React, { act } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import Chat from './Chat';
import { useMsal } from '@azure/msal-react';

// Mock the WebSocketClient class
jest.mock('@/api/socket', () => {
  // Variables to store callback functions
  let messageCallback = null;
  let statusCallback = null;

  // Create a mock implementation that matches the current WebSocketClient interface
  const MockWebSocketClient = jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(true),
    // Match the renamed methods and structure
    subscribe: jest.fn().mockImplementation((callback) => {
      messageCallback = callback;
      return jest.fn(); // Return unsubscribe function
    }),
    subscribeToStatus: jest.fn().mockImplementation((callback) => {
      statusCallback = callback;
      callback('disconnected'); // Initial state
      return jest.fn(); // Return unsubscribe function
    }),
    send: jest.fn(),
    disconnect: jest.fn(),
    getStatus: jest.fn().mockReturnValue('disconnected')
  }));

  // Expose the callbacks for testing
  MockWebSocketClient.getMessageCallback = () => messageCallback;
  MockWebSocketClient.getStatusCallback = () => statusCallback;

  return {
    WebSocketClient: MockWebSocketClient
  };
});

// Import the mock to access the callbacks
import { WebSocketClient } from '@/api/socket';

// Variables to store callback functions
let mockMessageCallback;
let mockStatusCallback;

beforeAll(() => {
  // Mock scrollIntoView since jsdom doesn't support it
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

describe('Chat Component', () => {
  const { instance: mockMsalInstance } = useMsal();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Render the component in beforeEach to ensure a fresh start
    render(<Chat />);
    
    // Get the callbacks after render
    mockMessageCallback = WebSocketClient.getMessageCallback();
    mockStatusCallback = WebSocketClient.getStatusCallback();
  });

  test('renders chat interface correctly', () => {
    // UI elements should be present
    expect(screen.getByText('Live Chat')).toBeInTheDocument();
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    expect(screen.getByText('No messages yet. Start chatting!')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  test('connects to WebSocket and updates status on mount', async () => {
    // Verify WebSocketClient was initialized with correct path
    expect(WebSocketClient).toHaveBeenCalledWith('api/chat');
    
    // Verify connect was called with the MSAL instance
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    expect(mockWebSocketClientInstance.connect).toHaveBeenCalledWith(mockMsalInstance);
    
    // Use act to trigger the status change
    await act(async () => {
      // Set status to 'connected'
      mockStatusCallback('connected');
    });
    
    // Check that status is updated in the UI
    expect(screen.getByText('Connected')).toBeInTheDocument();
    
    // Input should be enabled when connected
    expect(screen.getByPlaceholderText('Type a message...')).not.toBeDisabled();
  });

  test('handles WebSocket error state', async () => {
    // Use act to trigger the status change
    await act(async () => {
      // Set status to 'error'
      mockStatusCallback('error');
    });
    
    // Check that error status is shown
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to connect to chat server')).toBeInTheDocument();
  });

  test('sends message when send button is clicked', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    // Set connected status to enable input
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    // Get input and button
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Type a message
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Hello, World!' } });
    });
    
    // Button should now be enabled
    expect(sendButton).not.toBeDisabled();
    
    // Click send button
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    // Verify message was sent through the WebSocketClient
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledWith('Hello, World!');
    
    // Input should be cleared after sending
    expect(input.value).toBe('');
  });

  test('sends message when Enter key is pressed', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    // Set connected status
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    // Get input
    const input = screen.getByPlaceholderText('Type a message...');
    
    // Type a message
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Hello via Enter key!' } });
    });
    
    // Press Enter
    await act(async () => {
      fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    });
    
    // Verify message was sent
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledWith('Hello via Enter key!');
  });

  test('displays received messages with username', async () => {
    // Create a test message with the expected structure
    const testMessage = {
      text: 'Hello from server!',
      type: 'received',
      timestamp: '12:00:00 PM',
      username: 'TestUser',
      rawData: {
        content: 'Hello from server!',
        username: 'TestUser',
        type: 'message'
      }
    };
    
    // Set connected status
    await act(async () => {
      // First set connected status
      mockStatusCallback('connected');
      // Then trigger message
      mockMessageCallback(testMessage);
    });
    
    // Check that the message is displayed
    expect(screen.getByText('Hello from server!')).toBeInTheDocument();
    
    // Check username is displayed
    expect(screen.getByText('TestUser')).toBeInTheDocument();
    
    // Check timestamp is displayed
    expect(screen.getByText('12:00:00 PM')).toBeInTheDocument();
  });

  test('displays sent messages', async () => {
    // Create a test message for sent messages
    const testMessage = {
      text: 'You sent: Test message',
      type: 'sent',
      timestamp: '12:05:00 PM',
      rawData: {
        content: 'You sent: Test message',
        type: 'message'
      }
    };
    
    // Set connected status and send message
    await act(async () => {
      mockStatusCallback('connected');
      mockMessageCallback(testMessage);
    });
    
    // Check that the message is displayed
    expect(screen.getByText('You sent: Test message')).toBeInTheDocument();
  });

  test('disconnects WebSocket when unmounting', () => {
    // Cleanup any existing component from beforeEach
    cleanup();
    
    // Reset all mocks to ensure clean state
    jest.clearAllMocks();
    
    // Create a fresh render - with destructured unmount
    const { unmount } = render(<Chat />);
    
    // Get the WebSocketClient instance AFTER creating our new render
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    // Clear any previous mock calls
    mockWebSocketClientInstance.disconnect.mockClear();
    
    // Unmount the component
    act(() => {
      unmount();
    });
    
    // Verify disconnect was called
    expect(mockWebSocketClientInstance.disconnect).toHaveBeenCalled();
  });

  test('disables input and button when disconnected', async () => {
    // Set disconnected status (should be the default anyway)
    await act(async () => {
      mockStatusCallback('disconnected');
    });
    
    // Input and button should be disabled
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});