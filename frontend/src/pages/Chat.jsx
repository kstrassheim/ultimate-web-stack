import { useEffect, useState, useRef } from 'react';
import './Chat.css';
import { 
  connectWebSocket, 
  sendWebSocketMessage, 
  disconnectWebSocket,
  subscribeToMessages,
  subscribeToStatus
} from '@/api/socket';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket when component mounts
    connectWebSocket();
    
    // Subscribe to incoming messages
    const unsubscribeMessages = subscribeToMessages((message) => {
      setMessages(prevMessages => [...prevMessages, message]);
    });
    
    // Subscribe to connection status changes
    const unsubscribeStatus = subscribeToStatus((status) => {
      setConnectionStatus(status);
      if (status === 'error') {
        setError("Failed to connect to chat server");
      } else {
        setError(null);
      }
    });
    
    // Clean up on unmount
    return () => {
      unsubscribeMessages();
      unsubscribeStatus();
      disconnectWebSocket();
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = () => {
    if (inputMessage.trim() && connectionStatus === 'connected') {
      sendWebSocketMessage(inputMessage);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div className="chat-container" data-testid="websocket-demo">
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
              <span className="text">{msg.text}</span>
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
          disabled={connectionStatus !== 'connected' || !inputMessage.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;