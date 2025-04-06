import React from 'react';
import { Spinner, Modal } from 'react-bootstrap';

/**
 * Loading component that displays a centered spinner overlay
 * 
 * @param {Object} props Component props
 * @param {boolean} props.visible Whether the loading overlay is visible
 * @param {string} props.message Message to display below the spinner
 * @param {string} props.variant Bootstrap spinner variant (primary, secondary, etc.)
 * @param {string} props.size Size of the spinner (sm or lg)
 * @param {string} props.animation Animation type (border or grow)
 * @returns {JSX.Element|null} Loading component or null if not visible
 */
const Loading = ({ 
  visible, 
  message = "Loading data...", 
  variant = "primary",
  size = "",
  animation = "border"
}) => {
  // Early return if not visible
  if (!visible) return null;
  
  return (
    <Modal
      show={visible}
      centered
      backdrop="static"
      keyboard={false}
      data-testid="loading-overlay"
      aria-labelledby="loading-modal"
      className="loading-overlay"
    >
      <Modal.Body className="text-center p-4" data-testid="loading-content">
        <div className="d-flex flex-column align-items-center">
          <Spinner
            animation={animation}
            variant={variant}
            size={size}
            role="status"
            data-testid="loading-spinner"
            className="mb-3"
          >
            <span className="visually-hidden">Loading...</span>
          </Spinner>
          <p 
            className="mt-2 text-dark" 
            data-testid="loading-message"
          >
            {message}
          </p>
        </div>
      </Modal.Body>
    </Modal>
  );
};

// For testing, provide a simplified sleep utility
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default Loading;