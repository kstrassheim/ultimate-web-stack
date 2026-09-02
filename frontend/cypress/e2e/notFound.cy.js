/**
 * End-to-end coverage of the 404 page — issue #149.
 *
 * The router registers `<Route path="*" element={<NotFound />} />` as
 * the catch-all, so any unknown URL renders src/pages/404.jsx. Before
 * this spec no e2e test navigated to a non-existent route, which left
 * the `NotFound` component (and its `appInsights.trackEvent` call) at
 * 0% function coverage from the browser side.
 *
 * The component is intentionally tiny — there is exactly one assertion
 * per observable element plus the "click the link and land on /"
 * happy path. No negative assertions (e.g. asserting the dashboard is
 * NOT visible) — the not-found page's identity is the URL itself.
 */

describe('404 — unknown route (issue #149)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });
  });

  it('renders the not-found page for an unknown route', () => {
    // Visit a route that is not registered in App.jsx. The router's
    // catch-all Route renders <NotFound />.
    cy.visit('/this-route-does-not-exist');

    // The 404 page is the user-visible signal that the route was not
    // recognised. Assert on its container, heading, and the link back
    // to the home page so each observable element of the component
    // is covered at least once.
    cy.get('[data-testid="not-found-page"]', { timeout: 10000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="not-found-heading"]').should(
      'be.visible',
    );
    cy.get('[data-testid="not-found-home-link"]').should('be.visible');
  });

  it('the not-found page returns to home when the home link is clicked', () => {
    // The "Goto Home" link is a react-router <Link to='/'> that
    // navigates back to the public home page. Driving it from the
    // not-found state exercises the same router boundary in the other
    // direction — the catch-all's child element must dispatch a real
    // navigation, not a hash-only or anchor scroll.
    cy.visit('/another-missing-page');
    cy.get('[data-testid="not-found-page"]', { timeout: 10000 }).should(
      'be.visible',
    );

    cy.get('[data-testid="not-found-home-link"]').click();
    cy.url({ timeout: 10000 }).should('satisfy', (url) => {
      // The home route is `/`; either the bare root or with a trailing
      // slash is acceptable. The not-found URL must be gone.
      const path = new URL(url).pathname;
      return path === '/' || path === '';
    });
    cy.get('[data-testid="home-page"]', { timeout: 10000 }).should(
      'be.visible',
    );
  });
});