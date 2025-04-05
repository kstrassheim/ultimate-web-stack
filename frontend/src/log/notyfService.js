import { Notyf } from 'notyf';
import 'notyf/notyf.min.css'; // Import the CSS

// Create a Notyf instance with custom options
const notyf = new Notyf({
  duration: 1000,
  position: { x: 'right', y: 'bottom' },
  types: [
    {
      type: 'success',
      background: '#28a745',
      icon: {
        className: 'notyf__icon--success',
        tagName: 'i'
      }
    },
    {
      type: 'error',
      background: '#dc3545',
      icon: {
        className: 'notyf__icon--error',
        tagName: 'i'
      }
    },
    {
      type: 'warning',
      background: '#ffc107',
      icon: false
    },
    {
      type: 'info',
      background: '#17a2b8',
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