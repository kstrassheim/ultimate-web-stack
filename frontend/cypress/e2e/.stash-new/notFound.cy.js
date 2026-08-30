/**
 * End-to-end coverage for the catch-all `*` route in App.jsx, which
 * renders `src/pages/404.jsx` (the "404 — NotFound page" component).
 *
 * What this exercises:
 *   - The `path="*"` branch in App.jsx (the route table fall-through).
 *   - `src/pages/404.jsx` end-to-end (the `<h1>404</h1>` heading and
 *     the "Goto Home" link).
 *   - The 404 page's `appInsights.trackEvent({ name: '404 - NotFound page' })`
 *     call (covered by the unit test for 404.jsx).
 *   - The behaviour the user can observe: navigating to a route that
 *     does not exist lands them on the 404 page, and the home link
 *     brings them back to the public welcome page.
 *
 * Existing coverage reaches `404.jsx` accidentally through the
 * sessionExpiry.cy.js suite (where the app briefly lands on the 404
 * page after a recovery round-trip in some failure paths). This spec
 * makes the behaviour explicit so the 100% coverage on 404.jsx is not
 * held together by side effects.
 */
describe('Unknown route → 404 page', () => {
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

  it('renders the 404 page for an unknown path', () => {
    // Pick a route the app definitely does not register. The router's
    // catch-all path="*" hands off to <NotFound />.
    cy.visit('/this-route-does-not-exist', { failOnStatusCode: false });

    // The 404 page mounts. The 404 component sets a data-testid we
    // can grab.
    cy.get('[data-testid="not-found-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="not-found-heading"]').should('have.text', '404');
  });

  it('offers a link back to Home that navigates to /', () => {
    cy.visit('/totally-unknown', { failOnStatusCode: false });
    cy.get('[data-testid="not-found-page"]', { timeout: 10000 }).should('be.visible');

    // Click the home link. Public routes work without auth, so the
    // user lands back on the welcome page.
    cy.get('[data-testid="not-found-home-link"]').click();
    cy.url().should('not.include', '/this-route-does-not-exist');
    cy.url().should('not.include', '/totally-unknown');
    // The home page renders. The Home component sets data-testid="home-page".
    cy.get('[data-testid="home-page"]', { timeout: 10000 }).should('be.visible');
  });
});
