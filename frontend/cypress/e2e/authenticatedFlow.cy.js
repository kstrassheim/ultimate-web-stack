describe('Authenticated flow', () => {
    beforeEach(() => {
      cy.msalLogin();
    });
    
    it('should show authenticated content', () => {
      cy.visit('/');
      cy.contains('Welcome, test@example.com').should('be.visible');
    });
  });