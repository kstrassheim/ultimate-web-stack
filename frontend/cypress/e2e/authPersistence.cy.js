describe('Authentication Persistence', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });

  it('retains the authenticated session after a full page reload', () => {
    cy.setMockRole('Admin');

    cy.visit('/');

    cy.get('[data-testid="sign-in-button"]').should('be.visible').click();

    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('exist');
    cy.get('[data-testid="profile-dropdown"]').should('exist');

    cy.reload();

    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('exist');
    cy.get('[data-testid="profile-dropdown"]').should('be.visible');
    cy.get('[data-testid="unauthenticated-container"]').should('not.exist');

    cy.get('[data-testid="profile-dropdown"]').click();
    cy.get('[data-testid="role-badge-Admin"]').should('be.visible');
  });
});
