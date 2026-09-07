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

  // Regression tests for issue #84 — Send button must be disabled while a
  // message is in flight and released once the request settles, so a
  // double-click cannot post the same message twice.

  test('disables the Send button once a send is in flight', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    // A send that hasn't settled yet — never resolves, so the guard
    // stays held. This mirrors the real flow where the server acks
    // asynchronously after the send call returns.
    let releaseSend;
    mockWebSocketClientInstance.send.mockImplementation(() =>
      new Promise((resolve) => { releaseSend = resolve; })
    );
    
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'In flight message' } });
    });
    
    expect(sendButton).not.toBeDisabled();
    
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    // Button is disabled while the request is in flight, even though
    // the input still has text (the input hasn't been cleared yet on
    // a pending send that returned a Promise).
    expect(sendButton).toBeDisabled();
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledWith('In flight message');
    
    // Sanity — release the dangling Promise so jest doesn't warn.
    if (releaseSend) releaseSend();
  });

  test('a synchronous double-click only sends once', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Double-click victim' } });
    });
    
    // Both clicks fire BEFORE React commits the disabled state, so the
    // input closure in sendMessage still has 'Double-click victim' for
    // both invocations. The ref guard is the only thing that prevents
    // a duplicate post (issue #84).
    await act(async () => {
      fireEvent.click(sendButton);
      fireEvent.click(sendButton);
    });
    
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledTimes(1);
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledWith('Double-click victim');
  });

  test('a server "sent" ack re-enables the Send button', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'First message' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    expect(sendButton).toBeDisabled();
    
    // Simulate the server's "You sent: <text>" ack the WebSocketClient
    // tags with type === 'sent'. This is the success-settle signal.
    await act(async () => {
      mockMessageCallback({
        text: 'You sent: First message',
        type: 'sent',
        timestamp: '12:00:00 PM'
      });
    });
    
    // Input was cleared after the synchronous send, so without new
    // text the button stays disabled by the empty-input condition. Type
    // a follow-up to verify the guard — not the input — has been
    // released.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Second message' } });
    });
    
    expect(sendButton).not.toBeDisabled();
  });

  test('a connection error during a pending send re-enables the Send button', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    // Hold the send open so the guard stays up until we drop the status.
    mockWebSocketClientInstance.send.mockImplementation(() => false);
    
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Will fail' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    // Synchronous send returned false → guard released right away.
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledWith('Will fail');
    
    // With non-empty input the button is enabled again — the user can
    // retry without a refresh, per the issue's acceptance criterion #2.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Retry after failure' } });
    });
    expect(sendButton).not.toBeDisabled();
  });

  test('a connection drop while a send is pending re-enables the Send button', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    // Send returns truthy (queued) and never resolves, mirroring the
    // "server hasn't acked yet" window. The guard must then release
    // when the status drops to 'error'.
    let neverResolve;
    mockWebSocketClientInstance.send.mockImplementation(
      () => new Promise(() => { neverResolve = true; })
    );
    
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Send then drop' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    expect(sendButton).toBeDisabled();
    
    // Connection dies before the server acks — the ack will never
    // arrive, so the status handler must release the guard.
    await act(async () => {
      mockStatusCallback('error');
    });
    
    // Bring the connection back up so the only thing keeping the
    // button disabled would be a stuck isSending guard.
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Retry after drop' } });
    });
    expect(sendButton).not.toBeDisabled();
    
    // Suppress the dangling-Promise jest warning.
    void neverResolve;
  });

  test('sequential sends each fire their own send call', async () => {
    const mockWebSocketClientInstance = WebSocketClient.mock.results[0].value;
    
    await act(async () => {
      mockStatusCallback('connected');
    });
    
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // First send → ack → second send. Issue #84 acceptance criterion #3:
    // the guard must be per-request, not a one-shot.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'one' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    await act(async () => {
      mockMessageCallback({
        text: 'You sent: one',
        type: 'sent',
        timestamp: '12:00:00 PM'
      });
    });
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'two' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    expect(mockWebSocketClientInstance.send).toHaveBeenCalledTimes(2);
    expect(mockWebSocketClientInstance.send).toHaveBeenNthCalledWith(1, 'one');
    expect(mockWebSocketClientInstance.send).toHaveBeenNthCalledWith(2, 'two');
  });
});
describe('Chat Component — failure and edge paths', () => {
  test('surfaces a configuration error when the socket client has no subscribe method', async () => {
    // The mount effect must fail loudly (console + visible error) rather
    // than crashing when the client object doesn't match the expected
    // interface — this is the guard that catches a socket.js refactor
    // that drops both subscribe and subscribeToMessages.
    cleanup();
    jest.clearAllMocks();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    WebSocketClient.mockImplementationOnce(() => ({
      connect: jest.fn().mockResolvedValue(true),
      // Deliberately no subscribe / subscribeToMessages.
      subscribeToStatus: jest.fn().mockImplementation((cb) => { cb('disconnected'); return jest.fn(); }),
      send: jest.fn(),
      disconnect: jest.fn(),
      getStatus: jest.fn().mockReturnValue('disconnected')
    }));

    render(<Chat />);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'WebSocketClient is missing subscribe/subscribeToMessages method'
    );
    await waitFor(() => {
      expect(document.querySelector('.error-message')).toHaveTextContent(
        'WebSocket client configuration error'
      );
    });
    consoleErrorSpy.mockRestore();
  });

  test('reuses the existing WebSocketClient when the effect re-runs with a new instance identity', async () => {
    // The client is created once per mount; a later effect re-run (here:
    // the msal instance object identity changes) must reconnect the
    // EXISTING client, not construct a second one.
    cleanup();
    jest.clearAllMocks();

    const configuredMsal = useMsal();
    const { rerender } = render(<Chat />);
    const clientInstance = WebSocketClient.mock.results[0].value;
    expect(WebSocketClient).toHaveBeenCalledTimes(1);
    clientInstance.connect.mockClear();

    try {
      useMsal.mockReturnValue({
        instance: { name: 'recreated-msal-instance' },
        accounts: [],
        inProgress: 'none'
      });
      rerender(<Chat />);

      expect(WebSocketClient).toHaveBeenCalledTimes(1);
      expect(clientInstance.connect).toHaveBeenCalledTimes(1);
      expect(clientInstance.connect).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'recreated-msal-instance' })
      );
    } finally {
      useMsal.mockReturnValue(configuredMsal);
    }
  });

  test('a synchronous throw from send() releases the in-flight guard and keeps the draft', async () => {
    render(<Chat />);
    const clientInstance = WebSocketClient.mock.results[0].value;
    clientInstance.send.mockImplementation(() => {
      throw new Error('socket is half-closed');
    });

    await act(async () => {
      WebSocketClient.getStatusCallback()('connected');
    });

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'unsent draft' } });
    });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(clientInstance.send).toHaveBeenCalledWith('unsent draft');
    // The send never went out, so the draft must survive for a retry...
    expect(input.value).toBe('unsent draft');
    // ...and the guard must have been released so the retry is possible.
    expect(sendButton).not.toBeDisabled();
  });

  test('pressing Enter with a whitespace-only draft does not send', async () => {
    render(<Chat />);
    const clientInstance = WebSocketClient.mock.results[0].value;

    await act(async () => {
      WebSocketClient.getStatusCallback()('connected');
    });

    const input = screen.getByPlaceholderText('Type a message...');
    await act(async () => {
      fireEvent.change(input, { target: { value: '   ' } });
    });
    await act(async () => {
      fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    });

    expect(clientInstance.send).not.toHaveBeenCalled();
  });

  test('pressing a non-Enter key does not send', async () => {
    render(<Chat />);
    const clientInstance = WebSocketClient.mock.results[0].value;

    await act(async () => {
      WebSocketClient.getStatusCallback()('connected');
    });

    const input = screen.getByPlaceholderText('Type a message...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'a real message' } });
    });
    await act(async () => {
      fireEvent.keyPress(input, { key: 'a', code: 'KeyA', charCode: 97 });
    });

    expect(clientInstance.send).not.toHaveBeenCalled();
  });
});
