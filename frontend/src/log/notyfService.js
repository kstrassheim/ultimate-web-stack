import { Notyf } from 'notyf';
import 'notyf/notyf.min.css'; // Import the CSS

// Create a Notyf instance with custom options
const notyf = new Notyf({
  duration: 1000,
  position: { x: 'right', y: 'bottom' },
  types: [
    {
      type: 'success',
      background: 'rgba(40, 167, 69, 0.9)', // Added 0.8 alpha for transparency
      icon: {
        className: 'notyf__icon--success',
        tagName: 'i'
      }
    },
    {
      type: 'error',
      background: 'rgba(220, 53, 69, 0.9)', // Added 0.8 alpha for transparency
      icon: {
        className: 'notyf__icon--error',
        tagName: 'i'
      }
    },
    {
      type: 'warning',
      background: 'rgba(255, 193, 7, 0.9)', // Added 0.8 alpha for transparency
      icon: false
    },
    {
      type: 'info',
      background: 'rgba(23, 162, 184, 0.9)', // Added 0.8 alpha for transparency
      icon: false
    }
  ]
});

// Export a service object with wrapper methods
const notyfService = {
  success: (message) => notyf.success(message),
  error: (message) => notyf.error(message),
  warning: (message) => notyf.open({
    type: 'warning',
    message
  }),
  info: (message) => notyf.open({
    type: 'info',
    message
  }),
  // Dismiss a specific notification
  dismiss: (notification) => notyf.dismiss(notification),
  // Dismiss all notifications
  dismissAll: () => notyf.dismissAll()
};

export default notyfService;