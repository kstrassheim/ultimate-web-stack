/**
 * End-to-end coverage for the role-aware "Access Denied" landing page
 * (issue #86 follow-up, and the broader role-based access story).
 *
 * The existing navigation.cy.js covers the "no role at all → go to
 * /access-denied" path, which exercises the `requiredRoles.length === 0`
 * branch of `AccessDenied.jsx` (the "you do not have permission to
 * view this page / please sign in for access" copy). What was missing:
 *
 *   - The "logged in but missing the required role" path: an
 *     authenticated non-admin user (e.g. Mayuri) navigating to
 *     `/experiments` triggers `ProtectedRoute` → redirects to
 *     `/access-denied` WITH `state.requiredRoles = ['Admin']`. The
 *     AccessDenied component then renders the *other* branch — the
 *     role-message variant that lists the missing role names.
 *
 *   - That branch also lights up:
 *     - `ProtectedRoute.jsx` — the `!hasAllRoles(requiredRoles)` path
 *       (currently 71% statements, 0% branches in the partial
 *       coverage — the branch coverage is exactly what's missing).
 *     - `ProtectedLink.jsx` — the admin-only Experiments nav link is
 *       absent from the DOM for non-admin users, which together with
 *       the above exercises `hasAllRoles` returning false.
 *
 *   - The "required-roles message lists the role the user actually
 *     lacks" assertion: the rendered `Required roles:` text must
 *     contain "Admin" for an Admin-gated page, both as data on screen
 *     and as the source of truth for the user-visible denial
 *     explanation.
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
    // Sign in as a non-admin mock account. Mayuri has idTokenClaims.roles = []
    // so the admin-only /experiments route must deny her.
    cy.setMockRole('User');

    cy.visit('/');

    cy.get('[data-testid="sign-in-button"]').should('be.visible').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    // The admin-only Experiments nav link must NOT be in the DOM for a
    // non-admin user (this is the ProtectedLink deny branch — a
    // user with empty roles is not allowed to render the children).
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
    // branch of ProtectedRoute.jsx that's at 0% branch coverage
    // today.
    cy.visit('/experiments', { failOnStatusCode: false });

    // URL is /access-denied (the redirect target).
    cy.url().should('include', '/access-denied');

    // The role-aware variant of the page is rendered:
    //   - "You do not have permission to view this section." is shown
    //   - "Required roles: Admin" is shown
    //   - The "please sign in" copy (the no-roles branch) is NOT shown
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