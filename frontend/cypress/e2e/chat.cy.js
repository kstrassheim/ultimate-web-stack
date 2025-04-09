describe('Chat Page Functionality', () => {
  
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
    // Start with a fresh visit and log in
    cy.visit('/');
    cy.setMockRole('User');
    
    // Click sign-in and wait for authentication to complete
    cy.get('[data-testid="sign-in-button"]').click();
    
    // Wait for authentication to complete and profile to appear
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="profile-image"]', { timeout: 10000 }).should('be.visible');
    
    // Navigate to the chat page
    cy.get('[data-testid="nav-chat"]').click();
    
    // Verify we're on the chat page
    cy.url().should('include', '/chat');
    cy.get('[data-testid="chat-page"]').should('be.visible');
  });
  
  it('should display the chat interface with correct initial state', () => {
    // Verify UI elements are present
    cy.contains('h2', 'Live Chat').should('be.visible');
    cy.get('.status-indicator').should('be.visible');
    cy.get('.chat-messages').should('be.visible');
    cy.get('.chat-input').should('be.visible');
    
    // Check for empty state - use a more flexible approach
    cy.get('.chat-messages').then($messages => {
      // Either there should be a specific empty state element
      // OR the messages container should be empty or contain only a placeholder
      if ($messages.find('.empty-messages').length > 0) {
        // If the empty-messages element exists, assert on it
        cy.get('.empty-messages').should('be.visible')
          .and('contain.text', 'No messages');
      } else {
        // Otherwise, check if the messages container is empty or has default content
        const hasMessages = $messages.find('.message').length > 0;
        if (!hasMessages) {
          // No messages, which is expected for initial state
          cy.log('Empty chat state confirmed - no message elements found');
        } else {
          // Check if there's just a welcome/system message
          const isOnlySystemMessage = $messages.find('.system-message, .welcome-message').length > 0 && 
                                     $messages.find('.message:not(.system-message):not(.welcome-message)').length === 0;
          if (isOnlySystemMessage) {
            cy.log('Found only system/welcome messages, which is acceptable for initial state');
          } else {
            // There are actual messages, which is unexpected
            throw new Error('Expected empty chat state but found messages');
          }
        }
      }
    });
    
    // Input should be enabled once connection is established
    cy.get('.status-connected', { timeout: 10000 }).should('exist');
    cy.get('.chat-input input').should('be.enabled');
    cy.get('.chat-input button').should('be.disabled'); // Button disabled until text entered
  });
  
  it('should allow sending and receiving messages', () => {
    // Wait for connection to be established
    cy.get('.status-connected', { timeout: 10000 }).should('exist');
    
    // Type a message
    const testMessage = 'Hello from Cypress test';
    cy.get('.chat-input input').type(testMessage);
    
    // Send button should be enabled
    cy.get('.chat-input button').should('be.enabled');
    
    // Send the message
    cy.get('.chat-input button').click();
    
    // Input should be cleared after sending
    cy.get('.chat-input input').should('have.value', '');
    
    // Message should appear in chat (both sent and echo from server)
    cy.get('.message').should('have.length.at.least', 1);
    
    // Check that our message is in the sent message
    cy.contains('.message', testMessage).should('be.visible');
    
    // Server should echo the message back
    cy.contains('.message', 'You sent:').should('be.visible');
  });
  
  it('should handle disconnection and reconnection', () => {
    // Wait for initial connection
    cy.get('.status-connected', { timeout: 10000 }).should('exist');
    
    // Navigate away to break connection
    cy.get('[data-testid="nav-home"]').click();
    
    // Navigate back to chat page
    cy.get('[data-testid="nav-chat"]').click();
    
    // Should reconnect automatically
    cy.get('.status-connected', { timeout: 10000 }).should('exist');
    
    // Verify we can still send messages
    const reconnectMessage = 'Message after reconnection';
    cy.get('.chat-input input').type(reconnectMessage);
    cy.get('.chat-input button').click();
    
    // Message should appear in the chat
    cy.contains('.message', reconnectMessage).should('be.visible');
  });
});