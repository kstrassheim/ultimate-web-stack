describe('Authenticated flow', () => {
    beforeEach(() => {
      cy.msalLogin();
      cy.visit('/');
    });
    
    it('should show authenticated content', () => {
      cy.visit('/');
      cy.contains('Welcome, test@example.com').should('be.visible');
    });
  });