import React, { useEffect, useState } from 'react';

const Loading = ({ visible, message = "Loading data..." }) => {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    // Only run the animation logic if visible
    if (!visible) return;
    
    let animationFrame;
    let startTime;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      // Full rotation every second (360 degrees per 1000ms)
      const newRotation = ((progress / 1000) * 360) % 360;
      setRotation(newRotation);
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [visible]);

  // Early return if not visible
  if (!visible) return null;
  
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  };

  const contentStyle = {
    backgroundColor: 'white',
    padding: '30px 50px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  };

  const spinnerStyle = {
    width: '40px',
    height: '40px',
    border: '6px solid #ccc',
    borderTop: '6px solid #0078d4',
    borderRadius: '50%',
    marginBottom: '20px',
    transform: `rotate(${rotation}deg)`,
    transition: 'transform 0.1s linear',
  };

  const textStyle = { 
    marginTop: '15px', 
    color: '#333',
    fontSize: '16px'
  };

  return (
    <div style={overlayStyle} data-testid="loading-overlay">
      <div style={contentStyle} data-testid="loading-content">
        <div style={spinnerStyle} data-testid="loading-spinner" />
        <p style={textStyle} data-testid="loading-message">{message}</p>
      </div>
    </div>
  );
};

export default Loading;

// Sleep utility function
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));