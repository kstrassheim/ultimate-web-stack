/**
 * End-to-end coverage for the access-control surfaces — issue #149.
 *
 * The /dashboard, /chat, and /experiments routes are wrapped in
 * `<ProtectedRoute requiredRoles={…}>`. The same `<ProtectedLink>` is
 * used inside the navbar to hide the experiments link for users who
 * lack the Admin role. The component-level branches that the unit
 * suite already covers in jsdom (`!account`, `!hasAllRoles(...)`,
 * `requiredRoles.length === 0`, `showIfUnauthenticated` toggles)
 * are reachable from a real browser too — but only this spec drives
 * them through the real router, MSAL mock, and Navigate-state plumbing
 * that production users go through.
 *
 * Why this is a separate spec (rather than extra `it()` blocks in
 * navigation.cy.js): the existing navigation tests stop at the first
 * assertion that proves the navigation entry works; they don't go on
 * to assert what the redirected landing page actually contains. We
 * need both halves of the contract — "where did we land" and "what
 * does the landing page tell the user" — to drive the denied-branch
 * coverage in `AccessDenied.jsx`, `ProtectedRoute.jsx`, and
 * `ProtectedLink.jsx`.
 */

describe('Access control — denied branches and role-aware UI', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    // Reset localStorage + sessionStorage so every spec starts from
    // a known-clean state. The MSAL mock persists account id and
    // auth state under its own keys; the theme-mode entry is also
    // covered, but it doesn't affect the access-control branches
    // we're exercising here — clearing it is just hygiene.
    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });

  describe('ProtectedRoute — no active account', () => {
    it('redirects unauthenticated visitors from /dashboard to /access-denied', () => {
      // Force the MSAL mock into an explicitly-signed-out state and
      // visit the protected route directly (rather than via the
      // navbar, which only shows the link to signed-in users). This
      // is the literal "no account, hasAllRoles is moot, ProtectedRoute
      // returns the Navigate-with-replace branch" path.
      cy.visit('/dashboard');

      // We end up on the access-denied page with the "no specific
      // roles required" message (because the dashboard's
      // requiredRoles=[] is forwarded into location.state via the
      // Navigate component, and requiredRoles.length is therefore 0).
      cy.url({ timeout: 10000 }).should('include', '/access-denied');
      cy.get('[data-testid="access-denied-page"]').should('be.visible');
      cy.get('[data-testid="access-denied-heading"]').should(
        'contain',
        'Access Denied',
      );
      // The "no specific roles" branch of AccessDenied.jsx — not the
      // one driven by the experiments route below.
      cy.get('[data-testid="access-denied-login-message"]').should(
        'be.visible',
      );
      cy.get('[data-testid="access-denied-signin-prompt"]').should(
        'be.visible',
      );
      // The role-required branch must NOT render in this scenario.
      cy.get('[data-testid="access-denied-required-roles"]').should(
        'not.exist',
      );
    });

    it('redirects unauthenticated visitors from /chat to /access-denied', () => {
      // /chat is wrapped with the same empty-requiredRoles guard, so
      // it follows the same shape as /dashboard but exercises a
      // distinct code path (the second ProtectedRoute in App.jsx).
      cy.visit('/chat');
      cy.url({ timeout: 10000 }).should('include', '/access-denied');
      cy.get('[data-testid="access-denied-page"]').should('be.visible');
      cy.get('[data-testid="access-denied-login-message"]').should(
        'be.visible',
      );
    });
  });

  describe('ProtectedRoute — authenticated but lacks required role', () => {
    it('redirects a non-admin user from /experiments to /access-denied with the role-required message', () => {
      // The MOCKROLE localStorage entry drives which mock account the
      // MSAL instance selects on the next page load (see
      // mock/azureMsalBrowser.js::_getInitialActiveAccountIndex).
      // "User" picks an account whose idTokenClaims.roles is empty,
      // which exercises the hasAllRoles(["Admin"]) === false path in
      // ProtectedRoute and the requiredRoles.length > 0 branch in
      // AccessDenied.jsx.
      cy.setMockRole('User');

      cy.visit('/');
      cy.get('[data-testid="unauthenticated-container"]').should(
        'be.visible',
      );
      cy.get('[data-testid="sign-in-button"]').click();
      cy.get('[data-testid="authenticated-container"]').should(
        'be.visible',
      );

      // Drive the protected route directly (avoids relying on
      // ProtectedLink rendering for a non-admin — a separate assertion
      // below covers that path).
      cy.visit('/experiments');
      cy.url({ timeout: 10000 }).should('include', '/access-denied');

      // The "you lack a specific role" branch of AccessDenied must
      // render here — this is the half of the AccessDenied.jsx branch
      // table that is not exercised by the unauthenticated cases.
      cy.get('[data-testid="access-denied-page"]').should('be.visible');
      cy.get('[data-testid="access-denied-role-message"]').should(
        'be.visible',
      );
      cy.get('[data-testid="access-denied-required-roles"]').should(
        'be.visible',
      );
      // The required-roles line should mention "Admin" because that's
      // what the experiments route gates on.
      cy.get('[data-testid="access-denied-required-roles"]').should(
        'contain',
        'Admin',
      );

      // The "please sign in" branch must NOT render when the user IS
      // authenticated (just lacking the role).
      cy.get('[data-testid="access-denied-login-message"]').should(
        'not.exist',
      );
      cy.get('[data-testid="access-denied-signin-prompt"]').should(
        'not.exist',
      );
    });
  });

  describe('ProtectedLink — role-aware navbar', () => {
    it('hides the Experiments link for a non-admin user', () => {
      cy.setMockRole('User');
      cy.visit('/');
      cy.get('[data-testid="sign-in-button"]').click();
      cy.get('[data-testid="authenticated-container"]').should(
        'be.visible',
      );

      // The experiments link is wrapped in <ProtectedLink
      // requiredRoles={["Admin"]}>, which gates on
      // hasAllRoles(["Admin"]). The non-admin user must not see it.
      cy.get('[data-testid="nav-experiments"]').should('not.exist');

      // Other public nav links are unaffected.
      cy.get('[data-testid="nav-home"]').should('be.visible');
      cy.get('[data-testid="nav-dashboard"]').should('be.visible');
      cy.get('[data-testid="nav-settings"]').should('be.visible');
    });

    it('shows the Experiments link for an admin user', () => {
      // Counterpart of the above — proves the showIfUnauthenticated
      // is NOT in play here and the hasAllRoles gate is the actual
      // discriminator. Without this assertion the negated branch in
      // the previous spec could pass for the wrong reason (e.g. the
      // link being broken for everyone).
      cy.setMockRole('Admin');
      cy.visit('/');
      cy.get('[data-testid="sign-in-button"]').click();
      cy.get('[data-testid="authenticated-container"]').should(
        'be.visible',
      );

      cy.get('[data-testid="nav-experiments"]').should('be.visible');

      // The admin can actually navigate to the experiments page
      // without bouncing off /access-denied. ProtectedLink only
      // controls visibility — the route is still wrapped in its own
      // ProtectedRoute, so this exercises both halves of the contract.
      cy.get('[data-testid="nav-experiments"]').click();
      cy.url({ timeout: 10000 }).should('include', '/experiments');
      cy.url().should('not.include', '/access-denied');
      cy.get('[data-testid="experiments-heading"]', { timeout: 10000 })
        .should('be.visible')
        .and('contain', 'Future Gadget Lab Experiments');
    });

    it('hides the Experiments link for an unauthenticated visitor', () => {
      // No MSAL setMockRole — defaults to an unauthenticated state.
      // The Experiments nav link is wrapped in ProtectedLink without
      // showIfUnauthenticated, so an unauthenticated visitor must NOT
      // see it. This is the showIfUnauthenticated === undefined branch
      // in ProtectedLink.jsx.
      cy.visit('/');
      cy.get('[data-testid="main-navigation"]').should('be.visible');

      cy.get('[data-testid="nav-experiments"]').should('not.exist');
    });
  });
});