import { useEffect, useState, useRef } from 'react';
import './Chat.css';
import { useMsal } from '@azure/msal-react';
import { WebSocketClient } from '@/api/socket';

const Chat = () => {
  const { instance } = useMsal();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  // Tracks whether a send is awaiting server acknowledgement. The Send
  // button is disabled while this is set; the ref mirror blocks the
  // double-click race before React renders the disabled state (see #84).
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const socketClientRef = useRef(null);
  const isSendingRef = useRef(false);


  // Parse message content to avoid duplicated usernames
  const parseMessageContent = (messageText, username) => {
    if (!messageText) return messageText;
    
    // Check for explicit "username: " pattern at beginning
    const colonIndex = messageText.indexOf(': ');
    if (colonIndex > 0) {
      const potentialUsername = messageText.substring(0, colonIndex);
      if (username && potentialUsername === username) {
        return messageText.substring(colonIndex + 2);
      }
    }
    
    return messageText;
  };

  // Release the in-flight guard. Called when the request settles —
  // either the server acks the send (success) or the connection drops
  // / the local send reports failure.
  const clearInFlight = () => {
    isSendingRef.current = false;
    setIsSending(false);
  };

  useEffect(() => {
    // Create WebSocket client instance
    if (!socketClientRef.current) {
      socketClientRef.current = new WebSocketClient('api/chat');
    }
    const socketClient = socketClientRef.current;

    // Connect to WebSocket when component mounts
    socketClient.connect(instance);
    
    // Subscribe to messages and status updates
    // Use subscribeToMessages if it exists, otherwise fall back to subscribe
    const messageMethod = socketClient.subscribeToMessages || socketClient.subscribe;
    if (typeof messageMethod !== 'function') {
      console.error('WebSocketClient is missing subscribe/subscribeToMessages method');
      setError('WebSocket client configuration error');
      return;
    }
    
    const unsubscribe = messageMethod.call(socketClient, (message) => {
      // The server echoes "You sent: <text>" via send_personal_message
      // after accepting a message. The WebSocketClient tags the frame
      // with type === 'sent' (see socket.js onmessage), which is the
      // success signal that the request has settled — release the guard
      // so the next send is allowed.
      if (isSendingRef.current && message && message.type === 'sent') {
        clearInFlight();
      }
      setMessages(prevMessages => [...prevMessages, message]);
    });
    
    const unsubscribeStatus = socketClient.subscribeToStatus((status) => {
      setConnectionStatus(status);
      if (status === 'error' || status === 'disconnected') {
        // A pending ack cannot arrive once the connection is gone, and
        // a fresh send would have been blocked by the guard anyway.
        // Releasing here covers the failure path required by #84 (a
        // failed request must re-enable the button so the user can
        // retry without a refresh).
        if (isSendingRef.current) {
          clearInFlight();
        }
      }
      if (status === 'error') {
        setError("Failed to connect to chat server");
      } else {
        setError(null);
      }
    });
    
    // Clean up on unmount
    return () => {
      unsubscribe();
      unsubscribeStatus();
      socketClient.disconnect();
    };
  }, [instance]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = () => {
    // Synchronous guard against the double-click race: React batches
    // state updates, so the disabled-button render lags the second
    // click. This ref mirror blocks the second invocation before the
    // render commits (issue #84).
    if (isSendingRef.current) return;
    if (!inputMessage.trim() || connectionStatus !== 'connected') return;
    
    isSendingRef.current = true;
    setIsSending(true);
    
    let ok;
    try {
      ok = socketClientRef.current.send(inputMessage);
    } catch (e) {
      // WebSocket.send can throw synchronously on a half-closed socket;
      // treat that as a send failure so the user can retry.
      clearInFlight();
      return;
    }
    
    setInputMessage('');
    
    if (ok === false) {
      // WebSocketClient.send() returns false when there is no live socket
      // (e.g. the connection dropped between the status check and the
      // send call). The request has already failed — release the guard
      // immediately rather than waiting for an ack that will never come.
      clearInFlight();
    }
    // Success path: the guard stays held until either (a) the server
    // acks via the "You sent:" message handled in the subscription
    // above, or (b) the connection drops/errors and the status
    // subscription releases the guard.
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div className="chat-container" data-testid="chat-page">
      <h2>Live Chat</h2>
      
      <div className="status-indicator">
        Status: 
        <span className={`status-${connectionStatus}`}>
          {connectionStatus === 'connected' ? 'Connected' : 
           connectionStatus === 'disconnected' ? 'Disconnected' : 'Error'}
        </span>
        {error && <div className="error-message">{error}</div>}
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-messages">No messages yet. Start chatting!</div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.type}`}>
              <span className="timestamp">{msg.timestamp}</span>
              {msg.username && <span className="username">{msg.username}</span>}
              <span className="text">{msg.parsedText || msg.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={connectionStatus !== 'connected'}
        />
        <button 
          onClick={sendMessage}
          disabled={connectionStatus !== 'connected' || !inputMessage.trim() || isSending}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;