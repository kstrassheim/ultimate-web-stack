// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
// ***********************************************************

// Import commands.js using ES2015 syntax:
// import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')
// Import commands.js using ES2015 syntax:
import 'cypress-wait-until';
import './msalMock';
// Example of global behavior modification
Cypress.on('uncaught:exception', (err, runnable) => {
    // returning false here prevents Cypress from
    // failing the test on uncaught exceptions
    return false
  })
  
  // Example of adding custom command
  // Cypress.Commands.add('login', (email, password) => {
  //   cy.visit('/login')
  //   cy.get('#email').type(email)
  //   cy.get('#password').type(password)
  //   cy.get('form').submit()
  // })