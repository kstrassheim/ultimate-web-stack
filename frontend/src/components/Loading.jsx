import React, { useEffect, useState } from 'react';

const Loading = ({ visible, message = "Loading data..." }) => {
  // Always declare hooks at the top level, before any conditionals
  const [rotation, setRotation] = useState(0);
  
  useEffect(() => {
    // Only run the animation logic if component is visible
    if (!visible) return;
    
    let animationFrame;
    let startTime;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      
      // Full rotation every second (360 degrees per 1000ms)
      const newRotation = (progress / 1000 * 360) % 360;
      setRotation(newRotation);
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [visible]); // Add visible as dependency
  
  // Early return after hooks are declared
  if (!visible) return null;
  
  // Styles remain unchanged
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
    zIndex: 9999
  };

  const contentStyle = {
    backgroundColor: 'white',
    padding: '30px 50px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  };

  const spinnerStyle = {
    width: '50px',
    height: '50px',
    border: '5px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '50%',
    borderTopColor: '#4f46e5',
    transform: `rotate(${rotation}deg)`
  };

  const textStyle = { 
    marginTop: '15px', 
    color: '#333',
    fontSize: '16px'
  };

  return (
    <div style={overlayStyle}>
      <div style={contentStyle}>
        <div style={spinnerStyle} />
        <p style={textStyle}>{message}</p>
      </div>
    </div>
  );
};

export default Loading;

// Sleep utility function
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));