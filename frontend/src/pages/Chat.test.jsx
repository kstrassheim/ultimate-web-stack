import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Chat from './Chat';
import { useMsal } from '@azure/msal-react';
import { WebSocketClient } from '@/api/socket';

// Mock the WebSocketClient
jest.mock('@/api/socket', () => {
  return {
    WebSocketClient: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn().mockReturnValue(true),
      subscribeToMessages: jest.fn().mockImplementation(callback => {
        // Store the callback for later use in tests
        mockMessageCallback = callback;
        return jest.fn(); // Unsubscribe function
      }),
      subscribeToStatus: jest.fn().mockImplementation(callback => {
        // Store the callback for later use in tests
        mockStatusCallback = callback;
        return jest.fn(); // Unsubscribe function
      }),
      getStatus: jest.fn().mockReturnValue('disconnected')
    }))
  };
});

// Variables to store callback functions passed to the WebSocketClient
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
    // Reset the callback variables
    mockMessageCallback = null;
    mockStatusCallback = null;
  });

  test('renders chat interface correctly', () => {
    render(<Chat />);
    
    // Check basic UI elements
    expect(screen.getByText('Live Chat')).toBeInTheDocument();
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    expect(screen.getByText('No messages yet. Start chatting!')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  test('connects to WebSocket and updates status on mount', async () => {
    render(<Chat />);
    
    // Verify WebSocketClient was initialized
    expect(WebSocketClient).toHaveBeenCalledWith('api/chat');
    
    // Verify connect was called with the MSAL instance
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    expect(mockWebSocketClientInstance.connect).toHaveBeenCalledWith(mockMsalInstance);
    
    // Simulate WebSocket connection success by calling the stored status callback
    act(() => {
      mockStatusCallback('connected');
    });
    
    // Check that status is updated in the UI
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
    
    // Input should be enabled when connected
    expect(screen.getByPlaceholderText('Type a message...')).not.toBeDisabled();
  });

  test('handles WebSocket error state', async () => {
    render(<Chat />);
    
    // Simulate WebSocket error by calling the stored status callback
    act(() => {
      mockStatusCallback('error');
    });
    
    // Check that error status is shown
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to connect to chat server')).toBeInTheDocument();
    });
  });

  test('sends message when send button is clicked', async () => {
    render(<Chat />);
    
    // Simulate connection
    act(() => {
      mockStatusCallback('connected');
    });
    
    // Get input and button
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Enable and check button state
    await waitFor(() => {
      expect(sendButton).toBeDisabled(); // Button should be disabled with empty input
    });
    
    // Type a message
    fireEvent.change(input, { target: { value: 'Hello, World!' } });
    
    // Button should now be enabled
    expect(sendButton).not.toBeDisabled();
    
    // Click send button
    fireEvent.click(sendButton);
    
    // Verify message was sent through the WebSocketClient
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    expect(mockWebSocketClientInstance.sendMessage).toHaveBeenCalledWith('Hello, World!');
    
    // Input should be cleared after sending
    expect(input.value).toBe('');
  });

  test('sends message when Enter key is pressed', async () => {
    render(<Chat />);
    
    // Simulate connection
    act(() => {
      mockStatusCallback('connected');
    });
    
    // Get input
    const input = screen.getByPlaceholderText('Type a message...');
    
    // Type a message
    fireEvent.change(input, { target: { value: 'Hello via Enter key!' } });
    
    // Press Enter
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    // Verify message was sent
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    expect(mockWebSocketClientInstance.sendMessage).toHaveBeenCalledWith('Hello via Enter key!');
  });

  test('displays received messages', async () => {
    render(<Chat />);
    
    // Simulate receiving messages by calling the stored message callback
    act(() => {
      mockStatusCallback('connected');
      mockMessageCallback({
        text: 'Hello from server!',
        type: 'received',
        timestamp: '12:00:00 PM'
      });
    });
    
    // Check that the message is displayed
    await waitFor(() => {
      expect(screen.getByText('Hello from server!')).toBeInTheDocument();
    });
    
    // Check that timestamp is displayed
    expect(screen.getByText('12:00:00 PM')).toBeInTheDocument();
    
    // No more "no messages" placeholder
    expect(screen.queryByText('No messages yet. Start chatting!')).not.toBeInTheDocument();
  });

  test('displays sent messages', async () => {
    render(<Chat />);
    
    // Simulate connection and receiving a "sent" message
    act(() => {
      mockStatusCallback('connected');
      mockMessageCallback({
        text: 'You sent: Test message',
        type: 'sent',
        timestamp: '12:05:00 PM'
      });
    });
    
    // Check that the message is displayed
    await waitFor(() => {
      expect(screen.getByText('You sent: Test message')).toBeInTheDocument();
    });
  });

  test('disconnects WebSocket when unmounting', () => {
    const { unmount } = render(<Chat />);
    
    unmount();
    
    // Verify disconnect was called
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    expect(mockWebSocketClientInstance.disconnect).toHaveBeenCalled();
  });

  test('disables input and button when disconnected', async () => {
    render(<Chat />);
    
    // Initially disconnected
    act(() => {
      mockStatusCallback('disconnected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Input and button should be disabled
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
    
    // Type something to make sure button stays disabled
    fireEvent.change(input, { target: { value: 'This should not work' } });
    expect(sendButton).toBeDisabled();
  });
});