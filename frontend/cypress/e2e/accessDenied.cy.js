/**
 * End-to-end coverage for the role-aware "Access Denied" landing page
 * and the deny branches of `ProtectedRoute` + `ProtectedLink`.
 *
 * Three distinct paths land users on `/access-denied`:
 *
 *   1. **No account at all** → ProtectedRoute's `!account` branch
 *      redirects to `/access-denied` WITHOUT `state.requiredRoles`.
 *      AccessDenied renders the "please sign in for access" copy.
 *      Already covered by `navigation.cy.js` (clicking Dashboard while
 *      signed-out).
 *
 *   2. **Authenticated but missing the required role** →
 *      ProtectedRoute's `!hasAllRoles(requiredRoles)` branch
 *      redirects to `/access-denied` WITH
 *      `state.requiredRoles = ["Admin"]`. AccessDenied renders the
 *      role-message variant that lists the missing role names. This
 *      is the under-covered path: the existing e2e suite does not
 *      reach it.
 *
 *   3. **Anonymous direct visit** → renders the "please sign in"
 *      copy even though there's no state. Regression guard.
 *
 * What this exercises:
 *   - AccessDenied.jsx, both the role-aware (`requiredRoles.length > 0`)
 *     and the no-roles branches.
 *   - ProtectedRoute.jsx — the `!hasAllRoles(requiredRoles)` branch
 *     (currently 0% branch coverage in e2e) plus the `redirectPath`
 *     `sessionStorage.setItem` side-effect.
 *   - ProtectedLink.jsx — the `hasAllRoles(requiredRoles)` returning
 *     false path that hides the admin-only "Experiments" link.
 */

describe('Access denied with required roles (non-admin → /experiments)', () => {
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

  it('non-admin user sees the role-aware access-denied page when visiting /experiments', () => {
    // Sign in as a non-admin mock account. Mayuri (default for
    // setMockRole('User')) has idTokenClaims.roles = [] so the
    // admin-only /experiments route must deny her.
    cy.setMockRole('User');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').should('be.visible').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    // The admin-only Experiments nav link must NOT be in the DOM for a
    // non-admin user (this is the ProtectedLink deny branch — a user
    // with empty roles is not allowed to render the children).
    cy.get('[data-testid="nav-experiments"]').should('not.exist');

    // Profile dropdown must show the "None" role badge — confirms the
    // mock auth context returned an empty roles array.
    cy.get('[data-testid="profile-image"]').click();
    cy.get('[data-testid="role-badge-none"]').should('be.visible');

    // Close the dropdown so it doesn't sit over the page during the
    // direct-navigation step below.
    cy.get('body').type('{esc}');

    // Direct navigation to the admin-gated route must be denied. The
    // ProtectedRoute component (route definition in App.jsx:
    // <ProtectedRoute requiredRoles={["Admin"]}> ... </ProtectedRoute>)
    // runs `hasAllRoles(["Admin"])` against Mayuri's empty roles
    // array, returns false, and redirects to /access-denied with
    // state.requiredRoles = ["Admin"]. This is the !hasAllRoles
    // branch of ProtectedRoute.jsx that's at 0% branch coverage.
    cy.visit('/experiments', { failOnStatusCode: false });

    // URL is /access-denied (the redirect target).
    cy.url().should('include', '/access-denied');

    // The role-aware variant of the page is rendered.
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-heading"]').should('contain', 'Access Denied');
    cy.get('[data-testid="access-denied-role-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-role-message"]').should(
      'contain.text',
      'permission',
    );
    cy.get('[data-testid="access-denied-required-roles"]').should('be.visible');
    cy.get('[data-testid="access-denied-required-roles"]').should('contain', 'Admin');

    // The login-prompt variant is not rendered when requiredRoles is
    // non-empty — that's the else-branch in AccessDenied.jsx.
    cy.get('[data-testid="access-denied-login-message"]').should('not.exist');
    cy.get('[data-testid="access-denied-signin-prompt"]').should('not.exist');
  });

  it('admin user can reach /experiments (regression: same route, allowed branch)', () => {
    // Same /experiments route, but as Admin — this is the positive
    // branch of the same ProtectedRoute.hasAllRoles() check, included
    // here so a future change that breaks the allow-side surfaces
    // alongside the deny-side spec.
    cy.setMockRole('Admin');

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    // The Experiments link is now visible (ProtectedLink with
    // hasAllRoles(['Admin']) returned true).
    cy.get('[data-testid="nav-experiments"]').should('be.visible');

    cy.visit('/experiments');
    cy.get('[data-testid="experiments-page"]').should('be.visible');
    cy.url().should('include', '/experiments');
    cy.url().should('not.include', '/access-denied');
  });

  it('the no-required-roles branch still uses the "please sign in" copy', () => {
    // Regression guard: the no-requiredRoles branch (a user just
    // hitting /access-denied directly with no state, or being
    // redirected there without required-roles data) must still show
    // the sign-in prompt — not the role-list variant.
    cy.visit('/');

    // Click Dashboard while signed-out. App.jsx wraps Dashboard in
    // <ProtectedRoute requiredRoles={[]}> — no roles are required to
    // view it, but account must exist. The "no account" branch in
    // ProtectedRoute redirects to /access-denied with NO
    // state.requiredRoles set, which exercises the
    // `requiredRoles.length === 0` branch of AccessDenied.jsx.
    cy.get('[data-testid="nav-dashboard"]').click();

    cy.url().should('include', '/access-denied');
    cy.get('[data-testid="access-denied-page"]').should('be.visible');
    cy.get('[data-testid="access-denied-login-message"]').should('be.visible');
    cy.get('[data-testid="access-denied-signin-prompt"]').should('be.visible');

    // The role-list variant must NOT be rendered for an unauthenticated
    // bounce — there's no role to tell the user about, just "sign in".
    cy.get('[data-testid="access-denied-role-message"]').should('not.exist');
    cy.get('[data-testid="access-denied-required-roles"]').should('not.exist');
  });
});