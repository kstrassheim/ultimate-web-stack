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
import '@cypress/code-coverage/support';

// Example of global behavior modification
Cypress.on('uncaught:exception', (err, runnable) => {
  // returning false here prevents Cypress from
  // failing the test on uncaught exceptions
  return false
});

// For tasks, define them in cypress.config.js instead of here
// Do NOT use Cypress.on('task', {...}) in this file