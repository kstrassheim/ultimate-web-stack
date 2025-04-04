import { backendSocketUrl } from '@/config';
import { retreiveTokenForBackend } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';

export class WebSocketClient {
  constructor(path = '/chat') {
    this.path = path;
    this.socket = null;
    this.messageListeners = [];
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
      const token = await retreiveTokenForBackend(instance);
      
      // Form the complete URL from backendSocketUrl and the path
      const url = `${backendSocketUrl}/api${this.path}`;
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
        const message = {
          text: event.data,
          type: event.data.includes('You sent:') ? 'sent' : 'received',
          timestamp: new Date().toLocaleTimeString()
        };
        
        // Notify all listeners about the new message
        this.messageListeners.forEach(listener => listener(message));
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

  sendMessage(message) {
    if (this.socket && this.connectionStatus === 'connected') {
      try {
        this.socket.send(message);
        return true;
      } catch (error) {
        appInsights.trackException({ error });
        console.error('Error sending WebSocket message:', error);
        return false;
      }
    }
    return false;
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

  subscribeToMessages(callback) {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter(listener => listener !== callback);
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