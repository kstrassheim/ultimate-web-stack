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
  const messagesEndRef = useRef(null);
  const socketClientRef = useRef(null);

  useEffect(() => {
    // Create WebSocket client instance
    if (!socketClientRef.current) {
      socketClientRef.current = new WebSocketClient('/chat');
    }
    const socketClient = socketClientRef.current;

    // Connect to WebSocket when component mounts
    socketClient.connect(instance);
    
    // Subscribe to messages and status updates
    const unsubscribeMessages = socketClient.subscribeToMessages((message) => {
      setMessages(prevMessages => [...prevMessages, message]);
    });
    
    const unsubscribeStatus = socketClient.subscribeToStatus((status) => {
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
    if (inputMessage.trim() && connectionStatus === 'connected') {
      socketClientRef.current.sendMessage(inputMessage);
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