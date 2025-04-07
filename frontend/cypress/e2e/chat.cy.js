describe('Chat Page Functionality', () => {
  
  beforeEach(() => {
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
    
    // Initially should show no messages
    cy.get('.empty-messages').should('be.visible')
      .and('contain.text', 'No messages yet');
    
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