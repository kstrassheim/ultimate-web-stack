describe('Debug groups', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });

  const setGroupsOverride = (groups) => {
    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_GROUPS_OVERRIDE', JSON.stringify(groups));
    });
  };

  it('empty state', () => {
    setGroupsOverride([]);
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');

    cy.wait(2000).then(() => {
      cy.window().then((win) => {
        const override = win.localStorage.getItem('MOCK_GROUPS_OVERRIDE');
        console.log('MOCK_GROUPS_OVERRIDE after dashboard load:', override);
      });
    });
  });
});
