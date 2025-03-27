Cypress.Commands.add('setMockRole', (mockRole) => {
    localStorage.setItem('MOCKROLE', mockRole);
  });