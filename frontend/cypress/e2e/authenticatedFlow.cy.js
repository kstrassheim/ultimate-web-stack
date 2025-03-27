import { setMockRole } from '../support/msalMock';

describe('Authenticated flow', () => {
    beforeEach(() => {
      cy.setMockRole('Admin');
    });
    
    it('should show authenticated content', () => {
      cy.visit('/');
      cy.contains('Welcome, test@example.com').should('be.visible');
    });
  });