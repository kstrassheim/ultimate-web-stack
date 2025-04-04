import { backendSocketUrl } from '@/config';
import appInsights from '@/log/appInsights';
// Existing imports and code...

// WebSocket API Service
let socket = null;
let messageListeners = [];
let statusListeners = [];
let connectionStatus = 'disconnected';

// Connect to the WebSocket server
export const connectWebSocket = (url = `${backendSocketUrl}/api/chat`) => {
  // Close existing connection if any
  if (socket) {
    socket.close();
  }

  try {
    appInsights.trackEvent({ name: 'WebSocket - Connect' });
    socket = new WebSocket(url);
    
    socket.onopen = () => {
      console.log("WebSocket connected");
      setStatus('connected');
    };
    
    socket.onmessage = (event) => {
      console.log("WebSocket message received:", event.data);
      const message = {
        text: event.data,
        type: event.data.includes('You sent:') ? 'sent' : 'received',
        timestamp: new Date().toLocaleTimeString()
      };
      
      // Notify all listeners about the new message
      messageListeners.forEach(listener => listener(message));
    };
    
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      appInsights.trackException({ error });
      setStatus('error');
    };
    
    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setStatus('disconnected');
    };
    
    return true;
  } catch (error) {
    appInsights.trackException({ error });
    console.error('WebSocket connection error:', error);
    setStatus('error');
    return false;
  }
};

// Update status and notify listeners
const setStatus = (status) => {
  connectionStatus = status;
  statusListeners.forEach(listener => listener(status));
};

// Get current connection status
export const getWebSocketStatus = () => connectionStatus;

// Send a message through the WebSocket
export const sendWebSocketMessage = (message) => {
  if (socket && connectionStatus === 'connected') {
    try {
      socket.send(message);
      return true;
    } catch (error) {
      appInsights.trackException({ error });
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }
  return false;
};

// Disconnect WebSocket
export const disconnectWebSocket = () => {
  if (socket) {
    try {
      socket.close();
      socket = null;
      return true;
    } catch (error) {
      appInsights.trackException({ error });
      console.error('Error disconnecting WebSocket:', error);
      return false;
    }
  }
  return false;
};

// Subscribe to messages
export const subscribeToMessages = (callback) => {
  messageListeners.push(callback);
  return () => {
    messageListeners = messageListeners.filter(listener => listener !== callback);
  };
};

// Subscribe to status changes
export const subscribeToStatus = (callback) => {
  statusListeners.push(callback);
  // Immediately notify with current status
  callback(connectionStatus);
  return () => {
    statusListeners = statusListeners.filter(listener => listener !== callback);
  };
};