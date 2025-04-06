import { backendSocketUrl } from '@/config';
import { retrieveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';

export class WebSocketClient {
  constructor(path) {
    this.path = path;
    this.socket = null;
    this.listeners = [];
    this.statusListeners = [];
    this.connectionStatus = 'disconnected';
  }

  async connect(instance) {
    // Close existing connection if any
    if (this.socket) {
      this.disconnect();
    }

    try {
      appInsights.trackEvent({ name: 'WebSocket - Connect' });
      
      // Get the auth token
      const token = await retrieveTokenForBackend(instance);
      
      // Form the complete URL from backendSocketUrl and the path
      const url = `${backendSocketUrl}/${this.path}`;
      this.socket = new WebSocket(url);
      
      this.socket.onopen = () => {
        console.log("WebSocket connected");
        
        // Send authentication immediately after connection
        if (this.socket.readyState === WebSocket.OPEN) {
          console.log("WebSocket opened, sending authentication");
          this.socket.send(JSON.stringify({
            type: 'authenticate',
            token: token
          }));
          this.setStatus('connected');
        }
      };
      
      this.socket.onmessage = (event) => {
        console.log("WebSocket message received:", event.data);
        try {
          // Try to parse as JSON first
          let jsonData;
          let messageType = 'received';
          let messageText = '';
          
          try {
            jsonData = JSON.parse(event.data);
            
            // Handle structured message with type property
            if (jsonData.type === 'message') {
              messageText = jsonData.content || JSON.stringify(jsonData);
            } else {
              // For other types (create, update, delete)
              messageText = `[${jsonData.type}] ${jsonData.content || JSON.stringify(jsonData)}`;
            }
            
            // Determine if this is a sent message acknowledgment
            if (messageText.includes('You sent:')) {
              messageType = 'sent';
            }
          } catch (e) {
            // Not valid JSON, treat as plain text
            messageText = event.data;
            // Check for "You sent:" prefix to determine if it's a sent message confirmation
            if (messageText.includes('You sent:')) {
              messageType = 'sent';
            }
          }
          
          const message = {
            text: messageText,
            type: messageType,
            timestamp: new Date().toLocaleTimeString(),
            rawData: jsonData || event.data
          };
          
          // Notify all listeners about the new message
          this.listeners.forEach(listener => listener(message));
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
          appInsights.trackException({ error });
        }
      };
      
      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        appInsights.trackException({ error });
        this.setStatus('error');
      };
      
      this.socket.onclose = () => {
        console.log("WebSocket disconnected");
        this.setStatus('disconnected');
      };
      
      return true;
    } catch (error) {
      appInsights.trackException({ error });
      console.error('WebSocket connection error:', error);
      this.setStatus('error');
      return false;
    }
  }

  setStatus(status) {
    this.connectionStatus = status;
    this.statusListeners.forEach(listener => listener(status));
  }

  getStatus() {
    return this.connectionStatus;
  }

  send(data) {
    if (!this.socket || this.connectionStatus !== 'connected') {
      return false;
    }
    
    try {
      // Handle different message types
      if (typeof data === 'string') {
        // Simple string message - send as is
        this.socket.send(data);
      } else if (typeof data === 'object') {
        // Object message - convert to JSON with type if not specified
        const dataToSend = {
          ...data,
          type: data.type || 'message' // Default to 'message' type
        };
        this.socket.send(JSON.stringify(dataToSend));
      } else {
        // Convert other types to string
        this.socket.send(String(data));
      }
      return true;
    } catch (error) {
      appInsights.trackException({ error });
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.close();
        this.socket = null;
        return true;
      } catch (error) {
        appInsights.trackException({ error });
        console.error('Error disconnecting WebSocket:', error);
        return false;
      }
    }
    return false;
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  subscribeToStatus(callback) {
    this.statusListeners.push(callback);
    // Immediately notify with current status
    callback(this.connectionStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter(listener => listener !== callback);
    };
  }
}